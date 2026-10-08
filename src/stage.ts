import { GameEffects } from './scene/game';
import { cameraPosition, defaultCamera, type Tilemap } from './scene/world';
import { paintBuiltinCostume, paintBuiltinBackdrop } from './scene/assets';
import type { DrawCommand } from './runtime/protocol';
import { bounds, builtins, emptyScene, type SceneState, type SceneCommand, type SpriteState, type Bubble, type InkCommand } from './scene/model';
import { effectNames, effectPixels, type Effects } from './scene/effects';
import { PixelSensing, type PixelImage } from './scene/sensing';

export async function validateSceneImages(scene: SceneState) {
  await Promise.all([...scene.assets, ...(scene.backdrops ?? [])].map(a => new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => image.naturalWidth === a.width && image.naturalHeight === a.height ? resolve() : reject(new Error('Costume dimensions do not match the image.'));
    image.onerror = () => reject(new Error(`Costume “${a.name}” is not a readable PNG image.`)); image.src = a.data;
  })));
}

export class Stage {
  private commands: DrawCommand[] = [];
  private readonly context: CanvasRenderingContext2D;
  private scene = emptyScene();
  private sprites = new Map<string, SpriteState>();
  private images = new Map<string, HTMLImageElement>();
  private bubbles = new Map<string, Bubble>();
  private readonly ink = document.createElement('canvas');
  private pendingInk: InkCommand[] = [];
  private inkCount = 0;
  private inkFrame = 0;
  private filtered = new Map<string, HTMLCanvasElement>();
  private pixelImages = new Map<string, PixelImage>();
  private sensing = new PixelSensing(id => {
    const found = this.pixelImages.get(id); if (found) return found;
    const asset = [...builtins, ...this.scene.assets].find(a => a.id === id); if (!asset) return;
    const image = this.images.get(id); if (image && (!image.complete || !image.naturalWidth)) return;
    const canvas = document.createElement('canvas'); canvas.width = asset.width; canvas.height = asset.height; const ctx = canvas.getContext('2d')!;
    if (image) ctx.drawImage(image, 0, 0); else { ctx.translate(asset.width / 2, asset.height / 2); paintBuiltinCostume(ctx, id); }
    const pixels = { width: asset.width, height: asset.height, data: ctx.getImageData(0, 0, asset.width, asset.height).data }; this.pixelImages.set(id, pixels); return pixels;
  });
  selected: string | null = null;
  onReset: () => void = () => {};
  private camera = { x: 0, y: 0 };
  private tilemap?: Tilemap;
  private gameEffects = new GameEffects();
  private effectFrame = 0;
  private readonly viewportObserver: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser does not support a drawing canvas.');
    this.context = context;
    // Viewport resizing ends bursts so no transient frames from the old
    // geometry survive underneath the newly positioned HTML presentation.
    this.viewportObserver = new ResizeObserver(() => { this.clearGameEffects(); this.paint(); });
    this.viewportObserver.observe(canvas);
    this.ink.width = 480; this.ink.height = 320;
    this.paint();
  }

  reset(scene = emptyScene()) {
    this.onReset();
    this.clearGameEffects();
    this.commands = []; this.scene = structuredClone(scene); this.sprites = new Map(scene.sprites.filter(s => !s.world || s.world === scene.world).map(s => [s.id, { ...s }]));
    this.loadWorld(scene.world ?? null);
    this.images.clear(); this.bubbles.clear(); this.filtered.clear(); this.pixelImages.clear(); this.sensing.reset(); this.clearInk(); this.inkCount = 0;
    for (const asset of [...scene.assets, ...(scene.backdrops ?? [])]) { const image = new Image(); image.onload = () => this.paint(); image.src = asset.data; this.images.set(asset.id, image); }
    this.paint();
  }

  getSprite(id: string) { const sprite = this.sprites.get(id); return sprite && { ...sprite }; }
  previewCamera(x: number, y: number) { this.camera = cameraPosition({x,y,clamp:true}, this.tilemap); this.paint(); }
  dialogue() { return [...this.bubbles].filter(([id, b]) => this.sprites.get(id)?.visible && b.text).map(([id, b]) => `${this.sprites.get(id)!.name} ${b.style === 'think' ? 'thinks' : 'says'}: ${b.text}`).join('\n'); }
  previewPosition(id: string, x: number, y: number) { const s = this.sprites.get(id); if (s) { s.x = x; s.y = y; this.paint(); } }
  acceptScene(command: SceneCommand) {
    if (command.type === 'game') return;
    if (command.type === 'game_effect') this.gameEffects.add(command);
    else if (command.type === 'game_effect_clear') this.clearGameEffects();
    else if (command.type === 'world') { this.clearGameEffects(); this.loadWorld(command.id); }
    else if (command.type === 'camera') this.camera = { x: command.x, y: command.y };
    else if (command.type === 'tile') { const m = this.tilemap; if (m && command.column < m.columns && command.row < m.rows) { const i = command.row * m.columns + command.column; m.tiles[i] = command.costume; m.walls[i] = command.solid; } }
    else if (command.type === 'sprite') this.sprites.set(command.sprite.id, { ...command.sprite });
    else if (command.type === 'delete') { this.sprites.delete(command.id); this.bubbles.delete(command.id); }
    else if (command.type === 'bubble') { if (command.text) this.bubbles.set(command.id, { text: command.text, style: command.style }); else this.bubbles.delete(command.id); }
    else if (command.type === 'backdrop') this.scene.backdrop = command.id;
    else if (command.type === 'effects') this.scene.effects = { ...command.effects };
    else if (command.type === 'pen_clear') this.clearInk();
    else if (command.type === 'pen_line' || command.type === 'stamp') this.queueInk(command);
    else this.scene.background = command.color;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: this.camera.x + Math.max(-240, Math.min(240, (clientX - rect.left) * 480 / rect.width - 240)), y: this.camera.y + Math.max(-160, Math.min(160, 160 - (clientY - rect.top) * 320 / rect.height)) };
  }
  hit(x: number, y: number) {
    return [...this.sprites.values()].sort((a, b) => b.layer - a.layer || [...this.sprites.keys()].indexOf(b.id) - [...this.sprites.keys()].indexOf(a.id)).find(s => {
      return this.sensing.point(s, x, y, true);
    });
  }

  accept(command: DrawCommand) {
    if (this.commands.length >= 10_000) return;
    this.commands.push(command);
    if (command.type === 'move' && command.draw) this.queueInk({ ...command, type: 'pen_line', width: 3, opacity: 100 });
  }

  private clearInk() { cancelAnimationFrame(this.inkFrame); this.inkFrame = 0; this.pendingInk = []; this.ink.getContext('2d')!.clearRect(0, 0, this.ink.width, this.ink.height); }
  clearGameEffects() { cancelAnimationFrame(this.effectFrame); this.effectFrame = 0; this.gameEffects.clear(); }
  dispose() { this.viewportObserver.disconnect(); cancelAnimationFrame(this.inkFrame); this.clearGameEffects(); }
  private queueInk(command: InkCommand) {
    // Independent native limits allow 10,000 turtle commands and 10,000 sprite marks.
    if (this.inkCount >= 20_000) return;
    this.inkCount++; this.pendingInk.push(structuredClone(command));
  }
  private drainInk() {
    const ctx = this.ink.getContext('2d')!, started = performance.now(); let consumed = 0;
    for (const command of this.pendingInk) {
      if (command.type === 'stamp') { if (!this.paintSprite(command.sprite, ctx, false)) break; }
      else {
        ctx.save(); ctx.globalAlpha = command.opacity / 100; ctx.strokeStyle = ctx.fillStyle = command.color; ctx.lineWidth = command.width; ctx.lineCap = 'round';
        ctx.beginPath();
        if (command.x1 === command.x2 && command.y1 === command.y2) { ctx.arc(240 + command.x1, 160 - command.y1, command.width / 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.moveTo(240 + command.x1, 160 - command.y1); ctx.lineTo(240 + command.x2, 160 - command.y2); ctx.stroke(); }
        ctx.restore();
      }
      consumed++;
      if (consumed >= 128 || performance.now() - started > 6) break;
    }
    this.pendingInk.splice(0, consumed);
    if (this.pendingInk.length && consumed && !this.inkFrame) this.inkFrame = requestAnimationFrame(() => { this.inkFrame = 0; this.paint(); });
  }
  private effectImage(key: string, width: number, height: number, effects: Effects, draw: (ctx: CanvasRenderingContext2D) => void) {
    key += ':' + effectNames.map(name => effects[name] ?? 0).join(',');
    let canvas = this.filtered.get(key);
    if (canvas) { this.filtered.delete(key); this.filtered.set(key, canvas); return canvas; }
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!; draw(ctx);
    ctx.putImageData(new ImageData(effectPixels(ctx.getImageData(0, 0, width, height).data, width, height, effects), width, height), 0, 0);
    this.filtered.set(key, canvas);
    if (this.filtered.size > 16) this.filtered.delete(this.filtered.keys().next().value!);
    return canvas;
  }

  private loadWorld(id: string | null) {
    this.scene.world = id;
    const world = this.scene.worlds?.find(w => w.id === id);
    this.tilemap = world ? structuredClone(world.map) : undefined;
    if (world) { this.scene.background = world.background; this.scene.backdrop = world.backdrop; }
    const profile = world?.camera ?? this.scene.camera ?? defaultCamera();
    this.camera = cameraPosition(profile, this.tilemap, this.sprites.get(profile.follow ?? ''));
    this.ink.width = this.tilemap ? this.tilemap.columns * this.tilemap.tileSize : 480;
    this.ink.height = this.tilemap ? this.tilemap.rows * this.tilemap.tileSize : 320;
    this.clearInk();
  }
  private paintTiles() {
    const m = this.tilemap; if (!m) return;
    const ctx = this.context, size = m.tileSize; ctx.save(); ctx.imageSmoothingEnabled = false;
    const c0 = Math.max(0, Math.floor(this.camera.x / size)), c1 = Math.min(m.columns, Math.ceil((this.camera.x + 480) / size));
    const r0 = Math.max(0, Math.floor(-this.camera.y / size)), r1 = Math.min(m.rows, Math.ceil((320 - this.camera.y) / size));
    for (let row = r0; row < r1; row++) for (let column = c0; column < c1; column++) {
      const costume = m.tiles[row * m.columns + column]; if (!costume) continue;
      const x = column * size - this.camera.x, y = row * size + this.camera.y;
      const image = this.images.get(costume);
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, x, y, size, size);
      else if (!image) {
        const asset = builtins.find(a => a.id === costume); if (!asset) continue;
        ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.scale(size / asset.width, size / asset.height); paintBuiltinCostume(ctx, costume); ctx.restore();
      }
    }
    ctx.restore();
  }

  private paintBackground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.scene.background; ctx.fillRect(0, 0, 480, 320);
    if (this.scene.backdrop) {
      const image = this.images.get(this.scene.backdrop);
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, 480, 320);
      else paintBuiltinBackdrop(ctx, this.scene.backdrop);
    } else {
      ctx.fillStyle = '#d9dfd5';
      for (let x = 0; x < 480; x += 20) for (let y = 0; y < 320; y += 20) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  paint() {
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    const effects = this.scene.effects ?? {}, background = this.images.get(this.scene.backdrop ?? '');
    if (Object.values(effects).some(Boolean) && (!background || background.complete && background.naturalWidth)) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
      ctx.drawImage(this.effectImage(`stage:${this.scene.background}:${this.scene.backdrop ?? ''}`, 480, 320, effects, c => this.paintBackground(c)), 0, 0);
    } else this.paintBackground(ctx);
    this.paintTiles();
    this.drainInk(); ctx.drawImage(this.ink, -this.camera.x, this.camera.y);
    ctx.save();
    ctx.translate(width / 2 - this.camera.x, height / 2 + this.camera.y);
    let x = 0, y = 0, heading = 0;
    for (const command of this.commands) {
      if (command.type === 'turn') { heading = command.heading; continue; }
      x = command.x2; y = command.y2;
    }
    if (!this.sprites.size || this.commands.length) {
      ctx.translate(x, -y); ctx.rotate(heading * Math.PI / 180);
      ctx.fillStyle = '#e47d4b'; ctx.strokeStyle = '#fdfdf9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-8, -7); ctx.lineTo(-5, 0); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.translate(-this.camera.x, this.camera.y);
    for (const sprite of [...this.sprites.values()].sort((a, b) => a.layer - b.layer)) if (sprite.visible) this.paintSprite(sprite);
    ctx.restore();
    for (const [id, bubble] of this.bubbles) { const sprite = this.sprites.get(id); if (sprite?.visible) this.paintBubble(sprite, bubble); }
    if (this.gameEffects.paint(ctx, this.camera, performance.now(), matchMedia('(prefers-reduced-motion: reduce)').matches) && !this.effectFrame) {
      this.effectFrame = requestAnimationFrame(() => { this.effectFrame = 0; this.paint(); });
    }
    this.canvas.dataset.effectCount = String(this.gameEffects.count);
    this.canvas.dataset.world = this.scene.world ?? '';
    this.canvas.dataset.cameraX = String(this.camera.x); this.canvas.dataset.cameraY = String(this.camera.y);
    this.canvas.dataset.commandCount = String(this.commands.length);
    this.canvas.dataset.backdrop = this.scene.backdrop ?? '';
    this.canvas.dataset.spriteCount = String(this.sprites.size);
    this.canvas.dataset.inkCount = String(this.inkCount);
  }

  private paintSprite(s: SpriteState, ctx = this.context, selection = true) {
    const asset = [...builtins, ...this.scene.assets].find(a => a.id === s.costume)!;
    if (!asset) return true;
    const image = this.images.get(s.costume);
    if (image && (!image.complete || !image.naturalWidth)) return false;
    ctx.save(); ctx.translate(240 + s.x, 160 - s.y);
    if (!s.rotationStyle || s.rotationStyle === 'all') ctx.rotate(s.direction * Math.PI / 180);
    const flip = s.rotationStyle === 'left-right' && s.direction > 90 && s.direction < 270 ? -1 : 1;
    ctx.scale(flip * s.size / 100, s.size / 100);
    if (Object.values(s.effects ?? {}).some(Boolean)) {
      const filtered = this.effectImage('costume:' + s.costume, asset.width, asset.height, s.effects!, c => {
        if (image) c.drawImage(image, 0, 0);
        else { c.translate(asset.width / 2, asset.height / 2); paintBuiltinCostume(c, s.costume); }
      });
      ctx.drawImage(filtered, -asset.width / 2, -asset.height / 2);
    }
    else if (image) ctx.drawImage(image, -asset.width / 2, -asset.height / 2, asset.width, asset.height);
    else {
      paintBuiltinCostume(ctx, s.costume);
    }
    if (selection && s.id === this.selected) { ctx.strokeStyle = '#267c70'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(-asset.width / 2 - 4, -asset.height / 2 - 4, asset.width + 8, asset.height + 8); }
    ctx.restore();
    return true;
  }

  private paintBubble(sprite: SpriteState, bubble: Bubble) {
    const ctx = this.context, size = bounds(sprite, this.scene);
    sprite = { ...sprite, x: sprite.x - this.camera.x, y: sprite.y - this.camera.y };
    // Off-stage actors do not leave floating dialogue in the visible stage.
    if (Math.abs(sprite.x) > 240 + size.width / 2 || Math.abs(sprite.y) > 160 + size.height / 2) return;
    ctx.save(); ctx.font = '14px sans-serif'; ctx.textBaseline = 'top';
    const lines: string[] = []; let line = '';
    for (const char of bubble.text) {
      if (char === '\n') { lines.push(line); line = ''; }
      else if (ctx.measureText(line + char).width > 200) {
        const space = line.lastIndexOf(' ');
        if (char === ' ') { lines.push(line); line = ''; }
        else if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
        else { lines.push(line); line = char; }
      } else line += char;
    }
    lines.push(line);
    if (lines.length > 12) { lines.length = 12; lines[11] = lines[11].slice(0, -1) + '…'; }
    const width = Math.max(40, ...lines.map(l => ctx.measureText(l).width)) + 20, height = lines.length * 18 + 18;
    const x = Math.max(4, Math.min(476 - width, 240 + sprite.x + size.width / 3));
    const y = Math.max(4, Math.min(316 - height, 160 - sprite.y - size.height / 2 - height - 12));
    ctx.fillStyle = '#fffef9'; ctx.strokeStyle = '#34483f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, width, height, bubble.style === 'think' ? 18 : 10); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    if (bubble.style === 'think') {
      ctx.ellipse(x + 17, y + height + 6, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 12, y + height + 14, 2, 0, Math.PI * 2);
    } else { ctx.moveTo(x + 12, y + height - 1); ctx.lineTo(x + 8, y + height + 10); ctx.lineTo(x + 26, y + height - 1); }
    ctx.fill(); ctx.stroke(); ctx.fillStyle = '#253e43';
    lines.forEach((text, i) => ctx.fillText(text, x + 10, y + 9 + i * 18));
    ctx.restore();
  }
}
