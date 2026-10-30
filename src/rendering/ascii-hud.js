const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function asciiBar(value, { min = 0, max = 1, width = 10 } = {}) {
  const safeWidth = Math.max(1, Math.round(width));
  const range = max - min || 1;
  const normalized = clamp((value - min) / range, 0, 1);
  const filled = Math.round(normalized * safeWidth);
  return `[${'#'.repeat(filled)}${'.'.repeat(safeWidth - filled)}]`;
}

export function signedAsciiBar(value, { max = 1, halfWidth = 4 } = {}) {
  const safeHalfWidth = Math.max(1, Math.round(halfWidth));
  const normalized = clamp(value / (max || 1), -1, 1);
  const left = Array(safeHalfWidth).fill('.');
  const right = Array(safeHalfWidth).fill('.');
  const count = Math.round(Math.abs(normalized) * safeHalfWidth);

  if (normalized < 0) {
    for (let index = safeHalfWidth - count; index < safeHalfWidth; index++) {
      left[index] = '#';
    }
  } else if (normalized > 0) {
    for (let index = 0; index < count; index++) right[index] = '#';
  }

  return `[${left.join('')}|${right.join('')}]`;
}

export function drawAsciiText(ctx, text, x, y, {
  color = '#FFFFFF',
  haloColor = null,
  font = '11px "B612 Mono", monospace',
  align = 'left',
  baseline = 'top',
  haloWidth = 3
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (haloColor && typeof ctx.strokeText === 'function') {
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = haloWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
