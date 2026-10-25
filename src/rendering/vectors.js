// Force vector visualization

import {
  bodyToEarth,
  calculateGroundVelocity,
  getHorizontalSpeed
} from '../utils/coordinates.js';
import { CONFIG } from '../config.js';

export class VectorRenderer {
  constructor(chartRenderer) {
    this.chart = chartRenderer;
    this.vectorMode = 'all'; // 'energy', 'nav', 'all'
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

    const bgColor = palette.panelSolid;
    this.chart.drawLabel(labelX, labelY, `${label}: ${Math.round(force)}N`, bgColor, color);
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
    this.chart.drawLabel(
      pos.x + Math.cos(endAngle) * labelDistance,
      pos.y + Math.sin(endAngle) * labelDistance,
      label,
      this.chart.palette.panelSolid,
      color
    );
  }

  // Draw all force vectors
  drawForceVectors(state, forces, wind) {
    if (!forces || !forces.components) return;

    const scale = CONFIG.FORCE_VECTOR_SCALE;
    const alpha = forces.aerodynamic.alpha;
    const palette = this.chart.palette;

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
    this.chart.drawLabel(labelX, labelY, `${label}: ${speedKts}kt`, this.chart.palette.panelSolid, color);
  }

  // Draw state vectors in top-right corner
  drawStateVectors(state, controls, input, forces) {
    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const startX = this.chart.canvas.width - CONFIG.STATE_PANEL_X;
    const startY = CONFIG.STATE_PANEL_Y;
    const lineHeight = 18;

    ctx.font = '12px "B612 Mono", monospace';
    ctx.fillStyle = palette.foreground;

    const pitch = state.orientation.pitch * 180 / Math.PI;
    const roll = state.orientation.roll * 180 / Math.PI;
    const alpha = state.getAlpha() * 180 / Math.PI;
    const V = state.getVelocityMagnitude();

    const data = [
      `PITCH: ${pitch.toFixed(1)}°`,
      `AOA: ${alpha.toFixed(1)}° ← key for lift`,
      `ROLL: ${roll.toFixed(1)}°`,
      `V: ${V.toFixed(1)} m/s (${Math.round(V * 1.94384)} kt)`,
      ``
    ];

    // Add force info if available
    if (forces && forces.components && forces.aerodynamic) {
      const lift = forces.components.lift;
      const weight = forces.components.weight;
      const liftRatio = (lift / weight * 100).toFixed(0);
      const Cl = forces.aerodynamic.Cl;

      data.push(`LIFT: ${Math.round(lift)} N (${liftRatio}%)`);
      data.push(`Cl: ${Cl.toFixed(3)} @ α=${alpha.toFixed(1)}°`);
      data.push(`SIDE: ${Math.round(forces.components.side)} N`);
      if (forces.moments) {
        data.push(`MOM: L${Math.round(forces.moments.L)} M${Math.round(forces.moments.M)} N${Math.round(forces.moments.N)} N·m`);
      }
      data.push(``);
    }

    // Controls
    data.push(`ELEV: ${(controls.elevator * 100).toFixed(0)}%`);
    data.push(`TRIM: ${(input.getTrimDisplay() * 100).toFixed(0)}%`);
    data.push(`THRO: ${(controls.throttle * 100).toFixed(0)}%`);

    data.forEach((line, i) => {
      ctx.fillText(line, startX, startY + i * lineHeight);
    });
  }

  // Draw vector mode indicator
  drawVectorModeIndicator() {
    const ctx = this.chart.ctx;
    const palette = this.chart.palette;
    const x = 20;
    const y = this.chart.canvas.height - 30;

    // Background
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x - 5, y - 15, 150, 25);

    // Border
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 5, y - 15, 150, 25);

    // Text
    ctx.font = '11px "B612 Mono", monospace';
    ctx.fillStyle = palette.foreground;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let modeText = '';
    if (this.vectorMode === 'all') {
      modeText = 'VECTORS: ALL';
    } else if (this.vectorMode === 'energy') {
      modeText = 'VECTORS: ENERGY';
    } else if (this.vectorMode === 'nav') {
      modeText = 'VECTORS: NAV';
    }

    ctx.fillText(modeText, x, y);
    ctx.fillStyle = palette.muted;
    ctx.fillText('(V to toggle)', x + 100, y);
  }
}
