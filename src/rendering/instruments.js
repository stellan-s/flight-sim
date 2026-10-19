// Compact flight instruments.

import { CONFIG } from '../config.js';

const RAD_TO_DEG = 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getPitchLadderMarks(pitchDeg, range = CONFIG.PITCH_SCALE_RANGE) {
  const start = Math.ceil((pitchDeg - range) / 5) * 5;
  const end = Math.floor((pitchDeg + range) / 5) * 5;
  const marks = [];
  for (let degrees = start; degrees <= end; degrees += 5) marks.push(degrees);
  return marks;
}

export class InstrumentRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
  }

  // Draw a compact moving pitch ladder with fixed aircraft references.
  drawAttitudeIndicator(state) {
    if (!CONFIG.SHOW_PITCH_INDICATOR) return;

    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const canvas = this.chart.canvas;
    const pitch = state.orientation.pitch * RAD_TO_DEG;
    const roll = state.orientation.roll;
    const rollDeg = roll * RAD_TO_DEG;
    const alpha = state.getAlpha() * RAD_TO_DEG;

    const width = Math.min(
      Math.max(140, CONFIG.PITCH_INDICATOR_WIDTH),
      Math.max(96, canvas.width - 16)
    );
    const height = Math.min(
      Math.max(110, CONFIG.PITCH_INDICATOR_HEIGHT),
      Math.max(90, canvas.height - 16)
    );
    const x = clamp(CONFIG.PITCH_INDICATOR_X, 8, Math.max(8, canvas.width - width - 8));
    const y = clamp(CONFIG.PITCH_INDICATOR_Y, 8, Math.max(8, canvas.height - height - 8));
    const headerHeight = 24;
    const footerHeight = 20;
    const inner = {
      left: x + 8,
      right: x + width - 8,
      top: y + headerHeight,
      bottom: y + height - footerHeight
    };
    const centerX = (inner.left + inner.right) / 2;
    const centerY = (inner.top + inner.bottom) / 2;
    const innerWidth = inner.right - inner.left;

    const borderColor = alpha > 15
      ? palette.danger
      : alpha > 13 ? palette.warning : palette.border;

    ctx.save();
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.beginPath();
    ctx.moveTo(x, y + headerHeight);
    ctx.lineTo(x + width, y + headerHeight);
    ctx.moveTo(x, y + height - footerHeight);
    ctx.lineTo(x + width, y + height - footerHeight);
    ctx.strokeStyle = palette.gridLabel;
    ctx.stroke();

    ctx.font = 'bold 10px "B612 Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'left';
    ctx.fillText('PITCH', x + 8, y + headerHeight / 2);
    ctx.fillStyle = palette.foreground;
    ctx.textAlign = 'right';
    ctx.fillText(`${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°`, x + width - 8, y + headerHeight / 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.left, inner.top, innerWidth, inner.bottom - inner.top);
    ctx.clip();
    ctx.translate(centerX, centerY);
    ctx.rotate(-roll);
    ctx.font = '8px "B612 Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const scale = CONFIG.PITCH_SCALE_PIXELS_PER_DEG;
    const centerGap = 18;
    for (const mark of getPitchLadderMarks(pitch)) {
      const markY = (pitch - mark) * scale;
      const isHorizon = mark === 0;
      const major = Math.abs(mark) % 10 === 0;
      const halfLength = isHorizon ? innerWidth * 0.43 : major ? 38 : 25;

      ctx.strokeStyle = isHorizon ? palette.foreground : major ? palette.foreground : palette.muted;
      ctx.lineWidth = isHorizon ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(-halfLength, markY);
      ctx.lineTo(-centerGap / 2, markY);
      ctx.moveTo(centerGap / 2, markY);
      ctx.lineTo(halfLength, markY);
      ctx.stroke();

      if (major && !isHorizon) {
        ctx.fillStyle = palette.foreground;
        ctx.fillText(String(Math.abs(mark)), -halfLength - 11, markY);
        ctx.fillText(String(Math.abs(mark)), halfLength + 11, markY);
      }
    }
    ctx.restore();

    // Fixed aircraft reference: the ladder moves, these wings do not.
    ctx.strokeStyle = palette.accent;
    ctx.fillStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 38, centerY);
    ctx.lineTo(centerX - 11, centerY);
    ctx.lineTo(centerX - 5, centerY + 5);
    ctx.moveTo(centerX + 38, centerY);
    ctx.lineTo(centerX + 11, centerY);
    ctx.lineTo(centerX + 5, centerY + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '9px "B612 Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'left';
    ctx.fillText('BANK', x + 8, y + height - footerHeight / 2);
    ctx.fillStyle = palette.foreground;
    ctx.textAlign = 'right';
    ctx.fillText(`${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`, x + width - 8, y + height - footerHeight / 2);
    ctx.restore();
  }
}
