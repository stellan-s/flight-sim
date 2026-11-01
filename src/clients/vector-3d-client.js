import { CONFIG } from '../config.js';
import { calculateMomentSweep, formatMomentLabel } from '../rendering/vectors.js';
import { CHART_THEMES, CHART_THEME_NAMES } from '../rendering/chart-themes.js';
import { bodyToEarth, earthToBody } from '../utils/coordinates.js';
import { FEET_TO_METERS, METERS_PER_DEGREE } from '../utils/constants.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function parseHex(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function withAlpha(color, alpha) {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb.join(',')},${alpha})` : color;
}

function mixColors(background, foreground, amount) {
  const from = parseHex(background);
  const to = parseHex(foreground);
  if (!from || !to) return background;
  const mixed = from.map((value, index) =>
    Math.round(value + (to[index] - value) * amount));
  return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function buildVector3DStyle(id, palette) {
  return Object.freeze({
    label: id.replaceAll('-', ' ').toUpperCase(),
    background: palette.background,
    sky: palette.background,
    ground: mixColors(palette.background, palette.foreground, 0.08),
    horizon: palette.foreground,
    grid: palette.muted,
    gridMajor: palette.foreground,
    runway: palette.runway,
    runwayFill: withAlpha(palette.foreground, 0.1),
    lights: palette.accent,
    foreground: palette.foreground,
    muted: palette.muted,
    panel: palette.panel,
    panelSolid: palette.panelSolid,
    labelBackground: palette.panel,
    lift: palette.vectorLiftNominal,
    weight: palette.vectorWeight,
    thrust: palette.vectorThrust,
    drag: palette.vectorDrag,
    side: palette.vectorSide,
    resultant: palette.vectorResultantUnbalanced,
    roll: palette.vectorRollMoment,
    pitch: palette.vectorPitchMoment,
    yaw: palette.vectorYawMoment,
    ils: palette.course,
    ilsArmed: palette.direct,
    scanlines: id === 'amber' || id === 'phosphor'
  });
}

export const VECTOR_3D_STYLES = Object.freeze(Object.fromEntries(
  CHART_THEME_NAMES.map(id => [id, buildVector3DStyle(id, CHART_THEMES[id])])
));

export const VECTOR_3D_STYLE_IDS = CHART_THEME_NAMES;
const LEGACY_3D_STYLE_ALIASES = Object.freeze({
  'vector-day': 'black-white',
  'nord-night': 'nord',
  'amber-crt': 'amber',
  blueprint: 'night'
});

export function resolveVector3DStyleId(styleId) {
  const id = String(styleId ?? '');
  return VECTOR_3D_STYLES[id] ? id : LEGACY_3D_STYLE_ALIASES[id] ?? null;
}
export const VECTOR_3D_CAMERA_IDS = ['cockpit', 'chase', 'tower'];

export function orientationToward(offset, roll = 0) {
  const horizontal = Math.hypot(offset.north, offset.east);
  return {
    yaw: Math.atan2(offset.east, offset.north),
    pitch: Math.atan2(-offset.down, Math.max(0.001, horizontal)),
    roll
  };
}

export function projectBodyPoint(point, viewport, nearPlane = 1) {
  if (!point || point.x < nearPlane) return null;
  return {
    x: viewport.centerX + point.y / point.x * viewport.focalLength,
    y: viewport.centerY + point.z / point.x * viewport.focalLength,
    depth: point.x
  };
}

export function clipBodySegmentToNearPlane(a, b, nearPlane = 1) {
  if (a.x < nearPlane && b.x < nearPlane) return null;
  if (a.x >= nearPlane && b.x >= nearPlane) return [a, b];
  const behind = a.x < nearPlane ? a : b;
  const ahead = a.x < nearPlane ? b : a;
  const amount = (nearPlane - behind.x) / (ahead.x - behind.x);
  const clipped = {
    x: nearPlane,
    y: behind.y + (ahead.y - behind.y) * amount,
    z: behind.z + (ahead.z - behind.z) * amount
  };
  return a.x < nearPlane ? [clipped, b] : [a, clipped];
}

export function clipBodyPolygonToNearPlane(points, nearPlane = 1) {
  const clipped = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = current.x >= nearPlane;
    const previousInside = previous.x >= nearPlane;
    if (currentInside !== previousInside) {
      const amount = (nearPlane - previous.x) / (current.x - previous.x);
      clipped.push({
        x: nearPlane,
        y: previous.y + (current.y - previous.y) * amount,
        z: previous.z + (current.z - previous.z) * amount
      });
    }
    if (currentInside) clipped.push(current);
  }
  return clipped;
}

export function clipScreenSegmentToRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let start = 0;
  let end = 1;
  const boundaries = [
    [-dx, a.x - rect.left],
    [dx, rect.right - a.x],
    [-dy, a.y - rect.top],
    [dy, rect.bottom - a.y]
  ];

  for (const [direction, distance] of boundaries) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const amount = distance / direction;
    if (direction < 0) {
      if (amount > end) return null;
      start = Math.max(start, amount);
    } else {
      if (amount < start) return null;
      end = Math.min(end, amount);
    }
  }

  return [
    {
      ...a,
      x: a.x + dx * start,
      y: a.y + dy * start
    },
    {
      ...b,
      x: a.x + dx * end,
      y: a.y + dy * end
    }
  ];
}

export function gridNearPlaneForHeight(heightMeters) {
  return clamp((Number(heightMeters) || 0) * 1.5, 1.5, 20);
}

export function gridMicroSpacingForHeight(heightMeters) {
  const height = Math.max(0, Number(heightMeters) || 0);
  if (height >= 100) return null;
  if (height < 3) return 2;
  if (height < 10) return 5;
  if (height < 30) return 10;
  return 25;
}

export function gridWireframeForHeight(heightMeters) {
  const height = Math.max(0, Number(heightMeters) || 0);
  const microSpacing = gridMicroSpacingForHeight(height);
  const spacing = microSpacing ?? (
    height < 300 ? 100
      : height < 1000 ? 300
        : height < 3000 ? 1000
          : 2500
  );
  return {
    spacing,
    range: clamp(Math.max(spacing * 400, height * 300), spacing * 300, 400000),
    minorAlpha: 0.16,
    majorAlpha: 0.42,
    minorWidth: 0.75,
    majorWidth: 1.15
  };
}

function localNed(position, point) {
  const longitudeScale = Math.max(0.01, Math.cos(position.lat * Math.PI / 180));
  return {
    north: (point.lat - position.lat) * METERS_PER_DEGREE,
    east: (point.lon - position.lon) * METERS_PER_DEGREE * longitudeScale,
    down: (position.altitude - point.altitude) * FEET_TO_METERS
  };
}

function pointFromOffset(position, north, east, altitude) {
  const longitudeScale = Math.max(0.01, Math.cos(position.lat * Math.PI / 180));
  return {
    lat: position.lat + north / METERS_PER_DEGREE,
    lon: position.lon + east / (METERS_PER_DEGREE * longitudeScale),
    altitude
  };
}

function pointFromNed(position, offset) {
  return pointFromOffset(
    position,
    offset.north,
    offset.east,
    position.altitude - offset.down / FEET_TO_METERS
  );
}

export class Vector3DClient {
  constructor(canvas, session, styleId = CONFIG.DEFAULT_3D_STYLE) {
    this.id = 'vector-3d';
    this.label = 'VECTOR 3D';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.session = session;
    this.fallbackStyleId = resolveVector3DStyleId(styleId) ?? VECTOR_3D_STYLE_IDS[0];
    this.cameraId = VECTOR_3D_CAMERA_IDS.includes(CONFIG.DEFAULT_3D_CAMERA)
      ? CONFIG.DEFAULT_3D_CAMERA
      : VECTOR_3D_CAMERA_IDS[0];
    this.styleChangedAt = performance.now();
    this.labelBounds = [];
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  get styleId() {
    return resolveVector3DStyleId(this.session?.simulator?.chart?.theme) ??
      this.fallbackStyleId;
  }

  get style() {
    return VECTOR_3D_STYLES[this.styleId];
  }

  getPalette() {
    return this.style;
  }

  setStyle(styleId) {
    const resolved = resolveVector3DStyleId(styleId);
    if (!resolved) throw new Error(`Unknown theme: ${styleId}`);
    this.fallbackStyleId = resolved;
    const chart = this.session?.simulator?.chart;
    if (chart && chart.theme !== resolved) chart.setTheme(resolved);
    this.styleChangedAt = performance.now();
    return resolved;
  }

  cycleStyle() {
    const index = VECTOR_3D_STYLE_IDS.indexOf(this.styleId);
    return this.setStyle(VECTOR_3D_STYLE_IDS[(index + 1) % VECTOR_3D_STYLE_IDS.length]);
  }

  setCamera(cameraId) {
    if (!VECTOR_3D_CAMERA_IDS.includes(cameraId)) {
      throw new Error(`Unknown 3D camera: ${cameraId}`);
    }
    this.cameraId = cameraId;
    return this.cameraId;
  }

  cycleCamera() {
    const index = VECTOR_3D_CAMERA_IDS.indexOf(this.cameraId);
    return this.setCamera(VECTOR_3D_CAMERA_IDS[(index + 1) % VECTOR_3D_CAMERA_IDS.length]);
  }

  lookByPixels(deltaX, deltaY, sensitivity = 0.003) {
    this.lookYaw = ((this.lookYaw + deltaX * sensitivity + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.lookPitch = clamp(
      this.lookPitch - deltaY * sensitivity,
      -Math.PI * 0.47,
      Math.PI * 0.47
    );
    return this.getLook();
  }

  resetLook() {
    this.lookYaw = 0;
    this.lookPitch = 0;
    return this.getLook();
  }

  getLook() {
    return {
      yawDeg: this.lookYaw * 180 / Math.PI,
      pitchDeg: this.lookPitch * 180 / Math.PI
    };
  }

  applyLook(camera) {
    return {
      ...camera,
      orientation: {
        ...camera.orientation,
        yaw: camera.orientation.yaw + this.lookYaw,
        pitch: clamp(
          camera.orientation.pitch + this.lookPitch,
          -Math.PI * 0.49,
          Math.PI * 0.49
        )
      }
    };
  }

  viewport() {
    return {
      centerX: this.canvas.width / 2,
      centerY: this.canvas.height / 2,
      focalLength: Math.min(this.canvas.width, this.canvas.height) * 0.9
    };
  }

  nearestAirport(frame) {
    const airports = frame.features?.airports ?? [];
    const selected = airports.find(airport => airport.id === frame.navigation?.selectedAirportId);
    if (selected) return selected;
    return airports.reduce((nearest, airport) => {
      const distance = localNed(frame.position, {
        ...airport,
        altitude: airport.elevation
      });
      const horizontal = Math.hypot(distance.north, distance.east);
      return !nearest || horizontal < nearest.distance ? { airport, distance: horizontal } : nearest;
    }, null)?.airport ?? null;
  }

  resolveCamera(frame) {
    if (this.cameraId === 'chase') {
      const offsetOrientation = {
        ...frame.orientation,
        roll: frame.orientation.roll * 0.2
      };
      const position = pointFromNed(
        frame.position,
        bodyToEarth({ x: -72, y: 0, z: -18 }, offsetOrientation)
      );
      const target = pointFromNed(
        frame.position,
        bodyToEarth({ x: 22, y: 0, z: 0 }, frame.orientation)
      );
      return this.applyLook({
        id: 'chase',
        label: 'CHASE',
        position,
        orientation: orientationToward(
          localNed(position, target),
          frame.orientation.roll * 0.18
        ),
        external: true
      });
    }

    if (this.cameraId === 'tower') {
      const airport = this.nearestAirport(frame);
      const runway = airport?.runways?.find(item => item.id === frame.navigation?.activeRunwayId) ??
        airport?.runways?.[0];
      let position;
      if (airport && runway) {
        const side = runway.trafficPattern?.side === 'right' ? -1 : 1;
        position = {
          ...this.runwayPoint(airport, runway, 0, side * 220),
          altitude: airport.elevation + 70
        };
      } else {
        position = pointFromNed(frame.position, { north: 0, east: 250, down: -25 });
      }
      return this.applyLook({
        id: 'tower',
        label: 'TOWER',
        position,
        orientation: orientationToward(localNed(position, frame.position)),
        external: true
      });
    }

    return this.applyLook({
      id: 'cockpit',
      label: 'COCKPIT',
      position: frame.position,
      orientation: frame.orientation,
      external: false
    });
  }

  worldToCamera(camera, point) {
    return earthToBody(localNed(camera.position, point), camera.orientation);
  }

  drawWorldSegment(
    camera,
    pointA,
    pointB,
    color,
    width = 1,
    alpha = 1,
    dash = [],
    nearPlane = 20
  ) {
    const clipped = clipBodySegmentToNearPlane(
      this.worldToCamera(camera, pointA),
      this.worldToCamera(camera, pointB),
      nearPlane
    );
    if (!clipped) return false;
    const projectedA = projectBodyPoint(clipped[0], this.viewport());
    const projectedB = projectBodyPoint(clipped[1], this.viewport());
    if (!projectedA || !projectedB) return false;
    const visible = clipScreenSegmentToRect(projectedA, projectedB, {
      left: -2,
      top: -2,
      right: this.canvas.width + 2,
      bottom: this.canvas.height + 2
    });
    if (!visible) return false;
    const [a, b] = visible;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  drawAttitudeBackground(camera) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const style = this.style;
    const focal = this.viewport().focalLength;
    const diagonal = Math.hypot(width, height) * 1.2;
    const pitchOffset = Math.tan(camera.orientation.pitch) * focal;

    ctx.fillStyle = style.sky;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-camera.orientation.roll);
    ctx.fillStyle = style.ground;
    ctx.fillRect(-diagonal, pitchOffset, diagonal * 2, diagonal * 2);
    ctx.strokeStyle = style.horizon;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-diagonal, pitchOffset);
    ctx.lineTo(diagonal, pitchOffset);
    ctx.stroke();
    ctx.restore();
  }

  drawGridLayer(frame, camera, terrainAltitude, options) {
    const {
      spacing,
      range,
      majorEvery = 5,
      minorAlpha,
      majorAlpha,
      minorWidth,
      majorWidth,
      nearPlane = 20
    } = options;
    const absoluteNorth = frame.position.lat * METERS_PER_DEGREE;
    const longitudeScale = Math.max(0.01, Math.cos(frame.position.lat * Math.PI / 180));
    const absoluteEast = frame.position.lon * METERS_PER_DEGREE * longitudeScale;
    const northCenterIndex = Math.round(absoluteNorth / spacing);
    const eastCenterIndex = Math.round(absoluteEast / spacing);
    const steps = Math.ceil(range / spacing);

    for (let index = -steps; index <= steps; index++) {
      const northLineIndex = northCenterIndex + index;
      const eastLineIndex = eastCenterIndex + index;
      const north = northLineIndex * spacing - absoluteNorth;
      const east = eastLineIndex * spacing - absoluteEast;
      const northMajor = ((northLineIndex % majorEvery) + majorEvery) % majorEvery === 0;
      const eastMajor = ((eastLineIndex % majorEvery) + majorEvery) % majorEvery === 0;
      this.drawWorldSegment(
        camera,
        pointFromOffset(frame.position, north, -range, terrainAltitude),
        pointFromOffset(frame.position, north, range, terrainAltitude),
        northMajor ? this.style.gridMajor : this.style.grid,
        northMajor ? majorWidth : minorWidth,
        northMajor ? majorAlpha : minorAlpha,
        [],
        nearPlane
      );
      this.drawWorldSegment(
        camera,
        pointFromOffset(frame.position, -range, east, terrainAltitude),
        pointFromOffset(frame.position, range, east, terrainAltitude),
        eastMajor ? this.style.gridMajor : this.style.grid,
        eastMajor ? majorWidth : minorWidth,
        eastMajor ? majorAlpha : minorAlpha,
        [],
        nearPlane
      );
    }
  }

  drawGroundGrid(frame, camera) {
    const terrainAltitude = frame.ground?.terrainElevationFt ??
      Math.max(0, frame.position.altitude - (frame.ground?.aglFt ?? 1000));
    const cameraHeightMeters = Math.max(
      0,
      (camera.position.altitude - terrainAltitude) * FEET_TO_METERS
    );
    const nearPlane = gridNearPlaneForHeight(cameraHeightMeters);
    this.drawGridLayer(frame, camera, terrainAltitude, {
      ...gridWireframeForHeight(cameraHeightMeters),
      nearPlane
    });
  }

  runwayPoint(airport, runway, along, cross) {
    const heading = runway.heading * Math.PI / 180;
    return pointFromOffset(
      airport,
      along * Math.cos(heading) - cross * Math.sin(heading),
      along * Math.sin(heading) + cross * Math.cos(heading),
      airport.elevation
    );
  }

  drawRunway(frame, camera, airport, runway) {
    const center = localNed(frame.position, { ...airport, altitude: airport.elevation });
    if (Math.hypot(center.north, center.east) > 22000) return;
    const halfLength = runway.length * FEET_TO_METERS / 2;
    const halfWidth = runway.width * FEET_TO_METERS / 2;
    const style = this.style;
    const cameraHeightMeters = Math.max(
      0,
      (camera.position.altitude - airport.elevation) * FEET_TO_METERS
    );
    const nearPlane = gridNearPlaneForHeight(cameraHeightMeters);
    const drawSegment = (pointA, pointB, color, width, alpha) => this.drawWorldSegment(
      camera,
      pointA,
      pointB,
      color,
      width,
      alpha,
      [],
      nearPlane
    );

    const leftA = this.runwayPoint(airport, runway, -halfLength, -halfWidth);
    const leftB = this.runwayPoint(airport, runway, halfLength, -halfWidth);
    const rightA = this.runwayPoint(airport, runway, -halfLength, halfWidth);
    const rightB = this.runwayPoint(airport, runway, halfLength, halfWidth);
    const thresholdA1 = this.runwayPoint(airport, runway, -halfLength, -halfWidth);
    const thresholdA2 = this.runwayPoint(airport, runway, -halfLength, halfWidth);
    const thresholdB1 = this.runwayPoint(airport, runway, halfLength, -halfWidth);
    const thresholdB2 = this.runwayPoint(airport, runway, halfLength, halfWidth);

    const surface = clipBodyPolygonToNearPlane([
      this.worldToCamera(camera, leftA),
      this.worldToCamera(camera, leftB),
      this.worldToCamera(camera, rightB),
      this.worldToCamera(camera, rightA)
    ], nearPlane).map(point => projectBodyPoint(point, this.viewport(), nearPlane));
    if (surface.length >= 3 && surface.every(Boolean)) {
      this.ctx.save();
      this.ctx.fillStyle = style.runwayFill;
      this.ctx.beginPath();
      this.ctx.moveTo(surface[0].x, surface[0].y);
      for (const point of surface.slice(1)) this.ctx.lineTo(point.x, point.y);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }

    drawSegment(leftA, leftB, style.runway, 2.2, 0.95);
    drawSegment(rightA, rightB, style.runway, 2.2, 0.95);
    drawSegment(thresholdA1, thresholdA2, style.runway, 2.4, 0.95);
    drawSegment(thresholdB1, thresholdB2, style.runway, 2.4, 0.95);

    for (let along = -halfLength; along <= halfLength; along += Math.max(80, halfLength / 10)) {
      drawSegment(
        this.runwayPoint(airport, runway, along, -halfWidth),
        this.runwayPoint(airport, runway, along, halfWidth),
        style.runwayFill,
        1,
        0.7
      );
    }

    const dashLength = Math.max(24, halfLength / 34);
    for (let along = -halfLength; along < halfLength; along += dashLength * 2) {
      drawSegment(
        this.runwayPoint(airport, runway, along, 0),
        this.runwayPoint(airport, runway, Math.min(halfLength, along + dashLength), 0),
        style.runway,
        1.5,
        0.9
      );
    }

    const lightStep = Math.max(55, halfLength / 15);
    for (let along = -halfLength; along <= halfLength; along += lightStep) {
      for (const cross of [-halfWidth, halfWidth]) {
        const point = projectBodyPoint(
          this.worldToCamera(camera, this.runwayPoint(airport, runway, along, cross)),
          this.viewport(),
          nearPlane
        );
        if (!point || point.x < -20 || point.x > this.canvas.width + 20 ||
            point.y < -20 || point.y > this.canvas.height + 20) continue;
        this.ctx.fillStyle = style.lights;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, clamp(12 / Math.sqrt(point.depth), 1, 3), 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    const projectedCenter = projectBodyPoint(this.worldToCamera(camera, {
      ...airport,
      altitude: airport.elevation
    }), this.viewport());
    if (projectedCenter && projectedCenter.depth < 12000) {
      this.drawText(`${airport.id}  RWY ${runway.id}`, projectedCenter.x - 70, projectedCenter.y - 32, {
        color: style.runway,
        align: 'right',
        size: 10,
        halo: true
      });
    }
  }

  drawWorld(frame, camera) {
    this.drawGroundGrid(frame, camera);
    for (const airport of frame.features?.airports ?? []) {
      for (const runway of airport.runways ?? []) this.drawRunway(frame, camera, airport, runway);
    }

    for (const obstacle of frame.features?.obstacles ?? []) {
      const baseAltitude = obstacle.elevation - obstacle.agl;
      this.drawWorldSegment(
        camera,
        { lat: obstacle.lat, lon: obstacle.lon, altitude: baseAltitude },
        { lat: obstacle.lat, lon: obstacle.lon, altitude: obstacle.elevation },
        this.style.drag,
        1.5,
        0.85
      );
    }
  }

  bodyPointToWorld(frame, point) {
    return pointFromNed(frame.position, bodyToEarth(point, frame.orientation));
  }

  drawAircraft(frame, camera) {
    if (!camera.external) return;
    const points = {
      nose: { x: 4.1, y: 0, z: 0 },
      tail: { x: -4.2, y: 0, z: 0 },
      leftWing: { x: 0.4, y: -5.5, z: 0 },
      rightWing: { x: 0.4, y: 5.5, z: 0 },
      leftTail: { x: -3.3, y: -1.8, z: 0 },
      rightTail: { x: -3.3, y: 1.8, z: 0 },
      fin: { x: -3.3, y: 0, z: -1.5 }
    };
    const center = this.aircraftScreenPoint(frame, camera);
    if (!center) return;
    const projected = Object.fromEntries(Object.entries(points).map(([key, point]) => [
      key,
      projectBodyPoint(
        this.worldToCamera(camera, this.bodyPointToWorld(frame, point)),
        this.viewport(),
        1
      )
    ]));
    if (Object.values(projected).some(point => !point)) return;

    const wingSpan = Math.hypot(
      projected.rightWing.x - projected.leftWing.x,
      projected.rightWing.y - projected.leftWing.y
    );
    const scale = clamp(34 / Math.max(1, wingSpan), 1, 3.5);
    for (const point of Object.values(projected)) {
      point.x = center.x + (point.x - center.x) * scale;
      point.y = center.y + (point.y - center.y) * scale;
    }
    const segments = [
      ['nose', 'tail'],
      ['leftWing', 'rightWing'],
      ['leftTail', 'rightTail'],
      ['tail', 'fin']
    ];
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [color, width] of [
      [this.style.panelSolid, 6],
      [this.style.foreground, 2.4]
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const [a, b] of segments) {
        ctx.moveTo(projected[a].x, projected[a].y);
        ctx.lineTo(projected[b].x, projected[b].y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = this.style.foreground;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  aircraftScreenPoint(frame, camera) {
    if (!camera.external) {
      return { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    }
    return projectBodyPoint(
      this.worldToCamera(camera, frame.position),
      this.viewport(),
      1
    );
  }

  rectanglesOverlap(a, b, padding = 3) {
    return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x &&
      a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
  }

  drawVectorLabel(desiredX, desiredY, text, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '10px "B612 Mono", monospace';
    const width = ctx.measureText(text).width + 8;
    ctx.restore();
    const height = 16;
    const offsets = [0, -18, 18, -36, 36, -54, 54, -72, 72];
    let bounds = null;
    for (const offset of offsets) {
      const candidate = {
        x: clamp(desiredX, 8, this.canvas.width - width - 8),
        y: clamp(desiredY + offset - height / 2, 82, this.canvas.height - 48),
        width,
        height
      };
      if (!this.labelBounds.some(other => this.rectanglesOverlap(candidate, other))) {
        bounds = candidate;
        break;
      }
    }
    bounds ??= { x: desiredX, y: desiredY, width, height };
    this.labelBounds.push(bounds);

    ctx.save();
    ctx.fillStyle = this.style.labelBackground;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.font = '10px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, bounds.x + 4, bounds.y + bounds.height / 2 + 0.5);
    ctx.restore();
  }

  drawArrow(center, direction, value, label, color) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.5) return;
    let dx = direction.y + direction.x * 0.34;
    let dy = direction.z - direction.x * 0.2;
    if (value < 0) {
      dx = -dx;
      dy = -dy;
    }
    const magnitude = Math.hypot(dx, dy) || 1;
    const length = clamp(Math.abs(value) * CONFIG.FORCE_VECTOR_SCALE * 0.82, 20, 175);
    dx = dx / magnitude * length;
    dy = dy / magnitude * length;
    const endX = center.x + dx;
    const endY = center.y + dy;
    const angle = Math.atan2(dy, dx);

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 9 * Math.cos(angle - Math.PI / 6), endY - 9 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - 9 * Math.cos(angle + Math.PI / 6), endY - 9 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.drawVectorLabel(endX + 7, endY, `${label} ${Math.round(value)}N`, color);
  }

  drawMoment(center, value, label, color, radius, startAngle) {
    const sweep = calculateMomentSweep(value);
    if (!sweep) return;
    const endAngle = startAngle + sweep;
    const direction = Math.sign(value);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, direction < 0);
    ctx.stroke();
    const x = center.x + Math.cos(endAngle) * radius;
    const y = center.y + Math.sin(endAngle) * radius;
    const tangent = endAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7 * Math.cos(tangent - Math.PI / 6), y - 7 * Math.sin(tangent - Math.PI / 6));
    ctx.lineTo(x - 7 * Math.cos(tangent + Math.PI / 6), y - 7 * Math.sin(tangent + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.drawVectorLabel(x + 8, y, formatMomentLabel(label, value), color);
  }

  drawForceVectors(frame, camera) {
    const forces = frame.forces;
    if (!forces?.components || !forces.aerodynamic) return;
    const center = this.aircraftScreenPoint(frame, camera);
    if (!center) return;
    const alpha = forces.aerodynamic.alpha;
    const components = forces.components;
    const lift = { x: Math.sin(alpha), y: 0, z: -Math.cos(alpha) };
    const drag = { x: -Math.cos(alpha), y: 0, z: -Math.sin(alpha) };
    const cameraDirection = direction => earthToBody(
      bodyToEarth(direction, frame.orientation),
      camera.orientation
    );
    const weight = earthToBody({ north: 0, east: 0, down: 1 }, camera.orientation);

    this.drawArrow(center, cameraDirection(lift), components.lift, 'LIFT', this.style.lift);
    this.drawArrow(center, weight, components.weight, 'WEIGHT', this.style.weight);
    this.drawArrow(center, cameraDirection({ x: 1, y: 0, z: 0 }), components.thrust, 'THRUST', this.style.thrust);
    this.drawArrow(center, cameraDirection(drag), components.drag, 'DRAG', this.style.drag);
    this.drawArrow(center, cameraDirection({ x: 0, y: 1, z: 0 }), components.side, 'SIDE', this.style.side);
    this.drawArrow(center, cameraDirection({ x: forces.body.X, y: forces.body.Y, z: forces.body.Z }),
      Math.hypot(forces.body.X, forces.body.Y, forces.body.Z),
      'RESULTANT', this.style.resultant);

    if (forces.moments) {
      this.drawMoment(center, forces.moments.L, 'L', this.style.roll, 24, Math.PI);
      this.drawMoment(center, forces.moments.M, 'M', this.style.pitch, 32, -Math.PI / 2);
      this.drawMoment(center, forces.moments.N, 'N', this.style.yaw, 40, 0);
    }
  }

  drawIls(frame) {
    const guidance = frame.navigation?.ils;
    if (!CONFIG.SHOW_ILS_OVERLAY || !guidance?.available) return;
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const travelX = this.canvas.width * 0.22;
    const travelY = this.canvas.height * 0.22;
    const x = centerX + guidance.localizerNeedle * travelX;
    const y = centerY + guidance.glideslopeNeedle * travelY;
    const color = guidance.captured ? this.style.ils : this.style.ilsArmed;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = guidance.captured ? 2 : 1.2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x, 76);
    ctx.lineTo(x, this.canvas.height - 36);
    ctx.stroke();
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.canvas.width, y);
    ctx.stroke();
    ctx.restore();
  }

  drawText(text, x, y, options = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${options.bold ? 'bold ' : ''}${options.size ?? 11}px "B612 Mono", monospace`;
    ctx.textAlign = options.align ?? 'left';
    ctx.textBaseline = options.baseline ?? 'alphabetic';
    if (options.halo) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = this.style.panelSolid;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = options.color ?? this.style.foreground;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawPostEffects() {
    const ctx = this.ctx;
    if (this.style.scanlines) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#000000';
      for (let y = 0; y < this.canvas.height; y += 4) ctx.fillRect(0, y, this.canvas.width, 1);
      ctx.restore();
    }
    const age = performance.now() - this.styleChangedAt;
    if (age < 180) {
      ctx.save();
      ctx.globalAlpha = (1 - age / 180) * 0.16;
      ctx.fillStyle = this.style.foreground;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  render() {
    const frame = this.session.getFrame();
    const camera = this.resolveCamera(frame);
    const simulator = this.session.simulator;
    this.labelBounds = [];
    this.drawAttitudeBackground(camera);
    if (frame.worldReady) this.drawWorld(frame, camera);
    simulator.drawSharedHudUnderlay?.();
    this.drawForceVectors(frame, camera);
    this.drawAircraft(frame, camera);
    this.drawPostEffects();
    simulator.drawSharedHudOverlay?.();
  }
}
