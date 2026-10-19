import type { Ctx } from './draw';

/** The first library backdrops (Forest, Coral reef, City park, Space), kept as
 * they were drawn: flat shapes without outlines. */
type Context = Ctx;
function ellipse(c: Context, x: number, y: number, rx: number, ry: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function shape(c: Context, points: number[][], fill: string) { c.fillStyle = fill; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); }
function rect(c: Context, x: number, y: number, w: number, h: number, fill: string, radius = 0) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); }
const ink = '#263f4b';
export function paintLegacyBackdrop(c: Context, id: string) {
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
