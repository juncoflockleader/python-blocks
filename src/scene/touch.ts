export interface Controls { a: string; b: string }
export const defaultControls = (): Controls => ({ a: 'Space', b: 'x' });

/** A key stays down until every physical or virtual source releases it. */
export class HeldKeys {
  private sources = new Map<string, string>();
  constructor(private send: (key: string, down: boolean) => void) {}
  set(source: string, key: string, down: boolean) {
    if (down) {
      if (this.sources.has(source)) return;
      const wasDown = [...this.sources.values()].includes(key); this.sources.set(source, key);
      if (!wasDown) this.send(key, true);
    } else {
      const previous = this.sources.get(source); if (!previous) return;
      this.sources.delete(source); if (![...this.sources.values()].includes(previous)) this.send(previous, false);
    }
  }
  clear() { this.sources.clear(); }
}

export class TouchControls {
  private pointers = new Map<number, HTMLButtonElement>();
  private keyboard = new Map<string, HTMLButtonElement>();
  private enabled = false;
  private profile = defaultControls();
  private pad: HTMLFieldSetElement;
  private shown = matchMedia('(pointer: coarse)').matches;
  constructor(readonly root: HTMLElement, private stage: HTMLElement, private held: HeldKeys) {
    root.innerHTML = '<button id="touch-toggle" class="button secondary" aria-controls="touch-pad">Touch controls</button><fieldset id="touch-pad" disabled><legend>On-screen controller</legend><div class="touch-directions"><button type="button" data-control="ArrowUp" aria-label="Move up">↑</button><button type="button" data-control="ArrowLeft" aria-label="Move left">←</button><button type="button" data-control="ArrowDown" aria-label="Move down">↓</button><button type="button" data-control="ArrowRight" aria-label="Move right">→</button></div><div class="touch-actions"><button type="button" data-control="a">A</button><button type="button" data-control="b">B</button></div></fieldset>';
    this.pad = root.querySelector('fieldset')!;
    root.querySelector('#touch-toggle')!.addEventListener('click', () => { this.clear(); this.shown = !this.shown; this.render(); });
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.addEventListener('contextmenu', e => e.preventDefault());
      button.addEventListener('pointerdown', e => {
        if (!this.enabled || e.button !== 0 || this.pointers.has(e.pointerId)) return;
        e.preventDefault(); this.stage.focus({ preventScroll: true }); button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, button); this.held.set('touch:' + e.pointerId, this.key(button), true); this.renderPressed();
      });
      const release = (e: PointerEvent) => { if (this.pointers.get(e.pointerId) !== button) return; this.pointers.delete(e.pointerId); this.held.set('touch:' + e.pointerId, this.key(button), false); if (button.hasPointerCapture(e.pointerId)) button.releasePointerCapture(e.pointerId); this.renderPressed(); };
      for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name, release as EventListener);
      button.addEventListener('keydown', e => { if (this.enabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); const source = 'button:' + button.dataset.control + ':' + e.key; this.keyboard.set(source, button); this.held.set(source, this.key(button), true); this.renderPressed(); } });
      const releaseKey = (key?: string) => { for (const [source, target] of this.keyboard) if (target === button && (!key || source === 'button:' + button.dataset.control + ':' + key)) { this.keyboard.delete(source); this.held.set(source, this.key(button), false); } this.renderPressed(); };
      button.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); releaseKey(e.key); } }); button.addEventListener('blur', () => releaseKey());
      // Assistive technology may activate through click without pointer/key events.
      button.addEventListener('click', e => { if (this.enabled && e.detail === 0) { const source = 'activate:' + button.dataset.control; this.held.set(source, this.key(button), true); this.held.set(source, this.key(button), false); } });
    }
    this.render();
  }
  private key(button: HTMLButtonElement) { const key = button.dataset.control!; return key === 'a' || key === 'b' ? this.profile[key] : key; }
  configure(profile: Controls = defaultControls()) { this.clear(); this.profile = { ...profile }; this.render(); }
  setEnabled(enabled: boolean) { if (!enabled) this.clear(); this.enabled = enabled; this.render(); }
  clear() {
    for (const [id, button] of this.pointers) { this.pointers.delete(id); this.held.set('touch:' + id, this.key(button), false); if (button.hasPointerCapture(id)) button.releasePointerCapture(id); }
    for (const [source, b] of this.keyboard) this.held.set(source, this.key(b), false); this.keyboard.clear();
    this.renderPressed();
  }
  private renderPressed() { for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-control]')) b.setAttribute('aria-pressed', String([...this.pointers.values(), ...this.keyboard.values()].includes(b))); }
  private render() {
    this.pad.hidden = !this.shown; this.pad.disabled = !this.enabled;
    this.root.querySelector('#touch-toggle')!.setAttribute('aria-expanded', String(this.shown));
    for (const action of ['a','b'] as const) { const b = this.root.querySelector<HTMLButtonElement>(`[data-control="${action}"]`)!; b.textContent = `${action.toUpperCase()} · ${this.profile[action] === 'Space' ? 'space' : this.profile[action]}`; b.setAttribute('aria-label', `Action ${action.toUpperCase()}: ${this.profile[action]}`); }
  }
}
