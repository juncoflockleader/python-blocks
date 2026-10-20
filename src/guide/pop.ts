import { stockDataUrl } from '../art/raster';

/** One small card at a time, pointing at what it is about: a word card, the
 * lesson's coach saying where to look, a tip about a loose block, a cheer when
 * a step is done. It closes with its × button, Escape or a tap elsewhere, and
 * never covers the thing it points at when there is room beside it. */
export interface PopOptions {
  /** Read by screen readers as the card's name. */
  label: string;
  className?: string;
  /** Which side of the anchor to prefer; the other side is used when there is no room. */
  side?: 'right' | 'below' | 'above' | 'left';
  /** The lesson's coach, the Chick, beside the text. */
  coach?: boolean;
  /** Move focus into the card (a word card opened by a tap); tips leave focus where it is. */
  focus?: boolean;
  /** Close by itself after this many milliseconds. */
  timeout?: number;
  onClose?(): void;
}
let current: { node: HTMLElement; close(): void } | null = null;

export function closePop() { current?.close(); }
export const popOpen = () => current !== null;

export function pop(anchor: Element, content: (string | Node)[], options: PopOptions) {
  closePop();
  const node = document.createElement('div');
  node.className = `pop ${options.className ?? ''}`.trim();
  node.setAttribute('role', options.focus ? 'dialog' : 'status');
  node.setAttribute('aria-label', options.label);
  const body = document.createElement('div'); body.className = 'pop-body'; body.append(...content);
  if (options.coach) {
    const coach = document.createElement('img'); coach.className = 'pop-coach'; coach.alt = ''; coach.src = stockDataUrl('cast/chick-happy@1');
    node.append(coach);
  }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'pop-close'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
  const arrow = document.createElement('span'); arrow.className = 'pop-arrow';
  node.append(body, close, arrow);
  document.body.append(node);
  const returnTo = options.focus ? document.activeElement as HTMLElement | null : null;
  let timer = 0;
  const place = () => {
    const a = anchor.getBoundingClientRect(), r = node.getBoundingClientRect(), gap = 12, w = innerWidth, h = innerHeight;
    if (!a.width && !a.height) { done(); return; }
    const fits = { right: a.right + gap + r.width < w - 8, left: a.left - gap - r.width > 8, below: a.bottom + gap + r.height < h - 8, above: a.top - gap - r.height > 8 };
    const order = { right: ['right', 'below', 'above', 'left'], left: ['left', 'below', 'above', 'right'], below: ['below', 'above', 'right', 'left'], above: ['above', 'below', 'right', 'left'] }[options.side ?? 'below'] as (keyof typeof fits)[];
    const side = order.find(s => fits[s]) ?? 'below';
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let x: number, y: number;
    if (side === 'right' || side === 'left') { x = side === 'right' ? a.right + gap : a.left - gap - r.width; y = clamp(a.top + a.height / 2 - r.height / 2, 8, h - r.height - 8); }
    // A card stays on screen even when what it points at has scrolled away.
    else { y = clamp(side === 'below' ? a.bottom + gap : a.top - gap - r.height, 8, h - r.height - 8); x = clamp(a.left + a.width / 2 - r.width / 2, 8, w - r.width - 8); }
    node.style.left = `${Math.round(x)}px`; node.style.top = `${Math.round(y)}px`; node.dataset.side = side;
    // The arrow points at the middle of the anchor, wherever the card was clamped to.
    if (side === 'right' || side === 'left') arrow.style.top = `${clamp(a.top + a.height / 2 - y, 14, r.height - 14)}px`;
    else arrow.style.left = `${clamp(a.left + a.width / 2 - x, 14, r.width - 14)}px`;
  };
  // Any tap outside the card closes it, including on what it points at: tapping Physics or the game is the tip being followed.
  const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) done(); };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); done(); } };
  function done() {
    if (!node.isConnected) return;
    const hadFocus = node.contains(document.activeElement);
    clearTimeout(timer); node.remove(); removeEventListener('pointerdown', outside, true); removeEventListener('keydown', key, true);
    removeEventListener('resize', place); removeEventListener('scroll', place, true);
    if (current?.node === node) current = null;
    if (returnTo && hadFocus && returnTo.isConnected) returnTo.focus();
    options.onClose?.();
  }
  close.addEventListener('click', done);
  addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true);
  addEventListener('resize', place); addEventListener('scroll', place, true);
  place();
  if (options.timeout) timer = window.setTimeout(done, options.timeout);
  if (options.focus) close.focus({ preventScroll: true });
  current = { node, close: done };
  return current;
}
