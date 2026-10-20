import type { Controls } from './touch';
import { stockAsset, stockScale } from '../art/catalog';
import { validWatches, type Watch } from './watch-model';
import { validateSounds, type Sound } from './sound';
import { isStockSound, knownSound } from './sound-library';
import { validGame, validGameEffect, type GameState, type GameEffect } from './game';
import { validMap, validCamera, type World, type Camera } from './world';
import { validMotion, validKind, type Motion } from './motion';
import { validEffects, type Effects } from './effects';
/** Artwork. `width` and `height` are its size on the stage; a `resolution` of 2
 * means the PNG holds twice as many pixels each way, so it stays sharp on high-density screens. */
export interface Costume { id: string; name: string; width: number; height: number; data?: string; resolution?: 2; stock?: string }
/** Library art a project refers to instead of embedding (src/art/catalog.ts); it does not count toward the embedded limits. */
export const isStock = (asset: object): asset is Costume & { stock: string } => typeof (asset as Costume).stock === 'string';
export const STOCK_LIMITS = { costumes: 200, backdrops: 24 };
/** Pixels per stage unit in an artwork's PNG (1 unless it is stored at 2×). */
export const resolutionOf = (asset: object) => isStock(asset) ? stockResolution(asset) : (asset as { resolution?: number }).resolution === 2 ? 2 : 1;
function stockResolution(asset: Costume & { stock: string }) { const art = stockAsset(asset.stock); return art ? stockScale(art.width, art.height, art.kind) : 1; }
export interface SpritePen { down: boolean; color: string; width: number; opacity: number }
export const defaultPen = (): SpritePen => ({ down: false, color: '#267c70', width: 3, opacity: 100 });
export type RotationStyle = 'all' | 'left-right' | 'none';
export const rotationStyles = [['all around', 'all'], ['left/right only', 'left-right'], ['do not rotate', 'none']];
/** A named list of a sprite's costumes, played by name ("walk"); `seconds` per costume, else the sprite's frameSeconds. */
export interface SpriteAnimation { name: string; frames: string[]; seconds?: number }
/** Animate while moving: which animation plays while the sprite moves, is in the air, or is still ('' for none),
 * and whether a left-right sprite turns to face the way it moves. */
export interface AutoAnimate { moving: string; air: string; still: string; turn: boolean }
/** The frames list (`costumes`) is the animation named "frames"; named animations sit beside it. */
export const FRAMES_ANIMATION = 'frames';
export const ANIMATION_LIMITS = { animations: 8, frames: 64 } as const;
export const validAnimationName = (n: unknown): n is string => typeof n === 'string' && /^[A-Za-z][A-Za-z0-9 _-]{0,23}$/.test(n) && n === n.trim();
export interface SpriteState { id: string; name: string; x: number; y: number; direction: number; size: number; layer: number; visible: boolean; costume: string; rotationStyle?: RotationStyle; costumes?: string[]; frameSeconds?: number; animations?: SpriteAnimation[]; autoAnimate?: AutoAnimate; pen?: SpritePen; effects?: Effects; data?: Record<string, unknown>; motion?: Partial<Motion>; kind?: string; world?: string }
export interface Bubble { text: string; style: 'say' | 'think' }
export interface SceneState { watchers?: Watch[]; controls?: Controls; sounds?: Sound[]; version: 1; background: string; sprites: SpriteState[]; assets: Costume[]; backdrops?: Costume[]; backdrop?: string | null; effects?: Effects; worlds?: World[]; world?: string | null; camera?: Camera }
export const builtins = [
  { id: 'bird', name: 'Bird', width: 48, height: 40 },
  { id: 'star', name: 'Star', width: 44, height: 44 },
  { id: 'ball', name: 'Ball', width: 40, height: 40 },
  { id: 'box', name: 'Box', width: 44, height: 44 },
] as const;
export const builtinBackdrops = [{ id: 'backdrop_meadow', name: 'Meadow', width: 480, height: 320 }, { id: 'backdrop_night', name: 'Night', width: 480, height: 320 }] as const;
export const backdrops = (scene: SceneState) => [...builtinBackdrops, ...(scene.backdrops ?? [])];
export const spriteFrames = (sprite: SpriteState) => sprite.costumes ?? [sprite.costume];
export const emptyScene = (): SceneState => ({ version: 1, background: '#fdfdf9', sprites: [], assets: [] });
export const costumes = (scene: SceneState) => [...builtins, ...scene.assets];
export const validKey = (key: unknown): key is string => typeof key === 'string' && /^(Arrow(Up|Down|Left|Right)|Space|[a-z0-9])$/.test(key);
export const keys = [['right arrow', 'ArrowRight'], ['left arrow', 'ArrowLeft'], ['up arrow', 'ArrowUp'], ['down arrow', 'ArrowDown'], ['space', 'Space'], ...'abcdefghijklmnopqrstuvwxyz0123456789'.split('').map(key => [key, key])];
export const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validPen(value: unknown): value is SpritePen {
  if (!value || typeof value !== 'object') return false;
  const p = value as SpritePen;
  return typeof p.down === 'boolean' && isColor(p.color) && finite(p.width, 1, 1200) && finite(p.opacity, 0, 100);
}
export function validData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let nodes = 0;
  const visit = (v: unknown, depth: number): boolean => {
    if (++nodes > 1024 || depth > 16) return false;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v));
    if (Array.isArray(v)) return v.every(x => visit(x, depth + 1));
    if (v && typeof v === 'object') return Object.entries(v).every(([k, x]) => visit(k, depth + 1) && visit(x, depth + 1));
    return false;
  };
  return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 16_384;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(v);
const name = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 48 && !/[\x00-\x1f]/.test(v);
function validAnimations(list: unknown, assetIds?: Set<string>): list is SpriteAnimation[] {
  if (!Array.isArray(list) || list.length > ANIMATION_LIMITS.animations) return false;
  const names = new Set<string>();
  for (const a of list as SpriteAnimation[]) {
    if (!a || !validAnimationName(a.name) || a.name === FRAMES_ANIMATION || names.has(a.name) || !Array.isArray(a.frames) || !a.frames.length || a.frames.length > ANIMATION_LIMITS.frames) return false;
    if (!a.frames.every(f => id(f) && (!assetIds || assetIds.has(f))) || a.seconds !== undefined && !finite(a.seconds, 0.02, 10)) return false;
    names.add(a.name);
  }
  return true;
}
function validAutoAnimate(auto: unknown, animations: SpriteAnimation[] = []): auto is AutoAnimate {
  const a = auto as AutoAnimate, known = (n: unknown) => n === '' || n === FRAMES_ANIMATION || animations.some(x => x.name === n);
  return !!a && typeof a === 'object' && known(a.moving) && known(a.air) && known(a.still) && typeof a.turn === 'boolean';
}
export function validSprite(value: unknown, assetIds?: Set<string>): value is SpriteState {
  if (!value || typeof value !== 'object') return false;
  const s = value as SpriteState;
  if (s.world !== undefined && !id(s.world)) return false;
  if (s.motion !== undefined && !validMotion(s.motion) || s.kind !== undefined && !validKind(s.kind)) return false;
  if (s.data !== undefined && !validData(s.data)) return false;
  if ((s.pen !== undefined && !validPen(s.pen)) || (s.effects !== undefined && !validEffects(s.effects))) return false;
  if (s.animations !== undefined && !validAnimations(s.animations, assetIds) || s.autoAnimate !== undefined && !validAutoAnimate(s.autoAnimate, s.animations)) return false;
  return id(s.id) && name(s.name) && finite(s.x, -1e6, 1e6) && finite(s.y, -1e6, 1e6) && finite(s.direction, 0, 360) && finite(s.size, 5, 400) && finite(s.layer, -1000, 1000) && typeof s.visible === 'boolean' && id(s.costume) && (!assetIds || assetIds.has(s.costume)) && (s.rotationStyle === undefined || rotationStyles.some(([, style]) => style === s.rotationStyle)) && (s.costumes === undefined || (Array.isArray(s.costumes) && s.costumes.length > 0 && s.costumes.length <= 64 && s.costumes.every(c => id(c) && (!assetIds || assetIds.has(c))))) && (s.frameSeconds === undefined || finite(s.frameSeconds, 0.02, 10));
}
export function validateScene(value: unknown): asserts value is SceneState {
  const s = value as SceneState;
  if (s?.effects !== undefined && !validEffects(s.effects)) throw new Error('Stage effects need valid names and bounded numbers.');
  if (!s || s.version !== 1 || !isColor(s.background) || !Array.isArray(s.sprites) || s.sprites.length > 64 || !Array.isArray(s.assets) || s.assets.filter(a => !isStock(a)).length > 24 || s.assets.filter(a => isStock(a)).length > STOCK_LIMITS.costumes) throw new Error(`A scene needs a supported format, background color, up to 64 sprites, up to 24 imported costumes and up to ${STOCK_LIMITS.costumes} from the library.`);
  if (s.controls !== undefined && (!s.controls || !validKey(s.controls.a) || !validKey(s.controls.b))) throw new Error('Touch actions need valid keys.');
  if (s.watchers !== undefined && !validWatches(s.watchers)) throw new Error('Use up to 12 valid sprite/property watchers with unique identities.');
  if (s.sounds !== undefined) { validateSounds(s.sounds); if (s.sounds.some(x => isStockSound(x) && !knownSound(x.stock))) throw new Error('This project uses a library sound from a newer version of Python Blocks.'); }
  const assetIds = new Set<string>(builtins.map(a => a.id));
  const backdropIds = new Set<string>(builtinBackdrops.map(a => a.id));
  const allIds = new Set([...assetIds, ...backdropIds]);
  if (s.backdrops !== undefined && (!Array.isArray(s.backdrops) || s.backdrops.filter(a => !isStock(a)).length > 12 || s.backdrops.filter(a => isStock(a)).length > STOCK_LIMITS.backdrops)) throw new Error(`Use at most 12 painted or imported backdrops and ${STOCK_LIMITS.backdrops} from the library.`);
  for (const [assets, ids, maxWidth, maxHeight, limit] of [[s.assets, assetIds, 256, 256, 350_000], [s.backdrops ?? [], backdropIds, 480, 320, 900_000]] as const) for (const asset of assets) {
    if (asset?.id === 'change' && ids === backdropIds) throw new Error('The backdrop ID change is reserved for the change event.');
    if (asset && isStock(asset)) {
      // Library art: a known reference, drawn by the app at its catalogue size.
      const art = stockAsset(asset.stock);
      if (!id(asset.id) || allIds.has(asset.id) || !name(asset.name) || !art || art.kind !== (ids === assetIds ? 'costume' : 'backdrop') || asset.width !== art.width || asset.height !== art.height || asset.data !== undefined || asset.resolution !== undefined) throw new Error('Library artwork needs a distinct ID and a reference this version of Python Blocks knows.');
      allIds.add(asset.id); ids.add(asset.id); continue;
    }
    // A 2× artwork may hold four times the pixels of its stage size, so its data may be four times larger.
    const scale = asset?.resolution === 2 ? 2 : 1;
    if (!asset || !id(asset.id) || allIds.has(asset.id) || !name(asset.name) || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || !finite(asset.width, 1, maxWidth) || !finite(asset.height, 1, maxHeight) || (asset.resolution !== undefined && asset.resolution !== 2) || typeof asset.data !== 'string' || asset.data.length > limit * scale * scale || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.data)) throw new Error(`Artwork needs distinct IDs and a PNG image of at most ${maxWidth} × ${maxHeight} pixels.`);
    const bytes = Uint8Array.from(atob(asset.data!.slice(22)), c => c.charCodeAt(0));
    if (bytes.length < 24 || [137,80,78,71,13,10,26,10].some((b,i) => bytes[i] !== b)) throw new Error('Invalid PNG artwork.');
    const view = new DataView(bytes.buffer);
    if (view.getUint32(16) !== asset.width * scale || view.getUint32(20) !== asset.height * scale) throw new Error('Artwork dimensions do not match its PNG.');
    allIds.add(asset.id); ids.add(asset.id);
  }
  if (s.backdrop !== undefined && s.backdrop !== null && !backdropIds.has(s.backdrop)) throw new Error('Choose an available starting backdrop.');
  if (s.camera !== undefined && !validCamera(s.camera)) throw new Error('Camera needs bounded coordinates, a follow target and a clamp setting.');
  if (s.worlds !== undefined && (!Array.isArray(s.worlds) || s.worlds.length > 8)) throw new Error('Use at most 8 worlds.');
  const worldIds = new Set<string>();
  for (const w of s.worlds ?? []) {
    if (!w || !id(w.id) || w.id === 'enter' || worldIds.has(w.id) || !name(w.name) || !isColor(w.background) || w.backdrop != null && !backdropIds.has(w.backdrop) || !validMap(w.map, assetIds) || !validCamera(w.camera)) throw new Error('Worlds need distinct IDs, names, artwork, a valid camera and maps up to 64 × 64 tiles.');
    worldIds.add(w.id);
  }
  if (new Set((s.worlds ?? []).map(w => w.name)).size !== worldIds.size) throw new Error('World names must be distinct.');
  if (s.world != null && !worldIds.has(s.world) || s.sprites.some(sprite => sprite?.world !== undefined && !worldIds.has(sprite.world))) throw new Error('Choose an available world for the stage and its sprites.');
  for (const camera of [s.camera, ...(s.worlds ?? []).map(w => w.camera)]) if (camera?.follow && !s.sprites.some(sprite => sprite.id === camera.follow)) throw new Error('Camera follow needs an authored sprite.');
  if (new TextEncoder().encode(JSON.stringify(s)).length > 12_000_000) throw new Error('Scene assets exceed the 12 MB scene limit. Use shorter sounds or smaller images.');
  if (s.sprites.some(sprite => sprite?.motion !== undefined && !validMotion(sprite.motion) || sprite?.kind !== undefined && !validKind(sprite.kind))) throw new Error('Sprite motion needs valid modes, bounded numbers and a kind of 1–32 characters.');
  if (s.sprites.some(sprite => sprite?.data !== undefined && !validData(sprite.data))) throw new Error('Sprite starting data needs a JSON dictionary within the 16 KB, 16-level and 1,024-value limits.');
  if (s.sprites.some(sprite => !validSprite(sprite, assetIds)) || new Set(s.sprites.map(v => v.id)).size !== s.sprites.length || new Set(s.sprites.map(v => v.name)).size !== s.sprites.length) throw new Error('Sprites need distinct IDs/names, valid costumes, and valid numeric properties.');
}
export type InkCommand = { type: 'pen_line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; opacity: number } | { type: 'stamp'; sprite: SpriteState };
export type SceneCommand = { type: 'game'; state: GameState } | GameEffect | { type: 'game_effect_clear' } | { type: 'world'; id: string | null } | { type: 'camera'; x: number; y: number } | { type: 'tile'; column: number; row: number; costume: string | null; solid: boolean } | { type: 'sprite'; sprite: SpriteState } | { type: 'delete'; id: string } | { type: 'background'; color: string } | { type: 'backdrop'; id: string | null } | { type: 'bubble'; id: string; text: string; style: 'say' | 'think' } | InkCommand | { type: 'pen_clear' } | { type: 'effects'; effects: Effects };
export function isSceneCommand(value: unknown): value is SceneCommand {
  if (!value || typeof value !== 'object') return false;
  const v = value as SceneCommand;
  if (v.type === 'game') return validGame(v.state);
  if (v.type === 'game_effect') return validGameEffect(v);
  if (v.type === 'game_effect_clear') return true;
  if (v.type === 'world') return v.id === null || id(v.id);
  if (v.type === 'camera') return finite(v.x, -1e6, 1e6) && finite(v.y, -1e6, 1e6);
  if (v.type === 'tile') return Number.isInteger(v.column) && finite(v.column, 0, 255) && Number.isInteger(v.row) && finite(v.row, 0, 255) && (v.costume === null || id(v.costume)) && typeof v.solid === 'boolean';
  if (v.type === 'pen_clear') return true;
  if (v.type === 'effects') return validEffects(v.effects);
  if (v.type === 'stamp') return validSprite(v.sprite);
  if (v.type === 'pen_line') return [v.x1, v.y1, v.x2, v.y2].every(n => finite(n, -1e6, 1e6)) && isColor(v.color) && finite(v.width, 1, 1200) && finite(v.opacity, 0, 100);
  return v.type === 'sprite' ? validSprite(v.sprite) : v.type === 'delete' ? id(v.id) : v.type === 'backdrop' ? v.id === null || id(v.id) : v.type === 'bubble' ? id(v.id) && typeof v.text === 'string' && v.text.length <= 240 && ['say', 'think'].includes(v.style) : v.type === 'background' && isColor(v.color);
}
export type PointerInput = { kind: 'pointer'; x: number; y: number; down: boolean; inside: boolean };
export type SceneInput = { kind: 'key'; key: string; down: boolean } | { kind: 'reset' } | { kind: 'click'; x: number; y: number; sprite: string | null } | PointerInput;
export function validateInput(input: SceneInput) {
  if (input.kind === 'reset') return;
  if (input.kind === 'key' && validKey(input.key) && typeof input.down === 'boolean') return;
  if (input.kind === 'click' && finite(input.x, -1e6, 1e6) && finite(input.y, -1e6, 1e6) && (input.sprite === null || id(input.sprite))) return;
  if (input.kind === 'pointer' && finite(input.x, -1e6, 1e6) && finite(input.y, -1e6, 1e6) && typeof input.down === 'boolean' && typeof input.inside === 'boolean') return;
  throw new Error('Invalid stage input.');
}
export function bounds(sprite: SpriteState, scene: SceneState) {
  const asset = costumes(scene).find(a => a.id === sprite.costume) ?? builtins[0];
  const angle = (sprite.rotationStyle && sprite.rotationStyle !== 'all' ? 0 : sprite.direction) * Math.PI / 180, scale = sprite.size / 100;
  return { width: scale * (Math.abs(Math.cos(angle)) * asset.width + Math.abs(Math.sin(angle)) * asset.height), height: scale * (Math.abs(Math.sin(angle)) * asset.width + Math.abs(Math.cos(angle)) * asset.height) };
}
