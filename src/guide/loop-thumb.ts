/** A gallery card's picture: the still (loaded lazily, as before) with its
 * three-second loop laid over it while the card is hovered or focused, or
 * while it is on screen on a touch screen, where there is no hover. The loop
 * is only fetched the first time it is wanted, and nothing plays when the
 * reader asks for reduced motion. The preview suite records the loops
 * (tests/e2e/previews.spec.ts): WebM, and MP4 for iPadOS. */
const url = (file: string) => `${import.meta.env.BASE_URL}gallery/${file}`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = () => matchMedia('(hover: none)').matches;
let observer: IntersectionObserver | undefined;
const onScreen = new WeakMap<Element, (visible: boolean) => void>();

export function loopThumb(id: string, card: HTMLElement) {
  const frame = document.createElement('div'); frame.className = 'example-thumb-frame';
  const image = document.createElement('img'); image.className = 'example-thumb'; image.alt = ''; image.loading = 'lazy'; image.src = url(`${id}.png`);
  image.addEventListener('error', () => image.replaceWith(Object.assign(document.createElement('div'), { className: 'example-thumb' })), { once: true });
  frame.append(image);
  let video: HTMLVideoElement | undefined, failed = false, wanted = false;
  const make = () => {
    const v = document.createElement('video'); v.className = 'example-thumb example-loop'; v.setAttribute('aria-hidden', 'true');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    for (const [type, file] of [['video/mp4', `${id}.mp4`], ['video/webm', `${id}.webm`]]) { const source = document.createElement('source'); source.type = type; source.src = url(file); v.append(source); }
    // The still stays underneath, so a loop that cannot play just leaves the still showing.
    const fail = () => { failed = true; v.remove(); video = undefined; card.removeAttribute('data-playing'); };
    v.lastElementChild!.addEventListener('error', fail, { once: true }); v.addEventListener('error', fail, { once: true });
    v.addEventListener('playing', () => { if (wanted) { v.classList.add('playing'); card.dataset.playing = 'true'; } });
    frame.append(v); return v;
  };
  const play = () => {
    wanted = true; if (failed || reduced()) return;
    video ??= make(); video.play().catch(() => {});
  };
  const stop = () => {
    wanted = false; if (!video) return;
    video.pause(); video.classList.remove('playing'); card.removeAttribute('data-playing');
  };
  card.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') play(); });
  card.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') stop(); });
  card.addEventListener('focusin', play);
  card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget as Node | null)) stop(); });
  // On a tablet a card plays while most of it is on screen; a closed dialog's cards are never on screen.
  observer ??= new IntersectionObserver(seen => { for (const entry of seen) onScreen.get(entry.target)?.(entry.isIntersecting); }, { threshold: 0.6 });
  onScreen.set(frame, visible => { if (!touch()) return; if (visible) play(); else stop(); });
  observer.observe(frame);
  return frame;
}
