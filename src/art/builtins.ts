import { INK, LINE, BLUSH, ellipse, shade, shape, type Ctx } from './draw';

/** The four built-in costumes every project has, in the cast's style. Their
 * ids, sizes, silhouettes and main colours stay as they were (Bird #478b94,
 * Star #e8b94f, Ball #9c83ba, Box #e58d60), so touch and colour sensing in
 * existing projects behave the same. Drawn every frame, centred on the origin. */
export function paintBuiltin(c: Ctx, id: string) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if (id === 'star') {
    const points: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 10 : 21.3; points.push([Math.cos(angle) * r, Math.sin(angle) * r]); }
    shape(c, points, '#e8b94f');
    shape(c, points.map(([x, y]) => [x * 0.55, y * 0.55 - 1.5] as [number, number]), '#f6d47c', null);
    ellipse(c, -4.5, -6, 2.4, 1.6, '#fff6d6', null, 0, -0.5);
  } else if (id === 'ball') {
    ellipse(c, 0, 0, 19.3, 19.3, '#9c83ba');
    c.save(); c.beginPath(); c.arc(0, 0, 18.6, 0, Math.PI * 2); c.clip();
    ellipse(c, 6, 9, 17, 14, '#8a70a8', null);
    c.restore(); ellipse(c, 0, 0, 19.3, 19.3, undefined);
    ellipse(c, -7, -8, 5.5, 3.6, '#c9b8dd', null, 0, -0.6); ellipse(c, -9, -9.5, 1.8, 1.2, '#ffffff', null, 0, -0.6);
  } else if (id === 'box') {
    c.beginPath(); c.roundRect(-21.3, -21.3, 42.6, 42.6, 8); c.fillStyle = '#e58d60'; c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
    c.beginPath(); c.roundRect(-15, -15, 30, 30, 5); c.fillStyle = shade(c, -15, 15, '#f2a77c', '#e58d60'); c.fill(); c.strokeStyle = '#c96f45'; c.lineWidth = 1.2; c.stroke();
    ellipse(c, -9, -10, 3, 1.8, '#fbd0b4', null, 0, -0.4);
  } else {
    // Bird: the same body and beak, now with a wing, a tail and a face.
    shape(c, [[-19, -1], [-24, -7], [-23, 1], [-25, 6], [-18, 4]], '#356f78');
    ellipse(c, -3, 2, 19, 14, '#478b94');
    c.save(); c.beginPath(); c.ellipse(-3, 2, 18.3, 13.3, 0, 0, Math.PI * 2); c.clip();
    ellipse(c, 0, 12, 14, 7, '#6aa9ad', null);
    c.restore();
    shape(c, [[12, -7], [24, -1], [12, 3]], '#e8b94f');
    c.save(); c.translate(-6, 1); c.rotate(-0.25); ellipse(c, 0, 0, 9, 5.5, '#356f78'); c.restore();
    ellipse(c, 7, -4, 4, 4.4, '#ffffff'); ellipse(c, 8.2, -4, 2.1, 2.5, '#253e43', null); ellipse(c, 8.9, -5, 0.8, 0.8, '#ffffff', null);
    ellipse(c, 6, 3.5, 2.4, 1.5, BLUSH, null);
  }
  c.restore();
}
