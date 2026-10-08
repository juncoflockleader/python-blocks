export interface GameState {
  score: number;
  lives: number;
  seconds: number | null;
  visible: { score: boolean; lives: boolean; countdown: boolean };
  text: string;
  result: { won: boolean; message: string } | null;
}
export type GameEffect = { type: 'game_effect'; kind: 'confetti' | 'sparkles' | 'rings'; seconds: number; at: { x: number; y: number } | null };
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validGame(value: unknown): value is GameState {
  const v = value as GameState;
  return !!v && Number.isInteger(v.score) && number(v.score, -999_999_999, 999_999_999) && Number.isInteger(v.lives) && number(v.lives, 0, 999)
    && (v.seconds === null || Number.isInteger(v.seconds) && number(v.seconds, 0, 3600))
    && !!v.visible && ['score', 'lives', 'countdown'].every(k => typeof v.visible[k as keyof GameState['visible']] === 'boolean')
    && typeof v.text === 'string' && v.text.length <= 120
    && (v.result === null || !!v.result && typeof v.result.won === 'boolean' && typeof v.result.message === 'string' && v.result.message.length <= 240);
}
export function validGameEffect(v: GameEffect) {
  return ['confetti', 'sparkles', 'rings'].includes(v.kind) && number(v.seconds, 0.02, 10)
    && (v.at === null || !!v.at && number(v.at.x, -1e6, 1e6) && number(v.at.y, -1e6, 1e6));
}

/** DOM overlay stays in screen space and remains accessible to keyboard and screen readers. */
export class GameView {
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly result: HTMLElement;
  private readonly restart: HTMLButtonElement;
  state: GameState | null = null;
  constructor(root: HTMLElement, onRestart: () => void) {
    this.root = root;
    root.innerHTML = `<div id="game-hud" aria-label="Game status" hidden><div class="game-counters"><span id="game-score" hidden></span><span id="game-lives" hidden></span><span id="game-countdown" hidden></span></div><p id="game-message" hidden></p></div><section id="game-result" aria-labelledby="game-result-title" hidden><div class="game-result-card"><h3 id="game-result-title"></h3><p id="game-result-message"></p><p id="game-result-score"></p><button id="game-restart" class="button primary">Play again</button></div></section>`;
    this.hud = root.querySelector('#game-hud')!; this.result = root.querySelector('#game-result')!; this.restart = root.querySelector('#game-restart')!;
    this.restart.addEventListener('click', onRestart);
  }
  reset() { this.state = null; this.hud.hidden = true; this.result.hidden = true; this.restart.disabled = true; }
  accept(state: GameState) {
    const justFinished = !this.state?.result && !!state.result;
    this.state = structuredClone(state);
    for (const key of ['score', 'lives', 'countdown'] as const) {
      const item = this.root.querySelector<HTMLElement>('#game-' + key)!;
      item.hidden = !state.visible[key];
      const text = key === 'score' ? `Score ${state.score}` : key === 'lives' ? `Lives ${state.lives}` : `Time ${state.seconds ?? '—'}`;
      if (item.textContent !== text) item.textContent = text;
    }
    const message = this.root.querySelector<HTMLElement>('#game-message')!;
    message.hidden = !state.text; if (message.textContent !== state.text) message.textContent = state.text;
    this.hud.hidden = !state.text && !Object.values(state.visible).some(Boolean);
    this.result.hidden = !state.result;
    if (state.result) {
      this.root.querySelector('#game-result-title')!.textContent = state.result.won ? 'You win!' : 'Game over';
      this.root.querySelector('#game-result-message')!.textContent = state.result.message;
      this.root.querySelector('#game-result-score')!.textContent = `Final score: ${state.score}`;
      this.restart.disabled = false;
      this.restart.setAttribute('aria-describedby', 'game-result-title game-result-message game-result-score');
      if (justFinished) this.restart.focus({ preventScroll: true });
    }
  }
}

/** Finite, bounded cosmetic bursts. They never affect physics or pixel sensing. */
export class GameEffects {
  private bursts: (GameEffect & { born: number; seed: number })[] = [];
  private serial = 0;
  clear() { this.bursts = []; }
  add(effect: GameEffect, now = performance.now()) {
    this.bursts = this.bursts.filter(b => now - b.born < b.seconds * 1000).slice(-15);
    this.bursts.push({ ...effect, born: now, seed: ++this.serial });
  }
  get count() { return this.bursts.length; }
  paint(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }, now = performance.now(), reducedMotion = false) {
    this.bursts = this.bursts.filter(b => now - b.born < b.seconds * 1000);
    if (reducedMotion) { this.clear(); return false; }
    ctx.save();
    for (const b of this.bursts) {
      const t = Math.max(0, (now - b.born) / 1000), p = t / b.seconds;
      const x = b.at ? 240 + b.at.x - camera.x : 240, y = b.at ? 160 - b.at.y + camera.y : 160;
      ctx.globalAlpha = Math.max(0, 1 - p); ctx.lineWidth = 2;
      if (b.kind === 'rings') {
        ctx.strokeStyle = '#fff6aa';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, p * 100 - i * 14), 0, 2 * Math.PI); ctx.stroke(); }
      } else for (let i = 0; i < 24; i++) {
        const angle = i * 2.399963 + b.seed, speed = 35 + (i * 17 % 90);
        const px = x + Math.cos(angle) * speed * t, py = y + Math.sin(angle) * speed * t + (b.kind === 'confetti' ? 65 * t * t : 0);
        ctx.fillStyle = ['#ffe187', '#ef826d', '#8ed4ce', '#b4a0e0'][i % 4];
        if (b.kind === 'confetti') { ctx.save(); ctx.translate(px, py); ctx.rotate(angle + t * 3); ctx.fillRect(-2, -4, 4, 8); ctx.restore(); }
        else { ctx.fillRect(px - 4, py - 1, 8, 2); ctx.fillRect(px - 1, py - 4, 2, 8); }
      }
    }
    ctx.restore(); return this.bursts.length > 0;
  }
}
