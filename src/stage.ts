import type { DrawCommand } from './runtime/protocol';

export class Stage {
  private commands: DrawCommand[] = [];
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser does not support a drawing canvas.');
    this.context = context;
    this.paint();
  }

  reset() { this.commands = []; this.paint(); }

  accept(command: DrawCommand) {
    if (this.commands.length >= 10_000) return;
    this.commands.push(command);
  }

  paint() {
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fdfdf9';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#d9dfd5';
    for (let x = 0; x < width; x += 20) for (let y = 0; y < height; y += 20) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(width / 2, height / 2);
    let x = 0, y = 0, heading = 0;
    for (const command of this.commands) {
      if (command.type === 'turn') { heading = command.heading; continue; }
      if (command.draw) {
        ctx.strokeStyle = command.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(command.x1, -command.y1); ctx.lineTo(command.x2, -command.y2); ctx.stroke();
      }
      x = command.x2; y = command.y2;
    }
    ctx.translate(x, -y); ctx.rotate(heading * Math.PI / 180);
    ctx.fillStyle = '#e47d4b'; ctx.strokeStyle = '#fdfdf9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-8, -7); ctx.lineTo(-5, 0); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    this.canvas.dataset.commandCount = String(this.commands.length);
  }
}
