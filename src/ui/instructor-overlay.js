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
    ctx.save();
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.min(canvas.width - 32, ctx.measureText(text).width + 36);
    const x = canvas.width / 2;
    const y = canvas.height - 116;
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x - width / 2, y - 18, width, 36);
    ctx.strokeStyle = state.level === 'warning' ? palette.warning : palette.border;
    ctx.strokeRect(x - width / 2, y - 18, width, 36);
    ctx.fillStyle = state.level === 'warning' ? palette.warning : palette.foreground;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
