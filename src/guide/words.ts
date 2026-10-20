import { paintStock } from '../art/catalog';
import { INK } from '../art/draw';
import { pop } from './pop';
import { richText } from './ui-refs';

/** Word cards: the programming words a lesson cannot avoid (because they are
 * printed on the blocks, like vy) or should not (gravity, clone), each with a
 * picture and one or two short sentences a young reader can follow. Lesson
 * text marks a word with <<vy>>, or <<gravity|ay>> to show "gravity" and open
 * the ay card; tapping it opens the card beside the word. Pictures are drawn
 * from the library art, so they look like the game. */
type Ctx = CanvasRenderingContext2D;
export interface Word { title: string; say: string; picture(c: Ctx): void }
const W = 220, H = 120;

const art = (c: Ctx, ref: string, x: number, y: number, scale = 1, alpha = 1) => { c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(scale, scale); paintStock(c, ref); c.restore(); };
function arrow(c: Ctx, x1: number, y1: number, x2: number, y2: number, colour = '#e2783f', width = 4) {
  const angle = Math.atan2(y2 - y1, x2 - x1), head = 9;
  c.save(); c.strokeStyle = colour; c.fillStyle = colour; c.lineWidth = width; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6); c.stroke();
  c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - head * Math.cos(angle - 0.5), y2 - head * Math.sin(angle - 0.5)); c.lineTo(x2 - head * Math.cos(angle + 0.5), y2 - head * Math.sin(angle + 0.5)); c.closePath(); c.fill();
  c.restore();
}
function label(c: Ctx, text: string, x: number, y: number, colour = '#26382f', size = 14, align: CanvasTextAlign = 'center') {
  c.save(); c.fillStyle = colour; c.font = `700 ${size}px "DM Sans", system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, x, y); c.restore();
}
const tiles = (c: Ctx, from: number, to: number, y: number, scale = 1) => { for (let x = from; x <= to; x += 32 * scale) art(c, 'tiles/grass-top@1', x, y, scale); };
function sky(c: Ctx) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#cdebf7'); g.addColorStop(1, '#eef8f4'); c.fillStyle = g; c.fillRect(0, 0, W, H); }

export const WORDS: Record<string, Word> = {
  sprite: { title: 'Sprite', say: 'A sprite is a thing in your game: a hero, a coin, a pipe. Each sprite has its own blocks.',
    picture: c => { sky(c); art(c, 'cast/fox-idle-1@1', 50, 66, 0.9); art(c, 'props/coin-1@1', 112, 70, 1.1); art(c, 'cast/chick-idle-1@1', 170, 64, 1); } },
  stage: { title: 'Stage', say: 'The stage is your game’s screen. Your sprites play on it.',
    picture: c => { c.save(); c.beginPath(); c.roundRect(20, 8, 180, 104, 10); c.clip(); c.translate(20, 8); c.scale(0.375, 0.375); paintStock(c, 'backdrops/hills@1'); c.restore(); c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.roundRect(20, 8, 180, 104, 10); c.stroke(); art(c, 'cast/explorer-sam-idle-1@1', 104, 78, 0.6); } },
  x: { title: 'x', say: 'x is how far left or right a sprite is. A bigger x is further right. 0 is the middle.',
    picture: c => { sky(c); arrow(c, 20, 92, 204, 92, '#4e5f49', 3); for (const [x, t] of [[30, '−200'], [110, '0'], [190, '200']] as const) label(c, t, x, 108, '#4e5f49', 11); art(c, 'cast/chick-idle-1@1', 160, 58, 0.9); label(c, 'x = 100', 160, 22, '#c4602f', 14); } },
  y: { title: 'y', say: 'y is how far up or down a sprite is. A bigger y is higher. Below 0 is the bottom half.',
    picture: c => { sky(c); arrow(c, 40, 112, 40, 10, '#4e5f49', 3); for (const [y, t] of [[100, '−100'], [60, '0'], [20, '100']] as const) label(c, t, 70, y, '#4e5f49', 11, 'left'); art(c, 'cast/chick-idle-1@1', 150, 30, 0.9); label(c, 'y = 80', 150, 82, '#c4602f', 14); } },
  vx: { title: 'vx: speed sideways', say: 'vx is how fast a sprite moves left or right. A plus number goes right. A minus number goes left.',
    picture: c => { sky(c); art(c, 'cast/chick-flap-2@1', 110, 52, 1); arrow(c, 144, 54, 206, 54); label(c, '+ right', 176, 88, '#c4602f'); arrow(c, 76, 54, 14, 54, '#4f93b8'); label(c, '− left', 44, 88, '#3a7598'); } },
  vy: { title: 'vy: speed up and down', say: 'vy is how fast a sprite moves up or down. A plus number goes up. A minus number goes down.',
    picture: c => { sky(c); art(c, 'cast/chick-flap-2@1', 100, 60, 1); arrow(c, 150, 70, 150, 12); label(c, '+ up', 182, 30, '#c4602f'); arrow(c, 150, 76, 150, 112, '#4f93b8'); label(c, '− down', 186, 100, '#3a7598'); } },
  ay: { title: 'ay: gravity', say: 'ay pulls a sprite down a little more every moment, like gravity. Falling things go faster and faster.',
    picture: c => { sky(c); for (const [y, a] of [[18, 0.3], [40, 0.55], [78, 1]] as const) art(c, 'cast/chick-idle-1@1', 70, y, 0.7, a); for (const [y, l] of [[18, 10], [40, 18], [70, 30]] as const) arrow(c, 130, y, 130, y + l, '#4f93b8', 3); label(c, 'faster', 172, 60, '#3a7598'); label(c, 'and faster', 172, 78, '#3a7598'); } },
  clone: { title: 'Clone: a copy', say: 'A clone is a copy of a sprite. Every copy does what its sprite’s blocks say, by itself.',
    picture: c => { sky(c); art(c, 'props/coin-1@1', 40, 60, 1.3); for (const x of [110, 175]) { c.save(); c.setLineDash([4, 4]); c.strokeStyle = '#8c9b85'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 50, 60); c.lineTo(x - 22, 60); c.stroke(); c.restore(); art(c, 'props/coin-1@1', x, 60, 1.3, 0.75); } label(c, 'copy', 110, 100, '#4e5f49', 12); label(c, 'copy', 175, 100, '#4e5f49', 12); } },
  repeat: { title: 'Repeat', say: 'repeat does the blocks inside it again and again, as many times as you say.',
    picture: c => { sky(c); c.strokeStyle = '#e58d40'; c.lineWidth = 5; c.beginPath(); c.arc(56, 60, 30, 0.4, Math.PI * 1.9); c.stroke(); arrow(c, 82, 44, 86, 58, '#e58d40', 5); label(c, '× 3', 56, 61, '#c4602f', 16); for (const y of [30, 60, 90]) art(c, 'props/brick-red@1', 160, y, 1.3); } },
  random: { title: 'Random', say: 'random picks a number for you. It is different every time, like rolling a dice.',
    picture: c => { sky(c); for (const [x, r, dots] of [[70, -0.2, [[-9, -9], [9, 9], [0, 0]]], [150, 0.25, [[-9, -9], [9, -9], [-9, 9], [9, 9]]]] as const) { c.save(); c.translate(x, 60); c.rotate(r); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.roundRect(-24, -24, 48, 48, 9); c.fill(); c.stroke(); c.fillStyle = INK; for (const [dx, dy] of dots) { c.beginPath(); c.arc(dx, dy, 4.5, 0, Math.PI * 2); c.fill(); } c.restore(); } label(c, '?', 110, 24, '#c4602f', 22); } },
  updates: { title: 'when … updates', say: 'These blocks run again and again, about 30 times every second, while the game plays.',
    picture: c => { sky(c); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(60, 60, 36, 0, Math.PI * 2); c.fill(); c.stroke(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(60 + Math.cos(a) * 28, 60 + Math.sin(a) * 28); c.lineTo(60 + Math.cos(a) * 33, 60 + Math.sin(a) * 33); c.stroke(); } arrow(c, 60, 60, 60, 34, INK, 3); label(c, '30 times', 156, 50, '#c4602f', 16); label(c, 'a second', 156, 72, '#c4602f', 16); } },
  overlaps: { title: 'when … overlaps', say: 'These blocks run when two sprites touch each other.',
    picture: c => { sky(c); art(c, 'cast/fox-happy@1', 90, 60, 1.1); art(c, 'props/coin-1@1', 128, 52, 1.1); c.strokeStyle = '#f2c14e'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(128 + Math.cos(a) * 22, 52 + Math.sin(a) * 22); c.lineTo(128 + Math.cos(a) * 30, 52 + Math.sin(a) * 30); c.stroke(); } label(c, 'touch!', 176, 96, '#c4602f', 15); } },
  data: { title: 'Sprite data: a note', say: 'Sprite data is like a sticky note on a sprite. Each copy has its own note, so it remembers things by itself.',
    picture: c => { sky(c); art(c, 'props/coin-1@1', 60, 66, 1.5); c.save(); c.translate(132, 56); c.rotate(-0.06); c.fillStyle = '#fff3a8'; c.strokeStyle = '#c9a93a'; c.lineWidth = 2; c.beginPath(); c.rect(-48, -26, 96, 52); c.fill(); c.stroke(); c.restore(); label(c, 'passed:', 132, 46, '#5a4a12', 13); label(c, 'True', 132, 66, '#1f6b3c', 15); } },
  'this sprite': { title: 'this sprite', say: '“this sprite” means the sprite running the blocks. For a copy, it means that very copy.',
    picture: c => { sky(c); for (const [x, a] of [[44, 0.45], [110, 1], [176, 0.45]] as const) art(c, 'props/coin-1@1', x, 70, 1.3, a); arrow(c, 110, 12, 110, 44); label(c, 'this one!', 110, 108, '#c4602f', 13); } },
  solid: { title: 'Solid', say: 'Solid tiles are floors and walls. Sprites stand on them and cannot walk through them.',
    picture: c => { sky(c); tiles(c, 16, 220, 100); art(c, 'cast/explorer-sam-idle-1@1', 80, 56, 1); art(c, 'tiles/metal-block@1', 150, 68, 1); } },
  camera: { title: 'Camera', say: 'The camera is the part of the level you can see. It follows the hero, so the level slides along.',
    picture: c => { sky(c); tiles(c, 0, 220, 100, 0.75); art(c, 'cast/explorer-sam-walk-2@1', 110, 70, 0.8); art(c, 'props/coin-1@1', 30, 70, 0.8, 0.5); art(c, 'props/coin-1@1', 196, 70, 0.8, 0.5); c.strokeStyle = '#c4602f'; c.lineWidth = 3; c.setLineDash([7, 5]); c.beginPath(); c.roundRect(60, 22, 100, 90, 8); c.stroke(); } },
  grounded: { title: 'Grounded', say: 'Grounded means standing on something, like the grass or a block. Then the hero can jump.',
    picture: c => { sky(c); tiles(c, 16, 220, 100); art(c, 'cast/explorer-sam-idle-1@1', 60, 56, 1); label(c, '✓', 60, 14, '#1f6b3c', 20); art(c, 'cast/explorer-sam-jump@1', 160, 36, 1); label(c, '✗', 196, 16, '#b8454a', 20); } },
  if: { title: 'if … else', say: 'if asks a question. If the answer is yes, it does the first blocks. If not (else), it does the other blocks.',
    picture: c => { sky(c); label(c, '?', 30, 60, '#c4602f', 26); arrow(c, 46, 56, 120, 28, '#1f6b3c'); arrow(c, 46, 64, 120, 92, '#b8454a'); label(c, 'yes: stomp!', 168, 28, '#1f6b3c', 14); label(c, 'no: ouch!', 166, 92, '#b8454a', 14); } },
  destroy: { title: 'Destroy', say: 'destroy makes a sprite disappear for good. Blocks after it do not run, so put it last.',
    picture: c => { sky(c); art(c, 'props/coin-1@1', 60, 60, 1.4); arrow(c, 96, 60, 136, 60, '#4e5f49', 3); c.fillStyle = '#fff'; c.strokeStyle = '#a9b6bc'; c.lineWidth = 2; for (const [x, y, r] of [[166, 60, 16], [150, 50, 11], [184, 48, 10], [176, 72, 11], [154, 72, 9]] as const) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); } label(c, 'poof', 166, 104, '#4e5f49', 13); } },
  bounce: { title: 'Bounce', say: 'Bounce makes a sprite turn back when it hits an edge or a wall, like a ball.',
    picture: c => { sky(c); c.fillStyle = '#c9d8bb'; c.fillRect(196, 0, 24, H); c.strokeStyle = '#8c9b85'; c.setLineDash([5, 5]); c.lineWidth = 2.5; c.beginPath(); c.moveTo(24, 100); c.lineTo(194, 52); c.lineTo(60, 14); c.stroke(); c.setLineDash([]); art(c, 'props/little-ball@1', 60, 14, 1.6); arrow(c, 120, 30, 80, 19, '#e2783f', 3); } },
  input: { title: 'Input', say: 'The input is what your program is given to read, one line at a time. Each read block reads the next line.',
    picture: c => { sky(c); c.save(); c.translate(70, 60); c.rotate(-0.05); c.fillStyle = '#fff'; c.strokeStyle = '#8c9b85'; c.lineWidth = 2; c.beginPath(); c.roundRect(-38, -44, 76, 88, 6); c.fill(); c.stroke(); c.restore(); label(c, '3', 70, 36, '#26382f', 20); label(c, '5', 70, 70, '#26382f', 20); arrow(c, 116, 60, 150, 60, '#4e5f49', 3); art(c, 'cast/chick-idle-1@1', 186, 60, 0.9); } },
  print: { title: 'Print', say: 'print shows a line of text or a number as your program’s answer. Each print makes a new line.',
    picture: c => { sky(c); art(c, 'cast/chick-happy@1', 50, 66, 0.9); c.fillStyle = '#20313a'; c.beginPath(); c.roundRect(100, 26, 104, 70, 8); c.fill(); label(c, '8', 152, 50, '#e8f1ee', 20); label(c, 'Liftoff!', 152, 76, '#e8f1ee', 14); } },
  variable: { title: 'Variable', say: 'A variable is a box with a name that remembers a value. Setting it puts a new value in the box.',
    picture: c => { sky(c); c.fillStyle = '#e8b97c'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.roundRect(64, 40, 92, 62, 8); c.fill(); c.stroke(); c.fillStyle = '#d29b55'; c.beginPath(); c.roundRect(58, 30, 104, 18, 6); c.fill(); c.stroke(); label(c, 'best', 110, 18, '#8a3f17', 15); label(c, '9', 110, 76, '#26382f', 24); } },
  remainder: { title: 'Remainder', say: 'The remainder is what is left over after sharing into equal groups. 7 shared into 3s leaves 1. A number is even when the remainder after 2 is 0.',
    picture: c => { sky(c); for (const [g, x] of [[0, 30], [1, 92]] as const) { c.strokeStyle = '#8c9b85'; c.setLineDash([4, 3]); c.lineWidth = 2; c.beginPath(); c.roundRect(x - 6, 26, 56, 46, 10); c.stroke(); c.setLineDash([]); for (let k = 0; k < 3; k++) art(c, 'props/gem-1@1', x + 6 + (k % 2) * 22, 40 + Math.floor(k / 2) * 20, 0.55); void g; } art(c, 'props/gem-1@1', 176, 48, 0.7); arrow(c, 176, 92, 176, 66, '#c4602f', 3); label(c, '7 in 3s: 1 left', 110, 104, '#c4602f', 14); } },
  costume: { title: 'Costume', say: 'A costume is one picture of a sprite. Showing costumes one after another makes an animation.',
    picture: c => { sky(c); ['flap-1', 'flap-2', 'flap-3', 'flap-4'].forEach((f, i) => art(c, `cast/chick-${f}@1`, 32 + i * 52, 60, 0.85)); } },
};
export const knownWord = (id: string) => id in WORDS;

/** The card for one word, opened beside the word that was tapped. */
export function showWord(anchor: Element, id: string) {
  const word = WORDS[id]; if (!word) return;
  const canvas = document.createElement('canvas'), scale = Math.min(3, Math.max(1, devicePixelRatio || 1));
  canvas.width = W * scale; canvas.height = H * scale; canvas.className = 'word-picture'; canvas.setAttribute('aria-hidden', 'true');
  const c = canvas.getContext('2d'); if (c) { c.scale(scale, scale); c.lineJoin = 'round'; c.lineCap = 'round'; word.picture(c); }
  const title = document.createElement('strong'); title.className = 'word-title'; title.textContent = word.title;
  const say = document.createElement('p'); say.className = 'word-say'; say.append(...richText(word.say));
  pop(anchor, [title, canvas, say], { label: `What “${word.title}” means`, className: 'word-card', side: 'below', focus: true });
}
let installed = false;
/** One listener for every word button, wherever lesson text shows it. */
export function installWords() {
  if (installed) return; installed = true;
  document.addEventListener('click', event => {
    const button = (event.target as Element | null)?.closest?.('.word-ref') as HTMLElement | null;
    if (button?.dataset.word) { event.preventDefault(); showWord(button, button.dataset.word); }
  });
}
