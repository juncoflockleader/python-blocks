import { assetCanvas, type AssetKind } from './assets';
import { builtins, builtinBackdrops, type Costume, type SceneState } from './model';

export interface StockArtwork { id: string; name: string; category: string; kind: AssetKind; width: number; height: number; builtin?: boolean }
const costume = (id: string, name: string, category: string, size = 64): StockArtwork => ({ id, name, category, kind: 'costume', width: size, height: size });
export const stockArtwork: StockArtwork[] = [
  ...builtins.map(a => ({ ...a, kind: 'costume' as const, category: a.id === 'bird' ? 'Characters' : 'Objects', builtin: true })),
  ...[['cat', 'Cat'], ['fox', 'Fox'], ['rabbit', 'Rabbit'], ['robot', 'Robot'], ['fish', 'Fish'], ['turtle', 'Turtle'], ['bee', 'Bee'], ['rocket', 'Rocket']].map(([id, name]) => costume(id, name, 'Characters')),
  ...[['tree', 'Tree'], ['flower', 'Flower'], ['coin', 'Coin'], ['gem', 'Gem']].map(([id, name]) => costume(id, name, 'Objects')),
  ...[['grass', 'Grass tile'], ['stone', 'Stone tile'], ['sand', 'Sand tile'], ['metal', 'Metal tile']].map(([id, name]) => costume(id, name, 'Tiles', 32)),
  ...builtinBackdrops.map(a => ({ ...a, kind: 'backdrop' as const, category: 'Backdrops', builtin: true })),
  ...[['forest', 'Forest'], ['reef', 'Coral reef'], ['city', 'City park'], ['space', 'Space']].map(([id, name]) => ({ id, name, kind: 'backdrop' as const, category: 'Backdrops', width: 480, height: 320 })),
];

type Context = CanvasRenderingContext2D;
function ellipse(c: Context, x: number, y: number, rx: number, ry: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function shape(c: Context, points: number[][], fill: string) { c.fillStyle = fill; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); }
function rect(c: Context, x: number, y: number, w: number, h: number, fill: string, radius = 0) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); }
const ink = '#263f4b', cream = '#fff5dc';
function eyes(c: Context, x = 0, y = -3, gap = 9) { for (const side of [-1, 1]) { ellipse(c, x + gap * side, y, 2.5, 3, ink); ellipse(c, x + gap * side + .6, y - 1, .8, .8, '#ffffff'); } }
function paintCostume(c: Context, id: string) {
  // Original vector artwork is rasterized only when added to a project. Saved
  // PNGs use the existing asset format and work in older runtimes and exports.
  if (id === 'cat' || id === 'fox') {
    const fox = id === 'fox', fur = fox ? '#d7794c' : '#dba64d';
    ellipse(c, 0, 17, 17, 13, fur); ellipse(c, 0, 20, 10, 9, cream);
    c.strokeStyle = fur; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(13, 22); c.quadraticCurveTo(30, 23, 25, 8); c.stroke();
    shape(c, [[-24,-21],[-20,-4],[-5,-13]], fur); shape(c, [[24,-21],[20,-4],[5,-13]], fur);
    shape(c, [[-20,-16],[-17,-5],[-10,-11]], '#e9b3a0'); shape(c, [[20,-16],[17,-5],[10,-11]], '#e9b3a0');
    ellipse(c, 0, -3, 23, 19, fur);
    if (fox) { shape(c, [[-23,-3],[0,16],[23,-3],[8,4],[0,2],[-8,4]], cream); }
    else { ellipse(c, -6, 7, 8, 6, cream); ellipse(c, 6, 7, 8, 6, cream); }
    eyes(c); shape(c, [[-3,5],[3,5],[0,9]], ink);
    if (!fox) { c.strokeStyle = '#9e702f'; c.lineWidth = 2; for (const x of [-7, 0, 7]) { c.beginPath(); c.moveTo(x,-19); c.lineTo(x,-12); c.stroke(); } }
  } else if (id === 'rabbit') {
    ellipse(c, -10,-15,7,16,'#d8dee4'); ellipse(c,10,-15,7,16,'#d8dee4'); ellipse(c,-10,-17,3,10,'#e7acb0'); ellipse(c,10,-17,3,10,'#e7acb0');
    ellipse(c,0,19,18,12,'#d8dee4'); ellipse(c,0,3,22,19,'#eef0e9'); eyes(c,0,1); ellipse(c,0,9,3,2,'#d98f99'); ellipse(c,-11,26,9,4,'#fff5dc'); ellipse(c,11,26,9,4,'#fff5dc');
  } else if (id === 'robot') {
    rect(c,-16,7,32,22,'#428d9b',6); rect(c,-24,10,6,18,'#9ac6c8',3); rect(c,18,10,6,18,'#9ac6c8',3);
    rect(c,-20,-21,40,30,'#91c6c6',8); rect(c,-15,-15,30,17,ink,5); ellipse(c,-8,-7,3,3,'#f2da7a'); ellipse(c,8,-7,3,3,'#f2da7a');
    rect(c,-1,-27,2,8,ink); ellipse(c,0,-27,3,3,'#e08c66'); ellipse(c,0,17,4,4,'#e8b94f'); rect(c,-13,27,8,4,ink,2); rect(c,5,27,8,4,ink,2);
  } else if (id === 'fish') {
    shape(c,[[-12,0],[-29,-15],[-27,15]],'#e8b94f'); ellipse(c,1,0,23,16,'#e58d60'); shape(c,[[0,2],[-9,10],[-5,-4]],'#b85f43'); ellipse(c,14,-4,5,5,cream); ellipse(c,15,-4,2.5,3,ink); shape(c,[[-6,-13],[3,-24],[10,-13]],'#e8b94f');
  } else if (id === 'turtle') {
    for (const x of [-14,14]) for (const y of [-15,15]) ellipse(c,x,y,6,7,'#a2b879'); ellipse(c,25,0,7,9,'#a2b879');
    ellipse(c,-2,0,24,21,'#4d8e73'); shape(c,[[-14,-7],[-2,-15],[11,-7],[11,7],[-2,15],[-14,7]],'#8cba81'); ellipse(c,27,-3,1.7,2,ink);
  } else if (id === 'bee') {
    ellipse(c,-9,-15,11,13,'#cde8e8'); ellipse(c,10,-15,11,13,'#e4f1ee'); ellipse(c,0,3,24,17,'#e8b94f');
    c.save(); c.beginPath(); c.ellipse(0,3,24,17,0,0,Math.PI*2); c.clip(); rect(c,-12,-17,6,40,ink); rect(c,0,-17,6,40,ink); c.restore(); ellipse(c,15,0,2.5,3,ink);
  } else if (id === 'rocket') {
    shape(c,[[-9,18],[0,31],[9,18]],'#e5a142'); shape(c,[[-6,18],[0,25],[6,18]],cream);
    shape(c,[[-10,1],[-23,22],[-10,18]],'#d77e66'); shape(c,[[10,1],[23,22],[10,18]],'#d77e66');
    c.fillStyle='#e8eee8'; c.beginPath(); c.moveTo(-12,19); c.quadraticCurveTo(-17,-12,0,-29); c.quadraticCurveTo(17,-12,12,19); c.closePath(); c.fill();
    ellipse(c,0,-6,8,8,'#5d9ba7'); ellipse(c,0,-6,5,5,'#264d66'); rect(c,-11,15,22,5,'#d77e66',2);
  } else if (id === 'tree') {
    rect(c,-5,5,10,26,'#926744',2); ellipse(c,-12,-4,16,19,'#5b9b75'); ellipse(c,13,-5,16,20,'#477f64'); ellipse(c,0,-14,18,17,'#77ae7e'); ellipse(c,-4,-20,6,4,'#96c68b');
  } else if (id === 'flower') {
    rect(c,-2,0,4,30,'#51866d'); ellipse(c,-9,17,10,4,'#79a374'); ellipse(c,9,22,10,4,'#79a374');
    for (let i=0;i<6;i++) { const angle=i*Math.PI/3; ellipse(c,Math.cos(angle)*13,-10+Math.sin(angle)*13,9,9,'#d88da4'); } ellipse(c,0,-10,9,9,'#efd174'); ellipse(c,-2,-13,3,2,cream);
  } else if (id === 'coin') {
    ellipse(c,0,0,23,27,'#c58b38'); ellipse(c,-2,-2,20,24,'#efc75d'); c.strokeStyle='#d9a341'; c.lineWidth=3; c.beginPath(); c.ellipse(-2,-2,14,18,0,0,Math.PI*2); c.stroke(); shape(c,[[-2,-14],[2,-5],[10,-4],[4,2],[6,12],[-2,7],[-10,12],[-8,2],[-14,-4],[-5,-5]],cream);
  } else if (id === 'gem') {
    shape(c,[[-16,-21],[16,-21],[28,-6],[0,28],[-28,-6]],'#5896b6'); shape(c,[[-16,-21],[0,-6],[-28,-6]],'#a6dece'); shape(c,[[16,-21],[0,-6],[28,-6]],'#80c9c6'); shape(c,[[-16,-21],[16,-21],[0,-6]],'#d2eee0'); shape(c,[[-28,-6],[0,-6],[0,28]],'#77c1bd'); shape(c,[[0,-6],[28,-6],[0,28]],'#397c9d');
  } else {
    const colors: Record<string,string[]> = {grass:['#997550','#6ba56c'], stone:['#87969c','#b7c0bd'], sand:['#dec286','#ecd6a0'], metal:['#557885','#84a7ab']};
    const [base,light] = colors[id]; rect(c,-16,-16,32,32,base); rect(c,-16,-16,32,id==='grass'?9:3,light);
    if (id==='grass') { for (let i=0;i<5;i++) shape(c,[[-16+i*8,-9],[-12+i*8,-3],[-8+i*8,-9]],light); for(const [x,y] of [[-9,5],[4,11],[10,1]]) ellipse(c,x,y,2,1,'#bb9466'); }
    if (id==='stone') { c.strokeStyle='#677980'; c.lineWidth=1; for(const y of [-5,6]) { c.beginPath(); c.moveTo(-16,y); c.lineTo(16,y); c.stroke(); } for(const [x,y] of [[-5,-16],[8,-5],[-5,6]]) { c.beginPath(); c.moveTo(x,y); c.lineTo(x,y+11); c.stroke(); } }
    if (id==='sand') { for(let i=0;i<9;i++) ellipse(c,(i*13%28)-14,(i*7%26)-10,1,.8,i%2?'#c9a76e':'#f7e9c7'); }
    if (id==='metal') { c.strokeStyle='#335561'; c.lineWidth=2; c.strokeRect(-12,-12,24,24); for(const x of [-10,10]) for(const y of [-10,10]) ellipse(c,x,y,1.5,1.5,'#d1ddcf'); }
  }
}

function paintBackdrop(c: Context, id: string) {
  const gradient = c.createLinearGradient(0,0,0,320);
  const colors: Record<string,string[]> = {forest:['#d7e9c3','#a4cbad'],reef:['#57b4ca','#185b82'],city:['#bddde6','#eef0d4'],space:['#1c274b','#514f7b']};
  gradient.addColorStop(0,colors[id][0]); gradient.addColorStop(1,colors[id][1]); c.fillStyle=gradient; c.fillRect(0,0,480,320);
  if (id==='forest') {
    ellipse(c,347,63,30,30,'#f5df9c');
    for(let i=0;i<8;i++) { const x=i*73-10, y=92+(i%3)*19; rect(c,x-6,y,12,210,'#6c9681'); ellipse(c,x,y,48,69,'#8bb795'); }
    ellipse(c,90,336,290,110,'#5d9675'); ellipse(c,440,340,290,95,'#76a77a');
    c.fillStyle='#d9c89b'; c.beginPath(); c.moveTo(210,320); c.bezierCurveTo(80,272,350,256,270,233); c.lineTo(289,233); c.bezierCurveTo(379,263,199,284,329,320); c.fill();
    for(const x of [26,450]) { rect(c,x-12,58,24,262,'#82654c'); ellipse(c,x,15,85,88,'#3c765c'); ellipse(c,x+25,25,60,67,'#518666'); }
  } else if (id==='reef') {
    c.globalAlpha=.15; shape(c,[[30,0],[85,0],[290,320],[160,320]],'#e9f8d8'); shape(c,[[180,0],[204,0],[370,320],[310,320]],'#e9f8d8'); c.globalAlpha=1;
    ellipse(c,245,345,350,85,'#ddc58e');
    for(let i=0;i<9;i++) { const x=20+i*53; c.strokeStyle=i%2?'#76b19b':'#388f85'; c.lineWidth=7; c.lineCap='round'; c.beginPath(); c.moveTo(x,300); c.bezierCurveTo(x-20,270,x+20,252,x,233-(i%3)*15); c.stroke(); }
    for(const [x,y] of [[45,289],[415,294],[358,309]]) { c.strokeStyle='#db9295'; c.lineWidth=8; c.beginPath(); c.moveTo(x,y); c.lineTo(x,y-45); c.moveTo(x,y-16); c.lineTo(x-18,y-32); c.moveTo(x,y-25); c.lineTo(x+15,y-39); c.stroke(); }
    c.strokeStyle='#b8dfdd'; c.lineWidth=1.5; for(let i=0;i<8;i++){ c.beginPath(); c.arc(60+i*51,75+(i*31)%140,3+i%3,0,Math.PI*2); c.stroke(); }
  } else if(id==='city') {
    ellipse(c,392,61,29,29,'#f5df9c');
    for(let i=0;i<8;i++) { const x=i*68-12,h=60+(i*29)%75; rect(c,x,233-h,56,h,i%2?'#91b4ba':'#a7c5c4',3); for(let y=246-h;y<225;y+=18) for(let j=0;j<3;j++) rect(c,x+8+j*16,y,8,10,'#d7e5d3',1); }
    rect(c,0,233,480,87,'#83aa7b'); rect(c,0,277,480,27,'#dacdaa');
    for(const x of [52,424]) { rect(c,x-4,208,8,67,'#85684d'); ellipse(c,x,208,32,38,'#568a6b'); ellipse(c,x-12,197,22,23,'#6ca17a'); }
    rect(c,188,257,91,7,'#b78655',2); rect(c,192,242,83,11,'#b78655',2); rect(c,198,264,5,17,ink); rect(c,264,264,5,17,ink);
  } else {
    for(let i=0;i<64;i++) ellipse(c,(i*137+21)%480,(i*71+17)%320,i%5===0?2:1,i%5===0?2:1,'#eee9cf');
    ellipse(c,355,99,51,51,'#be8eaa'); c.save(); c.translate(355,99); c.rotate(-.3); c.strokeStyle='#dfbcab'; c.lineWidth=10; c.beginPath(); c.ellipse(0,0,80,17,0,0,Math.PI); c.stroke(); c.restore();
    ellipse(c,81,247,25,25,'#6caaa9'); ellipse(c,73,242,9,7,'#97c7b5'); ellipse(c,88,258,6,5,'#518892');
  }
}

export async function stockCanvas(art: StockArtwork) {
  if (art.builtin) return assetCanvas(art, art.kind);
  const canvas = document.createElement('canvas'); canvas.width = art.width; canvas.height = art.height;
  const c = canvas.getContext('2d')!;
  if (art.kind === 'backdrop') paintBackdrop(c,art.id);
  else { c.translate(art.width/2,art.height/2); paintCostume(c,art.id); }
  return canvas;
}

/** Adds only the chosen artwork to a captured scene. IDs never reserve or
 * overwrite a learner's existing assets; identical stock PNGs are reused. */
export async function includeStock(scene: SceneState, kind: AssetKind, id: string) {
  const art = stockArtwork.find(a => a.id === id && a.kind === kind);
  if (!art) throw new Error('Choose available stock artwork.');
  if (art.builtin) return art.id;
  const data = (await stockCanvas(art)).toDataURL('image/png');
  const assets = kind === 'costume' ? scene.assets : (scene.backdrops ??= []);
  const found = assets.find(a => a.data === data && a.width === art.width && a.height === art.height);
  if (found) return found.id;
  const asset: Costume = { id: crypto.randomUUID(), name: art.name, width: art.width, height: art.height, data };
  assets.push(asset); return asset.id;
}
