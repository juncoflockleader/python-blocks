import type { Stage } from '../stage';
import { validKey, type SceneInput, type PointerInput } from './model';
import { HeldKeys, TouchControls, type Controls } from './touch';

/** The editor and portable player share focus, capture and held-key semantics. */
export class PlayInput {
  private enabled = false;
  private pointer: number | null = null;
  private frame = 0;
  private pending: PointerInput | null = null;
  private listeners = new AbortController();
  private held: HeldKeys;
  private touch: TouchControls;
  constructor(private canvas: HTMLCanvasElement, private stage: Stage, root: HTMLElement, private send: (input: SceneInput) => boolean) {
    this.held = new HeldKeys((key, down) => { if (this.enabled) this.send({ kind: 'key', key, down }); });
    this.touch = new TouchControls(root, canvas, this.held);
    canvas.tabIndex = 0;
    const options = { signal: this.listeners.signal };
    const keyName = (e: KeyboardEvent) => e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
    canvas.addEventListener('keydown', e => {
      const key = keyName(e); if (!this.enabled || !validKey(key) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); this.held.set('keyboard:' + key, key, true);
    }, options);
    window.addEventListener('keyup', e => { const key = keyName(e); this.held.set('keyboard:' + key, key, false); }, options);
    canvas.addEventListener('blur', () => this.release(), options);
    window.addEventListener('blur', () => this.release(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
    canvas.addEventListener('pointerdown', e => {
      if (!this.enabled || !e.isPrimary || e.button !== 0) return;
      canvas.focus(); const point = stage.point(e.clientX, e.clientY), sprite = stage.hit(point.x, point.y);
      this.pointer = e.pointerId; canvas.setPointerCapture(e.pointerId); this.position(e, true);
      send({ kind: 'click', ...point, sprite: sprite?.id ?? null });
    }, options);
    canvas.addEventListener('pointermove', e => this.position(e), options);
    canvas.addEventListener('pointerleave', e => this.position(e, true, false), options);
    const end = (e: PointerEvent) => {
      if (this.pointer !== e.pointerId) return;
      this.pointer = null; this.position(e, true, e.type === 'pointerup' ? undefined : false);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(event, end, options);
    window.addEventListener('pointerup', end, options);
  }
  private position(e: PointerEvent, immediate = false, insideOverride?: boolean) {
    if (!this.enabled || !e.isPrimary) return;
    const rect = this.canvas.getBoundingClientRect();
    const inside = insideOverride ?? (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
    this.pending = { kind: 'pointer', ...this.stage.point(e.clientX, e.clientY), inside, down: this.pointer !== null };
    const flush = () => { this.frame = 0; const value = this.pending; this.pending = null; if (this.enabled && value) this.send(value); };
    if (immediate) { cancelAnimationFrame(this.frame); flush(); }
    else if (!this.frame) this.frame = requestAnimationFrame(flush);
  }
  release() {
    cancelAnimationFrame(this.frame); this.frame = 0; this.pending = null;
    const pointer = this.pointer; this.pointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    if (this.enabled) this.send({ kind: 'reset' });
    this.held.clear(); this.touch.clear();
  }
  configure(controls?: Controls) { this.release(); this.touch.configure(controls); }
  setEnabled(enabled: boolean) { if (!enabled) this.release(); this.enabled = enabled; this.touch.setEnabled(enabled); }
  dispose() { this.setEnabled(false); this.listeners.abort(); }
}
