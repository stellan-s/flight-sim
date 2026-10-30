import { drawAsciiText } from '../rendering/ascii-hud.js';

function wrapSubtitle(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

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
    const font = 'bold 14px "B612 Mono", monospace';
    const maxTextWidth = Math.max(120, canvas.width - 64);

    ctx.save();
    ctx.font = font;
    const lines = wrapSubtitle(ctx, text, maxTextWidth);
    const lineHeight = 19;
    const widestLine = Math.max(...lines.map(line => ctx.measureText(line).width));
    const backgroundWidth = Math.min(canvas.width - 24, widestLine + 28);
    const backgroundHeight = lines.length * lineHeight + 12;
    const backgroundX = x - backgroundWidth / 2;
    const backgroundY = y - backgroundHeight / 2;

    // A borderless inverse strip remains legible over runways and force vectors.
    ctx.fillStyle = state.level === 'warning'
      ? palette.danger
      : palette.foreground;
    ctx.fillRect(backgroundX, backgroundY, backgroundWidth, backgroundHeight);
    ctx.restore();

    lines.forEach((line, index) => {
      const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
      drawAsciiText(ctx, line, x, lineY, {
        color: palette.background,
        font,
        align: 'center',
        baseline: 'middle'
      });
    });
  }
}
