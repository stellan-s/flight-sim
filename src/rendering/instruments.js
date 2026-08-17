// Navigation instruments (CDI, etc.)

import { CONFIG } from '../config.js';

export class InstrumentRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
  }

  // Draw Attitude Indicator - Simple horizon line across screen
  drawAttitudeIndicator(state, x, y) {
    const ctx = this.chart.ctx;

    const pitch = state.orientation.pitch * 180 / Math.PI; // degrees
    const roll = state.orientation.roll; // radians
    const alpha = state.getAlpha() * 180 / Math.PI; // angle of attack in degrees

    ctx.save();

    // Translate to center of canvas
    const centerX = this.chart.canvas.width / 2;
    const centerY = this.chart.canvas.height / 2;
    ctx.translate(centerX, centerY);

    // Rotate for roll
    ctx.rotate(-roll);

    // Calculate vertical offset based on configured pitch scale.
    const pitchOffset = pitch * CONFIG.PITCH_SCALE_PIXELS_PER_DEG;

    // Draw horizon line across entire screen width
    const lineLength = Math.max(this.chart.canvas.width, this.chart.canvas.height) * 1.5;

    // Color based on angle of attack - red if approaching/in stall
    const STALL_WARNING_AOA = 13; // degrees - warning threshold
    const STALL_AOA = 15; // degrees - critical stall threshold

    if (alpha > STALL_AOA) {
      ctx.strokeStyle = '#dd0000'; // Red - stall!
    } else if (alpha > STALL_WARNING_AOA) {
      ctx.strokeStyle = '#ff8800'; // Orange - stall warning
    } else {
      ctx.strokeStyle = '#000000'; // Black - normal
    }

    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.moveTo(-lineLength, pitchOffset);
    ctx.lineTo(lineLength, pitchOffset);
    ctx.stroke();

    // Add small tick marks on the horizon line
    ctx.lineWidth = 1;
    const tickSpacing = 100;
    const numTicks = Math.floor(lineLength / tickSpacing);

    for (let i = -numTicks; i <= numTicks; i++) {
      if (i === 0) continue; // Skip center
      const tickX = i * tickSpacing;
      ctx.beginPath();
      ctx.moveTo(tickX, pitchOffset - 5);
      ctx.lineTo(tickX, pitchOffset + 5);
      ctx.stroke();
    }

    // Draw pitch reference line (second horizontal line)
    // This line is always at the center (0), showing where level flight would be
    // The horizon line moves up/down based on pitch
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    // Draw horizontal reference line at center (0 pitch reference)
    ctx.beginPath();
    ctx.moveTo(-lineLength, 0);
    ctx.lineTo(lineLength, 0);
    ctx.stroke();

    // Draw pitch value label on the reference line (far left)
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 11px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const pitchText = `${pitch.toFixed(1)}°`;
    const textMetrics = ctx.measureText(pitchText);
    const padding = 3;
    const labelX = -this.chart.canvas.width / 2 + 40; // Far left position

    // Background box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(labelX - padding, -7, textMetrics.width + padding * 2, 14);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(labelX - padding, -7, textMetrics.width + padding * 2, 14);

    // Text
    ctx.fillStyle = '#000000';
    ctx.fillText(pitchText, labelX, 0);

    ctx.restore();

    // Draw pitch scale on screen edges (not rotated)
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.font = 'bold 12px "B612 Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Left side pitch scale
    const leftX = 20;
    const rightX = this.chart.canvas.width - 20;
    const pixelsPerDegree = CONFIG.PITCH_SCALE_PIXELS_PER_DEG;

    // Draw ticks every 10 degrees across the configured pitch range.
    for (let deg = -CONFIG.PITCH_SCALE_RANGE; deg <= CONFIG.PITCH_SCALE_RANGE; deg += 10) {
      const yPos = centerY - (deg * pixelsPerDegree);

      // Only draw if on screen
      if (yPos < 10 || yPos > this.chart.canvas.height - 10) continue;

      // Left tick
      ctx.beginPath();
      ctx.moveTo(leftX, yPos);
      ctx.lineTo(leftX + 10, yPos);
      ctx.stroke();

      // Left label
      ctx.fillText(deg > 0 ? `+${deg}°` : `${deg}°`, leftX - 2, yPos);

      // Right tick
      ctx.textAlign = 'left';
      ctx.beginPath();
      ctx.moveTo(rightX - 10, yPos);
      ctx.lineTo(rightX, yPos);
      ctx.stroke();

      // Right label
      ctx.fillText(deg > 0 ? `+${deg}°` : `${deg}°`, rightX + 2, yPos);
      ctx.textAlign = 'right';
    }

    // Draw 0 degree reference line (centerline)
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(leftX + 15, centerY);
    ctx.lineTo(leftX + 50, centerY);
    ctx.moveTo(rightX - 50, centerY);
    ctx.lineTo(rightX - 15, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }
}
