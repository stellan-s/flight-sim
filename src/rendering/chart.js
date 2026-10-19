// Aviation chart rendering (Jeppesen/Navigraph style)

import { CONFIG } from '../config.js';
import { CHART_THEME_NAMES, getChartTheme } from './chart-themes.js';

export class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = CONFIG.DEFAULT_ZOOM;
    this.centerLat = 0;
    this.centerLon = 0;
    this.rotationMode = CONFIG.DEFAULT_ROTATION_MODE;
    this.theme = CHART_THEME_NAMES.includes(CONFIG.DEFAULT_MAP_THEME)
      ? CONFIG.DEFAULT_MAP_THEME
      : 'paper';
    this.palette = getChartTheme(this.theme);
    this.aircraftHeading = 0; // For track-up mode

    // Chart scale: pixels per degree at zoom=1
    this.baseScale = CONFIG.BASE_SCALE; // meters per degree (rough)
  }

  setRotationMode(mode) {
    this.rotationMode = mode;
    console.log('Chart mode:', mode === 'north-up' ? 'NORTH UP' : 'TRACK UP');
  }

  setTheme(name) {
    if (!CHART_THEME_NAMES.includes(name)) return false;
    this.theme = name;
    this.palette = getChartTheme(name);
    console.log('Map theme:', name.toUpperCase());
    return true;
  }

  // Rotate an existing screen-space map vector for the active chart mode.
  rotateMapVector(x, y) {
    if (this.rotationMode !== 'track-up') {
      return { x, y };
    }

    const cosHeading = Math.cos(-this.aircraftHeading);
    const sinHeading = Math.sin(-this.aircraftHeading);
    return {
      x: x * cosHeading - y * sinHeading,
      y: x * sinHeading + y * cosHeading
    };
  }

  // Project a horizontal earth-frame NED direction onto the chart canvas.
  earthVectorToScreen(direction) {
    return this.rotateMapVector(direction.east, -direction.north);
  }

  // Project a 3D earth-frame force using an oblique vertical axis.
  earthForceToScreen(direction) {
    const horizontal = this.earthVectorToScreen(direction);
    const down = direction.down || 0;
    return {
      x: horizontal.x + down * 0.5,
      y: horizontal.y + down * Math.sqrt(3) / 2
    };
  }

  // Convert an aviation heading into a unit vector in screen coordinates.
  headingToScreenVector(heading) {
    return this.earthVectorToScreen({
      north: Math.cos(heading),
      east: Math.sin(heading)
    });
  }

  clear() {
    this.ctx.fillStyle = this.palette.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Convert lat/lon to canvas pixels
  latLonToPixels(lat, lon) {
    const scale = this.baseScale * this.zoom;

    // Calculate position relative to center
    let dx = (lon - this.centerLon) * scale;
    let dy = -(lat - this.centerLat) * scale;

    ({ x: dx, y: dy } = this.rotateMapVector(dx, dy));

    const x = this.canvas.width / 2 + dx;
    const y = this.canvas.height / 2 + dy;

    return { x, y };
  }

  // Convert pixels to lat/lon
  pixelsToLatLon(x, y) {
    const scale = this.baseScale * this.zoom;

    // Get position relative to center
    let dx = x - this.canvas.width / 2;
    let dy = y - this.canvas.height / 2;

    // Reverse rotation for track-up mode
    if (this.rotationMode === 'track-up') {
      const heading = this.aircraftHeading;
      const cos_h = Math.cos(heading); // Positive to reverse the rotation
      const sin_h = Math.sin(heading);

      const dx_unrot = dx * cos_h - dy * sin_h;
      const dy_unrot = dx * sin_h + dy * cos_h;

      dx = dx_unrot;
      dy = dy_unrot;
    }

    const lon = this.centerLon + dx / scale;
    const lat = this.centerLat - dy / scale;

    return { lat, lon };
  }

  setCenter(lat, lon) {
    this.centerLat = lat;
    this.centerLon = lon;
  }

  setZoom(zoom) {
    this.zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, zoom));
  }

  /**
   * Calculate distance ratio from screen center for level-of-detail rendering
   *
   * Used to determine rendering detail based on how far an element is from screen center.
   * Returns a ratio where:
   * - 0.0 = at screen center
   * - 1.0 = at screen corner (distance equals screen diagonal)
   * - >1.0 = beyond screen diagonal
   *
   * @param {number} pixelX - X coordinate in pixels
   * @param {number} pixelY - Y coordinate in pixels
   * @returns {number} Distance ratio [0-1+] where 0=center, 1=screen diagonal
   */
  calculateDistanceRatio(pixelX, pixelY) {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const distFromCenter = Math.sqrt(
      Math.pow(pixelX - centerX, 2) + Math.pow(pixelY - centerY, 2)
    );
    const screenDiagonal = Math.sqrt(
      Math.pow(this.canvas.width, 2) + Math.pow(this.canvas.height, 2)
    );
    return distFromCenter / screenDiagonal;
  }

  // Draw coordinate grid (Jeppesen style)
  drawGrid() {
    this.ctx.strokeStyle = this.palette.grid;
    this.ctx.lineWidth = 0.5;
    this.ctx.font = '9px "B612 Mono", monospace';
    this.ctx.fillStyle = this.palette.gridLabel;

    const gridSpacing = 0.1 / this.zoom; // degrees
    const scale = this.baseScale * this.zoom;
    const span = Math.hypot(this.canvas.width, this.canvas.height) / scale +
      gridSpacing * 2;

    const startLon = Math.floor((this.centerLon - span) / gridSpacing) * gridSpacing;
    const endLon = this.centerLon + span;
    for (let lon = startLon; lon <= endLon; lon += gridSpacing) {
      const start = this.latLonToPixels(this.centerLat - span, lon);
      const end = this.latLonToPixels(this.centerLat + span, lon);
      this.drawGridLine(start, end, `${lon.toFixed(3)}°`, ['top', 'bottom', 'left', 'right']);
    }

    const startLat = Math.floor((this.centerLat - span) / gridSpacing) * gridSpacing;
    const endLat = this.centerLat + span;
    for (let lat = startLat; lat <= endLat; lat += gridSpacing) {
      const start = this.latLonToPixels(lat, this.centerLon - span);
      const end = this.latLonToPixels(lat, this.centerLon + span);
      this.drawGridLine(start, end, `${lat.toFixed(3)}°`, ['left', 'right', 'top', 'bottom']);
    }
  }

  drawGridLine(start, end, label, edgePriority) {
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();

    const intersections = this.getViewportIntersections(start, end);
    const labelPoint = edgePriority
      .map(edge => intersections.find(point => point.edge === edge))
      .find(Boolean);

    if (!labelPoint) return;

    if (labelPoint.edge === 'top') {
      this.ctx.textAlign = 'center';
      this.ctx.fillText(label, labelPoint.x, 12);
    } else if (labelPoint.edge === 'bottom') {
      this.ctx.textAlign = 'center';
      this.ctx.fillText(label, labelPoint.x, this.canvas.height - 3);
    } else if (labelPoint.edge === 'left') {
      this.ctx.textAlign = 'left';
      this.ctx.fillText(label, 5, labelPoint.y - 3);
    } else {
      this.ctx.textAlign = 'right';
      this.ctx.fillText(label, this.canvas.width - 5, labelPoint.y - 3);
    }
  }

  getViewportIntersections(start, end) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const intersections = [];
    const addIntersection = (x, y, edge) => {
      const epsilon = 1e-6;
      if (x < -epsilon || x > width + epsilon ||
          y < -epsilon || y > height + epsilon) return;
      if (intersections.some(point =>
        Math.abs(point.x - x) < epsilon && Math.abs(point.y - y) < epsilon
      )) return;
      intersections.push({ x, y, edge });
    };

    if (Math.abs(dy) > 1e-12) {
      let t = -start.y / dy;
      addIntersection(start.x + t * dx, 0, 'top');
      t = (height - start.y) / dy;
      addIntersection(start.x + t * dx, height, 'bottom');
    }

    if (Math.abs(dx) > 1e-12) {
      let t = -start.x / dx;
      addIntersection(0, start.y + t * dy, 'left');
      t = (width - start.x) / dx;
      addIntersection(width, start.y + t * dy, 'right');
    }

    return intersections;
  }

  // Draw aircraft symbol (small circle with heading line)
  drawAircraft(state) {
    const pos = this.latLonToPixels(state.position.lat, state.position.lon);

    this.ctx.strokeStyle = this.palette.heading;
    this.ctx.fillStyle = this.palette.panelSolid;
    this.ctx.lineWidth = 1;

    // Circle
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
    this.ctx.fill();
    this.ctx.stroke();

    // Heading line
    const heading = this.headingToScreenVector(state.orientation.yaw);
    const lineLength = 15;
    const endX = pos.x + heading.x * lineLength;
    const endY = pos.y + heading.y * lineLength;

    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();
  }

  // Draw text with background
  drawLabel(x, y, text, bgColor = null, textColor = null) {
    bgColor ??= this.palette.panelSolid;
    textColor ??= this.palette.foreground;
    this.ctx.font = '11px "B612 Mono", monospace';
    this.ctx.textBaseline = 'middle';
    const metrics = this.ctx.measureText(text);
    const padding = 3;
    const boxHeight = 14;

    // Background
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(
      x - padding,
      y - boxHeight / 2,
      metrics.width + padding * 2,
      boxHeight
    );

    // Border
    this.ctx.strokeStyle = textColor;
    this.ctx.lineWidth = 0.5;
    this.ctx.strokeRect(
      x - padding,
      y - boxHeight / 2,
      metrics.width + padding * 2,
      boxHeight
    );

    // Text (centered in box)
    this.ctx.fillStyle = textColor;
    this.ctx.fillText(text, x, y);
  }

  // Draw wind vector field (150px grid spacing, 30% opacity)
  drawWindField(windModel) {
    if (!windModel) return;

    const gridSpacing = 150; // pixels
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = this.palette.wind;
    ctx.fillStyle = this.palette.wind;
    ctx.lineWidth = 1;

    // Draw wind arrows on a grid
    for (let x = 0; x < this.canvas.width; x += gridSpacing) {
      for (let y = 0; y < this.canvas.height; y += gridSpacing) {
        const { lat, lon } = this.pixelsToLatLon(x, y);
        const wind = windModel.getWindAtPosition(lat, lon);

        // Wind direction in radians (FROM direction converted to TO direction)
        const windToRad = ((wind.direction + 180) % 360) * Math.PI / 180;
        const windDirection = this.headingToScreenVector(windToRad);

        // Arrow length based on wind speed
        const arrowLength = Math.min(wind.magnitude * 2, 40);

        // Arrow endpoint
        const endX = x + windDirection.x * arrowLength;
        const endY = y + windDirection.y * arrowLength;

        // Draw arrow line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const headLength = 6;
        const angle = Math.atan2(endY - y, endX - x);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLength * Math.cos(angle - Math.PI / 6),
          endY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          endX - headLength * Math.cos(angle + Math.PI / 6),
          endY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Draw instruments panel
  drawInstruments(state, zoom, windModel = null) {
    const altitude = Math.round(state.position.altitude);
    const ias = Math.round(state.getIAS());
    const heading = Math.round((state.orientation.yaw * 180 / Math.PI + 360) % 360);
    const climb = Math.round(state.getClimbRate());

    this.ctx.font = '14px monospace';
    this.ctx.fillStyle = this.palette.foreground;

    // Top line instruments
    let text = `ALT ${altitude} FT    ZOOM ${zoom.toFixed(1)}x    IAS ${ias} KT    HDG ${heading}°    VS ${climb > 0 ? '+' : ''}${climb} FPM`;

    // Add wind info if available
    if (windModel) {
      text += `    WND ${Math.round(windModel.direction)}°@${Math.round(windModel.speed)}KT`;
    }

    this.ctx.fillText(text, 20, 30);
  }

  // Draw VOR station (compass rose symbol)
  drawVOR(lat, lon, id, frequency) {
    const pos = this.latLonToPixels(lat, lon);
    const ctx = this.ctx;

    // Calculate distance from screen center for level-of-detail
    const distRatio = this.calculateDistanceRatio(pos.x, pos.y);

    // Very far from center - minimal rendering
    if (distRatio > 0.8) {
      ctx.save();
      ctx.fillStyle = this.palette.vor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.strokeStyle = this.palette.vor;
    ctx.fillStyle = this.palette.panelSolid;
    ctx.lineWidth = 1.5;

    // Hexagon
    const size = 8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = pos.x + size * Math.cos(angle);
      const y = pos.y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Compass rose ticks
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const r1 = size + 2;
      const r2 = size + 6;
      ctx.beginPath();
      ctx.moveTo(pos.x + r1 * Math.cos(angle), pos.y + r1 * Math.sin(angle));
      ctx.lineTo(pos.x + r2 * Math.cos(angle), pos.y + r2 * Math.sin(angle));
      ctx.stroke();
    }

    // Label (only if reasonably close)
    if (distRatio < 0.7) {
      ctx.font = 'bold 10px "B612 Mono", monospace';
      ctx.fillStyle = this.palette.vor;
      ctx.textBaseline = 'middle';
      ctx.fillText(id, pos.x + 18, pos.y - 8);
      ctx.font = '9px "B612 Mono", monospace';
      ctx.fillText(frequency, pos.x + 18, pos.y + 3);

      // Morse code identifier
      const morse = this.textToMorse(id);
      ctx.font = '9px "B612 Mono", monospace';
      ctx.fillStyle = this.palette.muted;
      ctx.fillText(morse, pos.x + 18, pos.y + 14);
    }

    ctx.restore();
  }

  // Calculate runway endpoint coordinates
  calculateRunwayEndpoints(centerLat, centerLon, runway) {
    // Convert feet to degrees
    const lengthMeters = runway.length * 0.3048;
    const lengthDegrees = lengthMeters / 111320;
    const halfLengthDeg = lengthDegrees / 2;
    const headingRad = (runway.heading * Math.PI) / 180;

    // Calculate threshold coordinates
    const lat1 = centerLat + halfLengthDeg * Math.cos(headingRad);
    const lon1 = centerLon + halfLengthDeg * Math.sin(headingRad);
    const lat2 = centerLat - halfLengthDeg * Math.cos(headingRad);
    const lon2 = centerLon - halfLengthDeg * Math.sin(headingRad);

    // Calculate runway numbers
    const primaryNumber = this.headingToRunwayNumber(runway.heading);
    const reciprocalNumber = this.headingToRunwayNumber((runway.heading + 180) % 360);

    return { lat1, lon1, lat2, lon2, primaryNumber, reciprocalNumber };
  }

  // Convert heading to runway number
  headingToRunwayNumber(heading) {
    let runwayNum = Math.round(heading / 10);
    if (runwayNum === 0) runwayNum = 36;
    return runwayNum.toString().padStart(2, '0');
  }

  // Draw arrowhead helper
  drawArrowhead(ctx, x, y, angle, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // Convert text to morse code
  textToMorse(text) {
    const morseCode = {
      'A': '·–', 'B': '–···', 'C': '–·–·', 'D': '–··', 'E': '·', 'F': '··–·',
      'G': '––·', 'H': '····', 'I': '··', 'J': '·–––', 'K': '–·–', 'L': '·–··',
      'M': '––', 'N': '–·', 'O': '–––', 'P': '·––·', 'Q': '––·–', 'R': '·–·',
      'S': '···', 'T': '–', 'U': '··–', 'V': '···–', 'W': '·––', 'X': '–··–',
      'Y': '–·––', 'Z': '––··',
      '0': '–––––', '1': '·––––', '2': '··–––', '3': '···––', '4': '····–',
      '5': '·····', '6': '–····', '7': '––···', '8': '–––··', '9': '––––·'
    };

    return text.toUpperCase().split('').map(char => morseCode[char] || '').join(' ');
  }

  // Draw runway with markings (airport diagram style)
  drawRunway(airport, runway) {
    const endpoints = this.calculateRunwayEndpoints(airport.lat, airport.lon, runway);
    const pos1 = this.latLonToPixels(endpoints.lat1, endpoints.lon1);
    const pos2 = this.latLonToPixels(endpoints.lat2, endpoints.lon2);

    // Screen bounds check
    if ((pos1.x < -50 && pos2.x < -50) ||
        (pos1.x > this.canvas.width + 50 && pos2.x > this.canvas.width + 50) ||
        (pos1.y < -50 && pos2.y < -50) ||
        (pos1.y > this.canvas.height + 50 && pos2.y > this.canvas.height + 50)) {
      return;
    }

    const ctx = this.ctx;
    ctx.save();

    // Calculate runway width in pixels
    const widthMeters = runway.width * 0.3048;
    const widthDegrees = widthMeters / 111320;
    const widthPixels = Math.max(widthDegrees * this.baseScale * this.zoom, 8); // Minimum 8px width

    const angle = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
    const perpAngle = angle + Math.PI / 2;

    // 1. Draw runway outline (bold black lines like airport diagram)
    ctx.strokeStyle = this.palette.runway;
    ctx.lineWidth = 3;
    ctx.lineCap = 'square';

    // Draw two parallel lines for runway edges
    ctx.beginPath();
    // Left edge
    ctx.moveTo(pos1.x + widthPixels/2 * Math.cos(perpAngle),
               pos1.y + widthPixels/2 * Math.sin(perpAngle));
    ctx.lineTo(pos2.x + widthPixels/2 * Math.cos(perpAngle),
               pos2.y + widthPixels/2 * Math.sin(perpAngle));
    // Right edge
    ctx.moveTo(pos1.x - widthPixels/2 * Math.cos(perpAngle),
               pos1.y - widthPixels/2 * Math.sin(perpAngle));
    ctx.lineTo(pos2.x - widthPixels/2 * Math.cos(perpAngle),
               pos2.y - widthPixels/2 * Math.sin(perpAngle));
    ctx.stroke();

    // 2. Draw centerline (single solid line)
    ctx.strokeStyle = this.palette.runway;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();

    // 3. Draw threshold markings (perpendicular bars at ends)
    ctx.strokeStyle = this.palette.runway;
    ctx.lineWidth = 2.5;

    [pos1, pos2].forEach(pos => {
      ctx.beginPath();
      ctx.moveTo(pos.x + widthPixels/2 * Math.cos(perpAngle),
                 pos.y + widthPixels/2 * Math.sin(perpAngle));
      ctx.lineTo(pos.x - widthPixels/2 * Math.cos(perpAngle),
                 pos.y - widthPixels/2 * Math.sin(perpAngle));
      ctx.stroke();
    });

    // 4. Draw runway numbers (always visible at zoom > 3)
    if (this.zoom > 3) {
      ctx.fillStyle = this.palette.runway;
      ctx.font = 'bold 12px "B612 Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate positions offset from thresholds
      const offsetDist = Math.max(widthPixels * 0.8, 15);

      // Primary number (pos1)
      ctx.save();
      ctx.translate(pos1.x + offsetDist * Math.cos(angle + Math.PI),
                    pos1.y + offsetDist * Math.sin(angle + Math.PI));
      ctx.rotate(angle - Math.PI / 2);

      // Draw a theme surface behind the runway number for readability.
      const textMetrics = ctx.measureText(endpoints.primaryNumber);
      ctx.fillStyle = this.palette.panelSolid;
      ctx.fillRect(-textMetrics.width/2 - 2, -8, textMetrics.width + 4, 16);

      ctx.fillStyle = this.palette.runway;
      ctx.fillText(endpoints.primaryNumber, 0, 0);
      ctx.restore();

      // Reciprocal number (pos2)
      ctx.save();
      ctx.translate(pos2.x + offsetDist * Math.cos(angle),
                    pos2.y + offsetDist * Math.sin(angle));
      ctx.rotate(angle + Math.PI / 2);

      // Draw a theme surface behind the runway number for readability.
      const textMetrics2 = ctx.measureText(endpoints.reciprocalNumber);
      ctx.fillStyle = this.palette.panelSolid;
      ctx.fillRect(-textMetrics2.width/2 - 2, -8, textMetrics2.width + 4, 16);

      ctx.fillStyle = this.palette.runway;
      ctx.fillText(endpoints.reciprocalNumber, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw traffic pattern
  drawTrafficPattern(airport, runway, highlight = false) {
    // Only draw if zoomed in sufficiently
    if (this.zoom < 4) return;

    const ctx = this.ctx;
    const endpoints = this.calculateRunwayEndpoints(airport.lat, airport.lon, runway);

    // Convert pattern distance to degrees (0.8 NM)
    const patternDistanceNM = runway.trafficPattern.distance;
    const patternDistanceDeg = patternDistanceNM / 60; // 1° ≈ 60 NM

    // Calculate perpendicular offset (left pattern = -90°)
    const offsetAngle = runway.trafficPattern.side === 'left' ? -90 : 90;
    const patternHeadingRad = ((runway.heading + offsetAngle) * Math.PI) / 180;
    const offsetLat = patternDistanceDeg * Math.cos(patternHeadingRad);
    const offsetLon = patternDistanceDeg * Math.sin(patternHeadingRad);

    // Calculate pattern waypoints
    // Extension length for upwind/downwind
    const extensionDeg = 0.015; // ~0.9 NM extension
    const headingRad = (runway.heading * Math.PI) / 180;

    // Upwind: extends from departure threshold (pos1)
    const upwindEndLat = endpoints.lat1 + extensionDeg * Math.cos(headingRad);
    const upwindEndLon = endpoints.lon1 + extensionDeg * Math.sin(headingRad);

    // Crosswind turn point
    const crosswindLat = upwindEndLat + offsetLat;
    const crosswindLon = upwindEndLon + offsetLon;

    // Downwind: parallel to runway, offset to pattern side
    const downwindEndLat = endpoints.lat2 + offsetLat - extensionDeg * Math.cos(headingRad);
    const downwindEndLon = endpoints.lon2 + offsetLon - extensionDeg * Math.sin(headingRad);

    // Base turn point (aligned with approach threshold)
    const baseLat = endpoints.lat2 + offsetLat;
    const baseLon = endpoints.lon2 + offsetLon;

    // Convert all points to screen coordinates
    const upwindStart = this.latLonToPixels(endpoints.lat1, endpoints.lon1);
    const upwindEnd = this.latLonToPixels(upwindEndLat, upwindEndLon);
    const crosswind = this.latLonToPixels(crosswindLat, crosswindLon);
    const downwindEnd = this.latLonToPixels(downwindEndLat, downwindEndLon);
    const base = this.latLonToPixels(baseLat, baseLon);
    const finalStart = this.latLonToPixels(endpoints.lat2, endpoints.lon2);

    // Draw pattern with the active palette's selected and muted colors.
    ctx.save();
    ctx.strokeStyle = highlight ? this.palette.selected : this.palette.muted;
    ctx.lineWidth = highlight ? 2.5 : 1.5;
    ctx.setLineDash([6, 3]);

    ctx.beginPath();
    // Upwind leg
    ctx.moveTo(upwindStart.x, upwindStart.y);
    ctx.lineTo(upwindEnd.x, upwindEnd.y);
    // Crosswind leg
    ctx.lineTo(crosswind.x, crosswind.y);
    // Downwind leg
    ctx.lineTo(downwindEnd.x, downwindEnd.y);
    // Base leg
    ctx.lineTo(base.x, base.y);
    // Final leg
    ctx.lineTo(finalStart.x, finalStart.y);
    ctx.stroke();

    // Draw direction arrows at corners
    ctx.setLineDash([]);
    ctx.fillStyle = highlight ? this.palette.selected : this.palette.muted;
    const arrowSize = highlight ? 8 : 6;

    // Arrow at crosswind turn
    const angle1 = Math.atan2(crosswind.y - upwindEnd.y, crosswind.x - upwindEnd.x);
    this.drawArrowhead(ctx, upwindEnd.x, upwindEnd.y, angle1, arrowSize);

    // Arrow at downwind
    const angle2 = Math.atan2(downwindEnd.y - crosswind.y, downwindEnd.x - crosswind.x);
    this.drawArrowhead(ctx, crosswind.x, crosswind.y, angle2, arrowSize);

    // Arrow at base turn
    const angle3 = Math.atan2(base.y - downwindEnd.y, base.x - downwindEnd.x);
    this.drawArrowhead(ctx, downwindEnd.x, downwindEnd.y, angle3, arrowSize);

    // Draw leg labels if zoomed in (brighter green if highlighted)
    if (this.zoom > 5) {
      ctx.font = '9px "B612 Mono", monospace';
      ctx.fillStyle = highlight ? this.palette.selectedText : this.palette.foreground;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Label each leg at midpoint with white background
      const labels = [
        { x: (upwindStart.x + upwindEnd.x) / 2, y: (upwindStart.y + upwindEnd.y) / 2, text: 'UPWIND' },
        { x: (upwindEnd.x + crosswind.x) / 2, y: (upwindEnd.y + crosswind.y) / 2, text: 'XWIND' },
        { x: (crosswind.x + downwindEnd.x) / 2, y: (crosswind.y + downwindEnd.y) / 2, text: 'DOWNWIND' },
        { x: (downwindEnd.x + base.x) / 2, y: (downwindEnd.y + base.y) / 2, text: 'BASE' },
        { x: (base.x + finalStart.x) / 2, y: (base.y + finalStart.y) / 2, text: 'FINAL' }
      ];

      labels.forEach(label => {
        const metrics = ctx.measureText(label.text);
        ctx.fillStyle = this.palette.panelSolid;
        ctx.fillRect(label.x - metrics.width/2 - 2, label.y - 6, metrics.width + 4, 12);
        // Text
        ctx.fillStyle = highlight ? this.palette.selectedText : this.palette.foreground;
        ctx.fillText(label.text, label.x, label.y);
      });
    }

    ctx.restore();
  }

  // Draw airport symbol
  drawAirport(airport, highlight = false) {
    const pos = this.latLonToPixels(airport.lat, airport.lon);

    // Calculate distance from screen center for level-of-detail
    const distRatio = this.calculateDistanceRatio(pos.x, pos.y);

    const ctx = this.ctx;

    // At very low zoom, always show full symbol regardless of distance
    const alwaysShowFull = this.zoom <= 1.5;

    // Level of detail based on distance from center
    // Very far: small dot
    // Far: simple symbol
    // Close: runways and patterns
    if (distRatio > 0.8 && !alwaysShowFull) {
      // Very far from center - minimal rendering (small dot only)
      ctx.save();
      ctx.fillStyle = highlight ? this.palette.selected : this.palette.muted;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, highlight ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Draw runways if available and zoomed in enough
    if (airport.runways && this.zoom > 2 && (distRatio < 0.5 || alwaysShowFull)) {
      airport.runways.forEach(runway => {
        this.drawRunway(airport, runway);
      });
    } else {
      // At low zoom or far distance, show simple airport symbol (black circle)
      ctx.save();
      ctx.fillStyle = this.palette.panelSolid;
      ctx.strokeStyle = highlight ? this.palette.selected : this.palette.airport;
      ctx.lineWidth = highlight ? 3 : 2;

      // Circle (for airport symbol)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Draw airport ID label with background
    if (distRatio < 0.7 || alwaysShowFull) {
      ctx.save();
      ctx.font = 'bold 10px "B612 Mono", monospace';
      ctx.textBaseline = 'middle';
      const textMetrics = ctx.measureText(airport.id);

      ctx.fillStyle = this.palette.panelSolid;
      ctx.strokeStyle = highlight ? this.palette.selected : this.palette.airport;
      ctx.lineWidth = highlight ? 2 : 1;
      const padding = 2;
      const boxX = pos.x + 10;
      const boxY = pos.y - 7;
      ctx.fillRect(boxX - padding, boxY, textMetrics.width + padding * 2, 14);
      ctx.strokeRect(boxX - padding, boxY, textMetrics.width + padding * 2, 14);

      ctx.fillStyle = highlight ? this.palette.selectedText : this.palette.foreground;
      ctx.fillText(airport.id, boxX, pos.y);

      ctx.restore();
    }

    // Draw traffic patterns if zoomed in enough (visible in larger radius)
    if (airport.runways && this.zoom > 3 && distRatio < 0.9) {
      airport.runways.forEach(runway => {
        this.drawTrafficPattern(airport, runway, highlight);
      });
    }
  }

  // Draw obstacle
  drawObstacle(lat, lon, elevation) {
    const pos = this.latLonToPixels(lat, lon);
    const ctx = this.ctx;

    // Calculate distance from screen center for level-of-detail
    const distRatio = this.calculateDistanceRatio(pos.x, pos.y);

    // Very far from center - minimal rendering
    if (distRatio > 0.8) {
      ctx.save();
      ctx.fillStyle = this.palette.obstacle;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.strokeStyle = this.palette.obstacle;
    ctx.fillStyle = this.palette.obstacle;
    ctx.lineWidth = 1;

    // Inverted T symbol
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 8);
    ctx.lineTo(pos.x, pos.y + 2);
    ctx.moveTo(pos.x - 6, pos.y - 8);
    ctx.lineTo(pos.x + 6, pos.y - 8);
    ctx.stroke();

    // Small circle at base
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + 4, 2, 0, 2 * Math.PI);
    ctx.fill();

    // Elevation label (only if reasonably close)
    if (distRatio < 0.7) {
      ctx.font = '9px "B612 Mono", monospace';
      ctx.fillText(`${elevation}'`, pos.x + 8, pos.y + 4);
    }

    ctx.restore();
  }

  // Draw chart features
  drawChartFeatures(features) {
    if (!features) return;

    // Draw VORs
    if (features.vors) {
      features.vors.forEach(vor => {
        this.drawVOR(vor.lat, vor.lon, vor.id, vor.frequency);
      });
    }

    // Draw airports
    if (features.airports) {
      features.airports.forEach(airport => {
        this.drawAirport(airport);
      });
    }

    // Draw obstacles
    if (features.obstacles) {
      features.obstacles.forEach(obstacle => {
        this.drawObstacle(obstacle.lat, obstacle.lon, obstacle.elevation);
      });
    }
  }

  // Draw VOR radial line from VOR to aircraft
  drawVORRadial(vorLat, vorLon, aircraftLat, aircraftLon, obs, aircraftHeading) {
    const vorPos = this.latLonToPixels(vorLat, vorLon);
    const acPos = this.latLonToPixels(aircraftLat, aircraftLon);

    const ctx = this.ctx;
    ctx.save();

    // Dashed line from VOR through aircraft (current radial).
    ctx.strokeStyle = this.palette.radial;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(vorPos.x, vorPos.y);
    ctx.lineTo(acPos.x, acPos.y);
    ctx.stroke();

    // Draw OBS course line (desired course).
    const courseRad = obs * Math.PI / 180;
    const courseDirection = this.headingToScreenVector(courseRad);
    const lineLength = CONFIG.VOR_RADIAL_LENGTH_PIXELS;

    ctx.strokeStyle = this.palette.course;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const x1 = vorPos.x + courseDirection.x * lineLength;
    const y1 = vorPos.y + courseDirection.y * lineLength;
    const x2 = vorPos.x - courseDirection.x * lineLength;
    const y2 = vorPos.y - courseDirection.y * lineLength;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

      // Draw aircraft heading vector.
    if (aircraftHeading !== undefined) {
      const headingLength = 400; // Longer vector to show heading clearly
      const headingDirection = this.headingToScreenVector(aircraftHeading);
      const headingX = acPos.x + headingDirection.x * headingLength;
      const headingY = acPos.y + headingDirection.y * headingLength;

      ctx.strokeStyle = this.palette.heading;
      ctx.lineWidth = 2;
      ctx.setLineDash([]); // Solid line

      ctx.beginPath();
      ctx.moveTo(acPos.x, acPos.y);
      ctx.lineTo(headingX, headingY);
      ctx.stroke();

      // Arrow head
      const arrowSize = 10;
      const angle = Math.atan2(headingY - acPos.y, headingX - acPos.x);

      ctx.fillStyle = this.palette.heading;
      ctx.beginPath();
      ctx.moveTo(headingX, headingY);
      ctx.lineTo(
        headingX - arrowSize * Math.cos(angle - Math.PI / 6),
        headingY - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        headingX - arrowSize * Math.cos(angle + Math.PI / 6),
        headingY - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      // Label showing heading
      const hdgDeg = Math.round((aircraftHeading * 180 / Math.PI + 360) % 360);
      const labelX = acPos.x + headingDirection.x * (headingLength / 2);
      const labelY = acPos.y + headingDirection.y * (headingLength / 2);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = this.palette.panelSolid;
      ctx.strokeStyle = this.palette.heading;
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      const text = `HDG ${hdgDeg.toString().padStart(3, '0')}°`;
      ctx.strokeText(text, labelX, labelY);
      ctx.fillText(text, labelX, labelY);
    }

    ctx.restore();
  }

  // Draw DME arc around VOR
  drawDMEArc(vorLat, vorLon, distanceNM) {
    const vorPos = this.latLonToPixels(vorLat, vorLon);

    // Convert NM to degrees (rough approximation at this latitude)
    const nmToDeg = distanceNM / 60; // 1 degree ≈ 60 NM
    const radiusPx = nmToDeg * this.baseScale * this.zoom;

    const ctx = this.ctx;
    ctx.save();

    ctx.strokeStyle = this.palette.radial;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);

    ctx.beginPath();
    ctx.arc(vorPos.x, vorPos.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();

    // DME label
    ctx.font = '10px monospace';
    ctx.fillStyle = this.palette.radial;
    ctx.fillText(`${distanceNM.toFixed(0)} NM`, vorPos.x + radiusPx + 5, vorPos.y);

    ctx.restore();
  }

  // Draw rotation mode indicator
  drawRotationModeIndicator() {
    const ctx = this.ctx;
    const x = 20;
    const y = this.canvas.height - 30;

    ctx.save();

    ctx.font = '12px "B612 Mono", monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = this.palette.foreground;

    const modeText = this.rotationMode === 'north-up' ? 'NORTH UP' : 'TRACK UP';
    const helpText = this.rotationMode === 'north-up' ? '(Press T for Track-Up)' : '(Press N for North-Up)';

    ctx.fillText(`MAP: ${modeText}`, x, y);
    ctx.font = '10px "B612 Mono", monospace';
    ctx.fillStyle = this.palette.muted;
    ctx.fillText(helpText, x, y + 15);

    ctx.restore();
  }

  // Draw flight timer
  drawFlightTimer(flightTime) {
    const ctx = this.ctx;
    const x = this.canvas.width - CONFIG.FLIGHT_TIMER_X;
    const y = this.canvas.height - CONFIG.FLIGHT_TIMER_Y;

    ctx.save();

    // Format time as HH:MM:SS
    const hours = Math.floor(flightTime / 3600);
    const minutes = Math.floor((flightTime % 3600) / 60);
    const seconds = Math.floor(flightTime % 60);

    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    ctx.font = '12px "B612 Mono", monospace';
    ctx.fillStyle = this.palette.foreground;
    ctx.textAlign = 'right';
    ctx.fillText(`TIME: ${timeStr}`, x, y);

    ctx.restore();
  }

  /**
   * Draw direct-to line from aircraft to selected airport
   *
   * Renders a magenta dashed line indicating the direct flight path from
   * aircraft current position to the target airport. This is a standard
   * aviation navigation indication for "direct-to" navigation mode.
   *
   * Style: Palette navigation accent, 2px wide, dashed (10px dash, 5px gap)
   *
   * @param {number} aircraftLat - Aircraft latitude in degrees
   * @param {number} aircraftLon - Aircraft longitude in degrees
   * @param {number} airportLat - Target airport latitude in degrees
   * @param {number} airportLon - Target airport longitude in degrees
   */
  drawDirectToLine(aircraftLat, aircraftLon, airportLat, airportLon) {
    // Validate coordinates
    if (typeof aircraftLat !== 'number' || typeof aircraftLon !== 'number' ||
        typeof airportLat !== 'number' || typeof airportLon !== 'number') {
      return;
    }

    const aircraftPos = this.latLonToPixels(aircraftLat, aircraftLon);
    const airportPos = this.latLonToPixels(airportLat, airportLon);

    const ctx = this.ctx;
    ctx.save();

    ctx.strokeStyle = this.palette.direct;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(aircraftPos.x, aircraftPos.y);
    ctx.lineTo(airportPos.x, airportPos.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Draw airport navigation information box
   *
   * Displays a semi-transparent white box in the bottom-right corner containing:
   * - Airport ID and name
   * - Distance in nautical miles
   * - Bearing in degrees
   * - ETA (minutes and seconds)
   * - Active runway based on wind
   * - Pattern altitude in feet
   * - Recommended pattern entry type
   *
   * Box dimensions: 260×140 pixels, positioned 20px from bottom-right corner
   * Style: White background (95% opacity), black 1px border, 10px monospace font
   *
   * @param {Object|null} navData - Navigation data from AirportNavigation.getNavigationData()
   * @param {Object} navData.airport - Airport object with id and name properties
   * @param {number} navData.distance - Distance to airport in nautical miles
   * @param {number} navData.bearing - Bearing to airport in degrees [0-360°)
   * @param {Object} navData.eta - Estimated time of arrival
   * @param {number} navData.eta.minutes - ETA minutes component
   * @param {number} navData.eta.seconds - ETA seconds component
   * @param {Object} [navData.activeRunway] - Active runway object (optional, may be null)
   * @param {string} navData.activeRunway.id - Runway identifier (e.g., '27L', '09R')
   * @param {string} [navData.recommendedEntry] - Recommended entry type (optional, may be null)
   * @param {number} navData.patternAltitude - Traffic pattern altitude in feet
   */
  drawAirportNavInfo(navData) {
    if (!navData) return;

    const ctx = this.ctx;
    const x = this.canvas.width - 280;
    const y = this.canvas.height - 180;
    const width = 260;
    const height = 140;

    ctx.save();

    // Background box
    ctx.fillStyle = this.palette.panel;
    ctx.fillRect(x, y, width, height);

    // Border
    ctx.strokeStyle = this.palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // Content
    ctx.fillStyle = this.palette.foreground;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Title
    ctx.font = 'bold 12px "B612 Mono", monospace';
    ctx.fillText(`TO: ${navData.airport.id} - ${navData.airport.name}`, x + 10, y + 10);

    // Navigation data
    ctx.font = '11px "B612 Mono", monospace';
    const lineHeight = 16;
    let currentY = y + 32;

    ctx.fillText(`Distance: ${navData.distance.toFixed(1)} NM`, x + 10, currentY);
    currentY += lineHeight;

    ctx.fillText(`Bearing: ${Math.round(navData.bearing).toString().padStart(3, '0')}°`, x + 10, currentY);
    currentY += lineHeight;

    ctx.fillText(`ETA: ${navData.eta.minutes}:${navData.eta.seconds.toString().padStart(2, '0')}`, x + 10, currentY);
    currentY += lineHeight + 5;

    // Active runway
    if (navData.activeRunway) {
      ctx.fillStyle = this.palette.accent;
      ctx.fillText(`Active Runway: ${navData.activeRunway.id}`, x + 10, currentY);
      currentY += lineHeight;

      ctx.fillStyle = this.palette.foreground;
      ctx.fillText(`Pattern: ${navData.activeRunway.trafficPattern.side.toUpperCase()}`, x + 10, currentY);
      currentY += lineHeight;

      ctx.fillText(`Altitude: ${navData.patternAltitude} FT`, x + 10, currentY);
      currentY += lineHeight + 5;
    }

    // Recommended entry
    if (navData.recommendedEntry) {
      ctx.fillStyle = this.palette.selectedText;
      ctx.font = 'bold 11px "B612 Mono", monospace';
      ctx.fillText(`Entry: ${navData.recommendedEntry}`, x + 10, currentY);
    }

    ctx.restore();
  }
}
