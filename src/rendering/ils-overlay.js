import { CONFIG } from '../config.js';
import { drawAsciiText } from './ascii-hud.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export class IlsOverlayRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
  }

  draw(guidance) {
    if (!CONFIG.SHOW_ILS_OVERLAY || !guidance?.available) return;

    const { ctx, canvas, palette } = this.chart;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const horizontalTravel = canvas.width * clamp(CONFIG.ILS_OVERLAY_TRAVEL, 0.08, 0.42);
    const verticalTravel = canvas.height * clamp(CONFIG.ILS_OVERLAY_TRAVEL, 0.08, 0.42);
    const localizerX = centerX + guidance.localizerNeedle * horizontalTravel;
    const glideslopeY = centerY + guidance.glideslopeNeedle * verticalTravel;
    // Use vector colors so ILS guidance remains colored in the black/white map theme.
    const capturedColor = palette.vectorThrust ?? palette.course;
    const locColor = guidance.localizerCaptured
      ? capturedColor
      : (palette.vectorSide ?? palette.direct);
    const gsColor = guidance.glideslopeCaptured
      ? capturedColor
      : (palette.vectorPitchMoment ?? palette.accent);
    const top = 86;
    const bottom = canvas.height - 32;

    ctx.save();
    ctx.lineWidth = guidance.captured ? 2 : 1.4;
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = locColor;
    ctx.beginPath();
    ctx.moveTo(localizerX, top);
    ctx.lineTo(localizerX, bottom);
    ctx.stroke();

    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = gsColor;
    ctx.beginPath();
    ctx.moveTo(0, glideslopeY);
    ctx.lineTo(canvas.width, glideslopeY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.muted;
    ctx.beginPath();
    for (const step of [-1, -0.5, 0.5, 1]) {
      const x = centerX + step * horizontalTravel;
      ctx.moveTo(x, centerY - 5);
      ctx.lineTo(x, centerY + 5);
      const y = centerY + step * verticalTravel;
      ctx.moveTo(centerX - 5, y);
      ctx.lineTo(centerX + 5, y);
    }
    ctx.stroke();

    ctx.strokeStyle = guidance.captured ? capturedColor : palette.foreground;
    ctx.beginPath();
    ctx.moveTo(centerX - 9, centerY);
    ctx.lineTo(centerX + 9, centerY);
    ctx.moveTo(centerX, centerY - 9);
    ctx.lineTo(centerX, centerY + 9);
    ctx.stroke();

    const halo = palette.panelSolid;
    drawAsciiText(ctx, `LOC ${signed(guidance.localizerErrorDeg)}deg`,
      clamp(localizerX + 8, 8, canvas.width - 132), top + 4, {
        color: locColor,
        haloColor: halo,
        font: 'bold 11px "B612 Mono", monospace'
      });
    drawAsciiText(ctx, `GS ${signed(guidance.glideslopeErrorDeg)}deg`, 10,
      clamp(glideslopeY - 17, top + 18, bottom - 20), {
        color: gsColor,
        haloColor: halo,
        font: 'bold 11px "B612 Mono", monospace'
      });
    drawAsciiText(
      ctx,
      `${guidance.status}  ${guidance.airportId} RWY ${guidance.runwayId}  ${guidance.distanceToThresholdNm.toFixed(1)}NM  TARGET ${Math.round(guidance.targetAltitudeMslFt)}FT`,
      centerX,
      bottom - 5,
      {
        color: guidance.captured ? capturedColor : palette.foreground,
        haloColor: halo,
        font: 'bold 11px "B612 Mono", monospace',
        align: 'center',
        baseline: 'bottom'
      }
    );
    ctx.restore();
  }
}
