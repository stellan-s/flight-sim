import { drawAsciiText } from '../rendering/ascii-hud.js';

export class InstructorOverlay {
  constructor() {
    this.message = '';
    this.level = 'instruction';
    this.expiresAt = 0;
  }

  show(message, { level = 'instruction', durationSeconds = 8 } = {}, now = 0) {
    this.message = String(message ?? '').trim().slice(0, 180);
    this.level = level;
    this.expiresAt = durationSeconds > 0 ? now + durationSeconds : Infinity;
    return this.getState(now);
  }

  clear() {
    this.message = '';
    this.expiresAt = 0;
  }

  getState(now = 0) {
    const visible = Boolean(this.message) && now < this.expiresAt;
    return { message: visible ? this.message : '', level: this.level, visible };
  }

  draw(ctx, canvas, palette, now = 0) {
    const state = this.getState(now);
    if (!state.visible) return;

    const text = `> ${state.message.toUpperCase()}`;
    const x = canvas.width / 2;
    const y = Math.max(105, canvas.height - 210);
    drawAsciiText(ctx, text, x, y, {
      color: state.level === 'warning' ? palette.warning : palette.foreground,
      haloColor: palette.panelSolid,
      font: 'bold 14px "B612 Mono", monospace',
      align: 'center',
      baseline: 'middle',
      haloWidth: 4
    });
  }
}
