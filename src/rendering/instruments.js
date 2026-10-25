// Flight instruments drawn directly into the chart viewport.

import { CONFIG } from '../config.js';

const RAD_TO_DEG = 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class InstrumentRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
  }

  // Draw the original viewport-wide pitch horizon and fixed level reference.
  drawAttitudeIndicator(state) {
    if (!CONFIG.SHOW_PITCH_INDICATOR) return;

    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const canvas = this.chart.canvas;
    const pitch = state.orientation.pitch * RAD_TO_DEG;
    const roll = state.orientation.roll;
    const alpha = state.getAlpha() * RAD_TO_DEG;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const pitchOffset = pitch * CONFIG.PITCH_SCALE_PIXELS_PER_DEG;
    const lineLength = Math.max(canvas.width, canvas.height) * 1.5;
    const horizonColor = alpha > 15
      ? palette.danger
      : alpha > 13 ? palette.warning : palette.foreground;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-roll);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = horizonColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(-lineLength, pitchOffset);
    ctx.lineTo(lineLength, pitchOffset);
    ctx.stroke();

    ctx.lineWidth = 1;
    const tickSpacing = 100;
    const tickCount = Math.floor(lineLength / tickSpacing);
    for (let index = -tickCount; index <= tickCount; index++) {
      if (index === 0) continue;
      const tickX = index * tickSpacing;
      ctx.beginPath();
      ctx.moveTo(tickX, pitchOffset - 5);
      ctx.lineTo(tickX, pitchOffset + 5);
      ctx.stroke();
    }

    // This fixed line makes the moving horizon's pitch displacement explicit.
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-lineLength, 0);
    ctx.lineTo(lineLength, 0);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.font = 'bold 11px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const pitchText = `${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°`;
    const labelX = -canvas.width / 2 + 40;
    const labelWidth = ctx.measureText(pitchText).width;
    ctx.fillStyle = palette.panelSolid;
    ctx.fillRect(labelX - 3, -7, labelWidth + 6, 14);
    ctx.strokeStyle = horizonColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(labelX - 3, -7, labelWidth + 6, 14);
    ctx.fillStyle = palette.foreground;
    ctx.fillText(pitchText, labelX, 0);
    ctx.restore();

    // Keep the pitch scale upright at both edges while the horizon rolls.
    ctx.save();
    ctx.strokeStyle = palette.muted;
    ctx.fillStyle = palette.foreground;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.82;
    ctx.font = 'bold 10px "B612 Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const leftX = 20;
    const rightX = canvas.width - 20;
    for (let degrees = -CONFIG.PITCH_SCALE_RANGE; degrees <= CONFIG.PITCH_SCALE_RANGE; degrees += 10) {
      const markY = centerY - degrees * CONFIG.PITCH_SCALE_PIXELS_PER_DEG;
      if (markY < 10 || markY > canvas.height - 10) continue;
      const label = degrees > 0 ? `+${degrees}°` : `${degrees}°`;

      ctx.beginPath();
      ctx.moveTo(leftX, markY);
      ctx.lineTo(leftX + 10, markY);
      ctx.stroke();
      ctx.fillText(label, leftX - 2, markY);

      ctx.textAlign = 'left';
      ctx.beginPath();
      ctx.moveTo(rightX - 10, markY);
      ctx.lineTo(rightX, markY);
      ctx.stroke();
      ctx.fillText(label, rightX + 2, markY);
      ctx.textAlign = 'right';
    }

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

  // Draw commanded engine power as a compact center-adjacent vertical tape.
  drawThrottleIndicator(throttle) {
    if (!CONFIG.SHOW_THROTTLE_INDICATOR) return;

    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const canvas = this.chart.canvas;
    const command = clamp(throttle, 0, 1);
    const width = clamp(CONFIG.THROTTLE_INDICATOR_WIDTH, 8, 28);
    const height = clamp(
      CONFIG.THROTTLE_INDICATOR_HEIGHT,
      60,
      Math.max(60, canvas.height - 88)
    );
    const x = clamp(
      canvas.width / 2 + CONFIG.THROTTLE_INDICATOR_OFFSET_X,
      8,
      Math.max(8, canvas.width - width - 32)
    );
    const y = clamp(
      canvas.height / 2 + CONFIG.THROTTLE_INDICATOR_OFFSET_Y - height / 2,
      30,
      Math.max(30, canvas.height - height - 30)
    );
    const innerHeight = height - 4;
    const fillHeight = innerHeight * command;
    const commandY = y + 2 + innerHeight - fillHeight;

    ctx.save();
    ctx.font = 'bold 9px "B612 Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.foreground;
    ctx.fillText('THR', x + width / 2, y - 11);

    ctx.fillStyle = palette.panel;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(x + 2, commandY, width - 4, fillHeight);
    ctx.strokeStyle = palette.foreground;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.strokeStyle = palette.muted;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const tickY = y + height - fraction * height;
      ctx.beginPath();
      ctx.moveTo(x - (fraction === 0 || fraction === 0.5 || fraction === 1 ? 5 : 3), tickY);
      ctx.lineTo(x, tickY);
      ctx.stroke();
    }

    // A small pointer makes the exact command readable even at low fill levels.
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(x + width + 2, commandY);
    ctx.lineTo(x + width + 7, commandY - 4);
    ctx.lineTo(x + width + 7, commandY + 4);
    ctx.fill();

    ctx.fillStyle = palette.foreground;
    ctx.fillText(`${Math.round(command * 100)}%`, x + width / 2, y + height + 11);
    ctx.restore();
  }

  drawGroundStatus(status) {
    if (!status) return;

    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const groundLabel = status.contact
      ? `${status.onRunway ? `${status.airportId ?? 'FIELD'} RWY ${status.runwayId ?? '--'}` : 'OFF RUNWAY'} ${String(status.surfaceType).toUpperCase()}`
      : `AIRBORNE AGL ${Math.max(0, Math.round(status.aglFt))}FT`;
    const motionLabel = status.contact
      ? `GS ${Math.round(status.groundSpeedKt)}KT BRAKE ${Math.round(status.brake * 100)}%`
      : '';
    const line = `${status.crashed ? 'CRASHED' : status.phase.toUpperCase()} | ${groundLabel}${motionLabel ? ` | ${motionLabel}` : ''}`;
    const color = status.crashed
      ? palette.danger
      : status.contact ? palette.selectedText : palette.foreground;
    const x = 20;
    const y = 57;

    ctx.save();
    ctx.font = 'bold 10px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const width = ctx.measureText(line).width + 10;
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x - 5, y - 3, width, status.message ? 31 : 16);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - 5, y - 3, width, status.message ? 31 : 16);
    ctx.fillStyle = color;
    ctx.fillText(line, x, y);

    if (status.message) {
      ctx.fillStyle = status.crashed ? palette.danger : palette.accent;
      ctx.fillText(status.message, x, y + 15);
    }
    ctx.restore();
  }

  drawEnvelopeStatus(status, controls, specs) {
    if (!status) return;

    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const flapAngle = Math.round((controls.flaps ?? 0) * specs.flapMaxDeg);
    const gText = `${status.loadFactorG >= 0 ? '+' : ''}${status.loadFactorG.toFixed(1)}G`;
    const mainLine = `${status.phase.toUpperCase()} | ${gText} | AOA ${status.alphaDeg.toFixed(1)}° | FLAP ${flapAngle}°`;
    let actionLine = '';

    if (status.failed) {
      actionLine = `${status.failureCause || 'STRUCTURAL FAILURE'} | DAMAGE 100%`;
    } else if (status.spinning) {
      const rudder = status.spinDirection > 0 ? 'LEFT' : 'RIGHT';
      actionLine = `SPIN ${status.spinDirection > 0 ? 'RIGHT' : 'LEFT'} | PUSH + RUDDER ${rudder} | REC ${Math.round(status.recoveryProgress * 100)}%`;
    } else if (status.recovering) {
      actionLine = 'RECOVERING | REDUCE AOA + LEVEL THE WINGS';
    } else if (status.warning) {
      actionLine = `STALL MARGIN ${status.stallMarginDeg.toFixed(1)}° | LOWER THE NOSE`;
    } else if (status.overspeed) {
      actionLine = `VNE ${specs.Vne}KT | REDUCE SPEED`;
    } else if (status.structuralDamage > 0) {
      actionLine = `STRUCTURAL DAMAGE ${Math.round(status.structuralDamage * 100)}%`;
    } else if (status.groundEffect > 0.01) {
      actionLine = `GROUND EFFECT ${Math.round(status.groundEffect * 100)}%`;
    }

    const danger = status.failed || status.spinning || status.stalled;
    const caution = status.warning || status.overspeed || status.structuralDamage > 0;
    const color = danger
      ? palette.danger
      : caution ? palette.warning : palette.foreground;
    const x = 20;
    const y = 96;

    ctx.save();
    ctx.font = 'bold 10px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const width = Math.max(
      ctx.measureText(mainLine).width,
      actionLine ? ctx.measureText(actionLine).width : 0
    ) + 10;
    const height = actionLine ? 31 : 16;
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x - 5, y - 3, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - 5, y - 3, width, height);
    ctx.fillStyle = color;
    ctx.fillText(mainLine, x, y);

    if (actionLine) {
      ctx.fillStyle = danger ? palette.danger : palette.accent;
      ctx.fillText(actionLine, x, y + 15);
    }
    ctx.restore();
  }
}
