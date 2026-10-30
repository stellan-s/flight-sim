// Force vector visualization

import {
  bodyToEarth,
  calculateGroundVelocity,
  getHorizontalSpeed
} from '../utils/coordinates.js';
import { CONFIG } from '../config.js';
import {
  asciiBar,
  drawAsciiText,
  signedAsciiBar
} from './ascii-hud.js';

export class VectorRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
    this.vectorMode = 'all'; // 'energy', 'nav', 'all'
    this.labelBounds = [];
    this.reservedLabelBounds = [];
  }

  rectanglesOverlap(a, b, padding = 4) {
    return a.x < b.x + b.width + padding &&
      a.x + a.width + padding > b.x &&
      a.y < b.y + b.height + padding &&
      a.y + a.height + padding > b.y;
  }

  resetVectorLabelLayout() {
    const canvas = this.chart.canvas;
    const throttleWidth = Math.max(8, Math.min(28, CONFIG.THROTTLE_INDICATOR_WIDTH));
    const throttleHeight = Math.max(60, Math.min(
      Math.max(60, canvas.height - 88),
      CONFIG.THROTTLE_INDICATOR_HEIGHT
    ));
    const throttleX = Math.max(8, Math.min(
      Math.max(8, canvas.width - throttleWidth - 32),
      canvas.width / 2 + CONFIG.THROTTLE_INDICATOR_OFFSET_X
    ));
    const throttleY = Math.max(30, Math.min(
      Math.max(30, canvas.height - throttleHeight - 30),
      canvas.height / 2 + CONFIG.THROTTLE_INDICATOR_OFFSET_Y - throttleHeight / 2
    ));

    this.labelBounds = [];
    this.reservedLabelBounds = [
      { x: 0, y: 0, width: canvas.width, height: 82 },
      { x: canvas.width - CONFIG.STATE_PANEL_X - 8, y: 42, width: CONFIG.STATE_PANEL_X + 8, height: 190 },
      { x: throttleX - 8, y: throttleY - 18, width: throttleWidth + 24, height: throttleHeight + 42 },
      {
        x: canvas.width < 1100 ? 12 : canvas.width - 310,
        y: canvas.width < 1100 ? 86 : Math.max(242, canvas.height - 348),
        width: 300,
        height: 80
      },
      { x: canvas.width * 0.24, y: Math.max(90, canvas.height - 225), width: canvas.width * 0.52, height: 30 },
      { x: 55, y: canvas.height - 190, width: Math.max(0, canvas.width - 100), height: 158 },
      { x: 0, y: canvas.height - 30, width: canvas.width, height: 30 }
    ];
  }

  drawVectorLabel(desiredX, desiredY, text, color) {
    const ctx = this.chart.ctx;
    const canvas = this.chart.canvas;
    ctx.save();
    ctx.font = '11px "B612 Mono", monospace';
    const padding = 3;
    const textWidth = ctx.measureText(text).width;
    const width = textWidth + padding * 2;
    ctx.restore();

    const height = 14;
    const yOffsets = [0, -16, 16, -32, 32, -48, 48, -64, 64, -80, 80, -96, 96, -112, 112, -128, 128];
    const xOffsets = [0, 16, -width - 20, 32, -width - 36, 64, -width - 68, 96, -width - 100];
    const occupied = [...this.reservedLabelBounds, ...this.labelBounds];
    let placed = null;

    for (const xOffset of xOffsets) {
      for (const yOffset of yOffsets) {
        const x = Math.max(8, Math.min(canvas.width - width - 8, desiredX + xOffset - padding));
        const y = Math.max(90, Math.min(canvas.height - 198, desiredY + yOffset));
        const candidate = { x, y: y - height / 2, width, height };
        if (!occupied.some(bound => this.rectanglesOverlap(candidate, bound))) {
          placed = candidate;
          break;
        }
      }
      if (placed) break;
    }

    placed ??= {
      x: Math.max(8, Math.min(canvas.width - width - 8, desiredX - padding)),
      y: Math.max(90, Math.min(canvas.height - 198, desiredY)) - height / 2,
      width,
      height
    };
    this.labelBounds.push(placed);
    this.chart.drawLabel(
      placed.x + padding,
      placed.y + height / 2,
      text,
      this.chart.palette.panelSolid,
      color
    );
    return placed;
  }

  // Toggle between vector display modes
  toggleVectorMode() {
    const modes = ['all', 'energy', 'nav'];
    const currentIndex = modes.indexOf(this.vectorMode);
    this.vectorMode = modes[(currentIndex + 1) % modes.length];
    console.log(`Vector mode: ${this.vectorMode.toUpperCase()}`);
  }

  // Draw a force vector from aircraft position
  drawForceVector(state, force, label, color, direction = null, scale = 0.1) {
    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const pos = this.chart.latLonToPixels(state.position.lat, state.position.lon);

    // Vector length (scale force to pixels)
    const magnitude = Math.abs(force);
    const length = magnitude * scale;

    // Calculate direction in earth frame
    let dx = 0, dy = 0;

    if (direction) {
      // Use the chart's shared oblique 3D force projection.
      ({ x: dx, y: dy } = this.chart.earthForceToScreen(direction));
      if (force < 0) {
        dx = -dx;
        dy = -dy;
      }
    } else {
      // Default based on label
      if (label === 'WEIGHT') {
        // Straight down (earth frame)
        dx = 0;
        dy = 1;
      }
    }

    // Normalize and scale
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
      dx = (dx / mag) * length;
      dy = (dy / mag) * length;
    }

    const endX = pos.x + dx;
    const endY = pos.y + dy;

    const arrowColor = color;

    // Draw line
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrow head
    const headLength = 8;
    const angle = Math.atan2(endY - pos.y, endX - pos.x);

    ctx.fillStyle = arrowColor;
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

    // Label
    const labelX = endX + 10;
    const labelY = endY;

    this.drawVectorLabel(labelX, labelY, `${label}: ${Math.round(force)}N`, color);
  }

  drawMomentArrow(state, moment, label, color, radius, startAngle) {
    if (!Number.isFinite(moment) || Math.abs(moment) < 0.1) return;

    const ctx = this.chart.ctx;
    const pos = this.chart.latLonToPixels(state.position.lat, state.position.lon);
    const direction = Math.sign(moment);
    const sweep = direction * Math.PI * 0.65;
    const endAngle = startAngle + sweep;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, startAngle, endAngle, direction < 0);
    ctx.stroke();

    const endX = pos.x + Math.cos(endAngle) * radius;
    const endY = pos.y + Math.sin(endAngle) * radius;
    const tangent = endAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.chart.drawArrowhead(ctx, endX, endY, tangent, 7);
    ctx.restore();

    const labelDistance = radius + 18;
    this.drawVectorLabel(
      pos.x + Math.cos(endAngle) * labelDistance,
      pos.y + Math.sin(endAngle) * labelDistance,
      label,
      color
    );
  }

  // Draw all force vectors
  drawForceVectors(state, forces, wind) {
    if (!forces || !forces.components) return;

    const scale = CONFIG.FORCE_VECTOR_SCALE;
    const alpha = forces.aerodynamic.alpha;
    const palette = this.chart.palette;
    this.resetVectorLabelLayout();

    // Calculate force directions in body frame, then transform to earth frame

    // LIFT: perpendicular to velocity in body frame
    const liftBody = {
      x: Math.sin(alpha),
      y: 0,
      z: -Math.cos(alpha)
    };
    const liftEarth = bodyToEarth(liftBody, state.orientation);

    // THRUST: forward in body frame
    const thrustBody = { x: 1, y: 0, z: 0 };
    const thrustEarth = bodyToEarth(thrustBody, state.orientation);

    // DRAG: opposite to velocity in body frame
    const dragBody = {
      x: -Math.cos(alpha),
      y: 0,
      z: -Math.sin(alpha)
    };
    const dragEarth = bodyToEarth(dragBody, state.orientation);

    // SIDE: signed lateral aerodynamic force in the body Y direction.
    const sideBody = { x: 0, y: 1, z: 0 };
    const sideEarth = bodyToEarth(sideBody, state.orientation);

    // WEIGHT: straight down in earth frame
    const weightEarth = { north: 0, east: 0, down: 1 };

    // RESULTANT: sum of all forces in body frame, transformed to earth
    const resultantBody = {
      x: forces.body.X,
      y: forces.body.Y,
      z: forces.body.Z
    };
    const resultantEarth = bodyToEarth(resultantBody, state.orientation);

    // Draw energy vectors (forces) if in 'energy' or 'all' mode
    if (this.vectorMode === 'energy' || this.vectorMode === 'all') {
      // Determine lift color based on relation to weight
      const liftValue = forces.components.lift;
      const weightValue = forces.components.weight;
      const liftToWeightRatio = liftValue / weightValue;

      let liftColor;
      if (liftToWeightRatio > 1.05) {
        liftColor = palette.vectorLiftHigh;
      } else if (liftToWeightRatio < 0.95) {
        liftColor = palette.vectorLiftLow;
      } else {
        liftColor = palette.vectorLiftNominal;
      }

      // Individual forces
      this.drawForceVector(state, liftValue, 'LIFT', liftColor, liftEarth, scale);
      this.drawForceVector(state, weightValue, 'WEIGHT', palette.vectorWeight, weightEarth, scale);
      this.drawForceVector(state, forces.components.thrust, 'THRUST', palette.vectorThrust, thrustEarth, scale);
      this.drawForceVector(state, forces.components.drag, 'DRAG', palette.vectorDrag, dragEarth, scale);
      if (Math.abs(forces.components.side) >= 1) {
        this.drawForceVector(state, forces.components.side, 'SIDE', palette.vectorSide, sideEarth, scale);
      }
      if (forces.components.groundReaction >= 1 && forces.groundReactionEarth) {
        this.drawForceVector(
          state,
          forces.components.groundReaction,
          'GROUND',
          palette.vectorGroundReaction,
          forces.groundReactionEarth,
          scale
        );
      }

      // Resultant
      const resultant = Math.sqrt(
        forces.body.X * forces.body.X +
        forces.body.Y * forces.body.Y +
        forces.body.Z * forces.body.Z
      );

      const resultantColor = resultant < 500
        ? palette.vectorResultantBalanced
        : palette.vectorResultantUnbalanced;
      this.drawForceVector(state, resultant, 'RESULTANT', resultantColor, resultantEarth, scale);

      if (forces.moments) {
        this.drawMomentArrow(state, forces.moments.L, 'L', palette.vectorRollMoment, 24, Math.PI);
        this.drawMomentArrow(state, forces.moments.M, 'M', palette.vectorPitchMoment, 31, -Math.PI / 2);
        this.drawMomentArrow(state, forces.moments.N, 'N', palette.vectorYawMoment, 38, 0);
      }
    }

    // Draw motion vectors (navigation) if in 'nav' or 'all' mode
    if (this.vectorMode === 'nav' || this.vectorMode === 'all') {
      this.drawMotionVectors(state, forces, wind);
    }
  }

  // Draw motion vectors (velocity, ground track, wind)
  drawMotionVectors(state, forces, wind) {
    if (!forces) return;

    const scale = CONFIG.VELOCITY_VECTOR_SCALE;
    const palette = this.chart.palette;

    // 1. VELOCITY VECTOR (Airspeed) - cyan
    // Get velocity in body frame from aerodynamic data
    const V = forces.aerodynamic.V; // m/s
    const alpha = forces.aerodynamic.alpha;
    const beta = forces.aerodynamic.beta || 0;

    // Velocity in body frame (along relative wind direction)
    const velBody = {
      x: V * Math.cos(alpha) * Math.cos(beta),
      y: V * Math.sin(beta),
      z: V * Math.sin(alpha) * Math.cos(beta)
    };
    const velEarth = bodyToEarth(velBody, state.orientation);
    this.drawVelocityVector(state, V, 'VELOCITY', palette.vectorVelocity, velEarth, scale);

    // 2. WIND VECTOR - light gray/blue
    const windNorth = wind ? wind.windNorth : 0;
    const windEast = wind ? wind.windEast : 0;
    const windDown = wind ? wind.windDown : 0;
    const windSpeed = Math.sqrt(windNorth * windNorth + windEast * windEast + windDown * windDown);

    if (windSpeed > 0.1) {
      const windEarth = {
        north: windNorth,
        east: windEast,
        down: windDown
      };
      this.drawVelocityVector(state, windSpeed, 'WIND', palette.vectorWind, windEarth, scale);
    }

    // 3. GROUND TRACK VECTOR (Velocity + Wind) - brown/orange
    const groundEarth = calculateGroundVelocity(
      state.velocity,
      state.orientation,
      { north: windNorth, east: windEast, down: windDown }
    );
    const groundSpeed = getHorizontalSpeed(groundEarth);
    groundEarth.down = 0;
    this.drawVelocityVector(state, groundSpeed, 'GROUND TRACK', palette.vectorGroundTrack, groundEarth, scale);
  }

  // Draw velocity vector (similar to force vector but for velocities)
  drawVelocityVector(state, magnitude, label, color, direction, scale) {
    const pos = this.chart.latLonToPixels(state.position.lat, state.position.lon);
    const ctx = this.chart.ctx;

    // Convert NED to screen coordinates using the chart's shared projection.
    let { x: dx, y: dy } = this.chart.earthVectorToScreen(direction);

    // Scale and convert to screen space
    const length = magnitude * scale;

    // Normalize and scale
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
      dx = (dx / mag) * length;
      dy = (dy / mag) * length;
    }

    const endX = pos.x + dx;
    const endY = pos.y + dy;

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrow head
    const headLength = 10;
    const angle = Math.atan2(endY - pos.y, endX - pos.x);

    ctx.fillStyle = color;
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

    // Label
    const labelX = endX + 10;
    const labelY = endY;

    const speedKts = Math.round(magnitude * 1.94384); // m/s to knots
    this.drawVectorLabel(labelX, labelY, `${label}: ${speedKts}kt`, color);
  }

  // Draw state vectors in top-right corner
  drawStateVectors(state, controls, input, forces) {
    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const startX = Math.max(20, this.chart.canvas.width - CONFIG.STATE_PANEL_X);
    const startY = Math.max(46, CONFIG.STATE_PANEL_Y - 10);
    const lineHeight = 14;

    const pitch = state.orientation.pitch * 180 / Math.PI;
    const roll = state.orientation.roll * 180 / Math.PI;
    const alpha = state.getAlpha() * 180 / Math.PI;
    const V = state.getVelocityMagnitude();

    const data = [
      { text: 'FLIGHT', color: palette.accent },
      { text: `PITCH ${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°  AOA ${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}°` },
      { text: `ROLL  ${roll >= 0 ? '+' : ''}${roll.toFixed(1)}°  IAS ${String(Math.round(V * 1.94384)).padStart(3, '0')}KT` },
      { text: 'FORCES', color: palette.accent }
    ];

    if (forces && forces.components && forces.aerodynamic) {
      const lift = forces.components.lift;
      const weight = forces.components.weight;
      const liftRatio = (lift / weight * 100).toFixed(0);
      const Cl = forces.aerodynamic.Cl;

      data.push({ text: `LIFT ${Math.round(lift)}N  ${liftRatio}% WGT` });
      data.push({ text: `CL ${Cl.toFixed(3)}  SIDE ${Math.round(forces.components.side)}N` });
      if (forces.aerodynamic.groundEffect > 0.01) {
        data.push({ text: `GROUND EFFECT ${Math.round(forces.aerodynamic.groundEffect * 100)}%`, color: palette.accent });
      }
      if (forces.moments) {
        data.push({ text: `MOM L${Math.round(forces.moments.L)} M${Math.round(forces.moments.M)} N${Math.round(forces.moments.N)}` });
      }
    }

    const trim = input.getTrimDisplay();
    const flapAngle = Math.round(
      forces?.aerodynamic?.flapAngleDeg ?? (controls.flaps ?? 0) * 30
    );
    data.push({ text: 'CONTROLS', color: palette.accent });
    data.push({ text: `ELEV ${signedAsciiBar(controls.elevator)} ${(controls.elevator * 100).toFixed(0).padStart(4, ' ')}%` });
    data.push({ text: `TRIM ${signedAsciiBar(trim)} ${(trim * 100).toFixed(0).padStart(4, ' ')}%` });
    data.push({ text: `THR  ${asciiBar(controls.throttle)} ${String(Math.round(controls.throttle * 100)).padStart(3, ' ')}%` });
    data.push({ text: `FLAP ${asciiBar(flapAngle, { min: 0, max: 30 })} ${String(flapAngle).padStart(3, ' ')}°` });

    data.forEach((entry, index) => {
      drawAsciiText(ctx, entry.text, startX, startY + index * lineHeight, {
        color: entry.color ?? palette.foreground,
        haloColor: palette.panelSolid,
        font: entry.color
          ? 'bold 10px "B612 Mono", monospace'
          : '10px "B612 Mono", monospace'
      });
    });
  }

  // Draw vector mode indicator
  drawVectorModeIndicator() {
    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const x = 20;
    const y = this.chart.canvas.height - 16;

    let modeText = '';
    if (this.vectorMode === 'all') {
      modeText = 'VECTORS ALL [V]';
    } else if (this.vectorMode === 'energy') {
      modeText = 'VECTORS ENERGY [V]';
    } else if (this.vectorMode === 'nav') {
      modeText = 'VECTORS NAV [V]';
    }

    drawAsciiText(ctx, modeText, x, y, {
      color: palette.foreground,
      haloColor: palette.panelSolid,
      font: '10px "B612 Mono", monospace',
      baseline: 'alphabetic'
    });
  }
}
