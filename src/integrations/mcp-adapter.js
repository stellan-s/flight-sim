import { CONFIG } from '../config.js';
import { calculateLevelFlightTrim } from '../core/trim.js';
import { CHART_THEME_NAMES } from '../rendering/chart-themes.js';
import { calculateGroundVelocity, getHorizontalSpeed } from '../utils/coordinates.js';
import { DEG_TO_RAD, MS_TO_KNOTS } from '../utils/constants.js';

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function primitives(source) {
  return Object.fromEntries(Object.entries(source ?? {}).filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value) &&
    (typeof value !== 'number' || Number.isFinite(value))
  ));
}

/**
 * Converts the browser-owned simulator into a small, deliberate API for MCP.
 * The adapter is kept separate from the transport so the game remains usable
 * without an MCP process and commands can be tested directly in the browser.
 */
export class FlightSimulatorMcpAdapter {
  constructor(simulator) {
    this.simulator = simulator;
  }

  getSnapshot() {
    const sim = this.simulator;
    const snapshot = JSON.parse(sim.renderGameToText());
    const groundVelocity = calculateGroundVelocity(
      sim.state.velocity,
      sim.state.orientation,
      {
        north: sim.wind.windNorth,
        east: sim.wind.windEast,
        down: sim.wind.windDown
      }
    );
    const groundSpeedKt = getHorizontalSpeed(groundVelocity) * MS_TO_KNOTS;
    const headingDeg = ((sim.state.orientation.yaw * RAD_TO_DEG) + 360) % 360;

    snapshot.navigation.vor = sim.vorNav?.getNavigationData(
      sim.state.position.lat,
      sim.state.position.lon
    ) ?? null;
    snapshot.navigation.airport = sim.airportNav?.getNavigationData(
      sim.state.position.lat,
      sim.state.position.lon,
      headingDeg,
      groundSpeedKt,
      sim.wind.direction
    ) ?? null;
    snapshot.mcp = {
      apiVersion: 2,
      worldReady: sim.worldReady,
      observedAt: new Date().toISOString()
    };
    return snapshot;
  }

  getNearbyAirports(maxDistanceNm = 100, limit = 8) {
    const sim = this.simulator;
    const nearby = sim.airportNav?.getAirportsByDistance(
      sim.state.position.lat,
      sim.state.position.lon,
      clamp(maxDistanceNm, 1, 1000)
    ) ?? [];

    return nearby.slice(0, clamp(Math.round(limit), 1, 32)).map(({ airport, distance }) => ({
      id: airport.id,
      name: airport.name,
      latitude: airport.lat,
      longitude: airport.lon,
      elevationFt: airport.elevation,
      distanceNm: Number(distance.toFixed(2)),
      runways: airport.runways
    }));
  }

  getConfiguration() {
    const sim = this.simulator;
    return {
      config: primitives(CONFIG),
      aircraft: primitives(sim.specs),
      input: primitives(sim.input),
      wind: primitives(sim.wind),
      energy: {
        ...primitives(sim.energyDiagram),
        margin: primitives(sim.energyDiagram?.margin)
      },
      display: {
        theme: sim.chart.theme,
        zoom: sim.chart.requestedZoom,
        rotationMode: sim.chart.rotationMode,
        vectorMode: sim.vectors.vectorMode
      },
      availableThemes: CHART_THEME_NAMES,
      airports: sim.chartFeatures?.airports ?? [],
      vors: sim.chartFeatures?.vors ?? [],
      obstacles: sim.chartFeatures?.obstacles ?? []
    };
  }

  refreshDiagnostics() {
    const sim = this.simulator;
    sim.physics.updateWind();
    const diagnostics = sim.physics.computeDerivatives(sim.state, sim.controls);
    sim.lastForces = {
      ...diagnostics.forces,
      moments: diagnostics.moments
    };
    sim.envelopeState = sim.envelope.update(
      0,
      sim.state,
      sim.controls,
      sim.lastForces,
      sim.groundState
    );
  }

  setPaused(paused) {
    this.simulator.paused = Boolean(paused);
    return { paused: this.simulator.paused };
  }

  reset() {
    const result = this.simulator.resetConfiguredFlight();
    this.simulator.paused = false;
    return {
      reset: true,
      startMode: CONFIG.INITIAL_START_MODE,
      airportId: this.simulator.groundState?.airportId ?? null,
      runwayId: this.simulator.groundState?.runwayId ?? null,
      trim: result?.velocity ? {
        pitchDeg: result.pitch * RAD_TO_DEG,
        throttle: result.throttle
      } : null
    };
  }

  setControls(args = {}) {
    const sim = this.simulator;
    sim.flightController.engage('direct', args.owner ?? 'instructor');
    const ranges = {
      elevator: [-1, 1],
      aileron: [-1, 1],
      rudder: [-1, 1],
      throttle: [0, 1],
      brake: [0, 1],
      flaps: [0, 1]
    };

    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (Number.isFinite(args[key])) {
        sim.controls[key] = clamp(args[key], min, max);
      }
    }
    if (Number.isFinite(args.elevatorTrim)) {
      sim.input.elevatorTrim = clamp(
        args.elevatorTrim,
        finiteOr(sim.input.trimMin, -1),
        finiteOr(sim.input.trimMax, 1)
      );
      if (!Number.isFinite(args.elevator)) {
        sim.controls.elevator = sim.input.elevatorTrim;
      }
    }

    return JSON.parse(sim.renderGameToText()).controls;
  }

  setControlOwner({ owner } = {}) {
    return this.simulator.flightController.setOwner(owner);
  }

  holdHeading({ headingDeg, maxBankDeg, owner } = {}) {
    return this.simulator.flightController.holdHeading(headingDeg, { maxBankDeg, owner });
  }

  holdAltitude({ altitudeMslFt, owner } = {}) {
    return this.simulator.flightController.holdAltitude(altitudeMslFt, { owner });
  }

  holdAirspeed({ airspeedKt, owner } = {}) {
    return this.simulator.flightController.holdAirspeed(airspeedKt, { owner });
  }

  flyToWaypoint(args = {}) {
    return this.simulator.flightController.flyToWaypoint(args, { owner: args.owner });
  }

  resolveAirportAndRunway(airportId) {
    const sim = this.simulator;
    let airport = sim.airportNav?.selectedAirport;
    if (airportId) airport = sim.airportNav?.selectAirport(String(airportId));
    if (!airport) {
      airport = sim.airportNav?.getNearestAirport(
        sim.state.position.lat,
        sim.state.position.lon,
        1000
      );
      if (airport) sim.airportNav.selectAirport(airport.id);
    }
    if (!airport) throw new Error('No airport is selected or available');
    const runway = sim.airportNav.determineActiveRunway(airport, sim.wind.direction);
    if (!runway) throw new Error(`Airport ${airport.id} has no usable runway`);
    return { airport, runway };
  }

  joinPattern(args = {}) {
    const { airport, runway } = this.resolveAirportAndRunway(args.airportId);
    return this.simulator.flightController.joinPattern(airport, runway, args);
  }

  flyApproach(args = {}) {
    const { airport, runway } = this.resolveAirportAndRunway(args.airportId);
    return this.simulator.flightController.flyApproach(airport, runway, args);
  }

  showInstruction({ message, level, durationSeconds } = {}) {
    return this.simulator.instructorOverlay.show(
      message,
      { level, durationSeconds },
      this.simulator.flightTime
    );
  }

  recorder({ action = 'status' } = {}) {
    const recorder = this.simulator.flightRecorder;
    if (action === 'start') return recorder.setRecording(true, this.simulator.flightTime);
    if (action === 'stop') return recorder.setRecording(false, this.simulator.flightTime);
    if (action === 'clear') {
      recorder.reset(this.simulator.flightTime);
      return recorder.getStatus();
    }
    if (action === 'export') return recorder.export();
    return recorder.getStatus();
  }

  setWind({ directionDeg, speedKt, verticalMps } = {}) {
    const sim = this.simulator;
    const direction = ((finiteOr(directionDeg, sim.wind.baseDirection) % 360) + 360) % 360;
    const speed = clamp(finiteOr(speedKt, sim.wind.baseSpeed), 0, 200);
    if (Number.isFinite(verticalMps)) {
      sim.wind.verticalWind = clamp(verticalMps, -30, 30);
    }
    sim.wind.setBaseWind(direction, speed);
    return {
      directionFromDeg: sim.wind.direction,
      speedKt: sim.wind.speed,
      verticalMps: sim.wind.verticalWind
    };
  }

  selectAirport({ airportId }) {
    const sim = this.simulator;
    const airport = sim.airportNav?.selectAirport(String(airportId));
    if (!airport) throw new Error(`Unknown airport: ${airportId}`);
    const runway = sim.airportNav.determineActiveRunway(airport, sim.wind.direction);
    return {
      id: airport.id,
      name: airport.name,
      elevationFt: airport.elevation,
      activeRunway: runway
    };
  }

  tuneVor({ vorId, obsDeg }) {
    const sim = this.simulator;
    if (!sim.vorNav?.selectVOR(String(vorId))) {
      throw new Error(`Unknown VOR: ${vorId}`);
    }
    if (Number.isFinite(obsDeg)) sim.vorNav.setOBS(obsDeg);
    return sim.vorNav.getNavigationData(
      sim.state.position.lat,
      sim.state.position.lon
    );
  }

  setDisplay({ theme, vectorMode, rotationMode, zoom, ilsOverlayVisible } = {}) {
    const sim = this.simulator;
    if (theme !== undefined && !sim.chart.setTheme(String(theme))) {
      throw new Error(`Unknown theme: ${theme}`);
    }
    if (vectorMode !== undefined) {
      if (!['all', 'energy', 'nav'].includes(vectorMode)) {
        throw new Error(`Unknown vector mode: ${vectorMode}`);
      }
      sim.vectors.vectorMode = vectorMode;
    }
    if (rotationMode !== undefined) {
      if (!['north-up', 'track-up'].includes(rotationMode)) {
        throw new Error(`Unknown rotation mode: ${rotationMode}`);
      }
      sim.chart.setRotationMode(rotationMode);
    }
    if (Number.isFinite(zoom)) sim.chart.setZoom(zoom);
    if (typeof ilsOverlayVisible === 'boolean') CONFIG.SHOW_ILS_OVERLAY = ilsOverlayVisible;
    sim.render();
    return {
      theme: sim.chart.theme,
      vectorMode: sim.vectors.vectorMode,
      rotationMode: sim.chart.rotationMode,
      zoom: sim.chart.zoom,
      requestedZoom: sim.chart.requestedZoom,
      ilsOverlayVisible: CONFIG.SHOW_ILS_OVERLAY
    };
  }

  setParameter({ scope, key, value }) {
    const sim = this.simulator;
    const targets = {
      config: CONFIG,
      aircraft: sim.specs,
      input: sim.input,
      wind: sim.wind,
      energy: sim.energyDiagram
    };
    const target = targets[scope];
    if (!target) throw new Error(`Unknown parameter scope: ${scope}`);
    if (!Object.hasOwn(target, key)) throw new Error(`Unknown ${scope} parameter: ${key}`);

    const previous = target[key];
    if (!['string', 'number', 'boolean'].includes(typeof previous)) {
      throw new Error(`${scope}.${key} is not a writable primitive parameter`);
    }
    if (typeof value !== typeof previous || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`${scope}.${key} requires a finite ${typeof previous}`);
    }

    target[key] = value;
    if (scope === 'wind' && ['baseDirection', 'baseSpeed', 'verticalWind'].includes(key)) {
      sim.wind.setBaseWind(sim.wind.baseDirection, sim.wind.baseSpeed);
    }
    sim.persistence.saveAutosave(sim, { force: true });
    return { scope, key, previous, value: target[key] };
  }

  loadScenario(args = {}) {
    const sim = this.simulator;
    if (!sim.worldReady) throw new Error('The simulator world is still loading');

    if (Number.isFinite(args.windDirectionDeg) || Number.isFinite(args.windSpeedKt)) {
      this.setWind({
        directionDeg: args.windDirectionDeg,
        speedKt: args.windSpeedKt
      });
    }

    sim.flightTime = 0;
    sim.lastForces = null;
    sim.lastGroundEventSequence = null;
    sim.envelopeState = sim.envelope.reset();
    sim.flightController.disengage('SCENARIO LOADED — MANUAL CONTROL');
    sim.flightRecorder.reset(0);

    if (args.startMode === 'runway') {
      const airportId = args.airportId ?? CONFIG.INITIAL_AIRPORT;
      const runwayEnd = args.runwayEnd ?? CONFIG.INITIAL_RUNWAY_END;
      const spawn = sim.ground?.spawnOnRunway(
        sim.state,
        sim.controls,
        {
          north: sim.wind.windNorth,
          east: sim.wind.windEast,
          down: sim.wind.windDown
        },
        airportId,
        runwayEnd
      );
      if (!spawn) throw new Error(`Could not spawn on ${airportId} runway ${runwayEnd}`);
      sim.input.elevatorTrim = 0;
      sim.initialTrim = null;
      sim.groundState = sim.ground.getStatus(sim.state, sim.controls);
      sim.updateMapZoom(1);
      this.refreshDiagnostics();
      sim.airportNav?.selectAirport(airportId);
      sim.chart.setCenter(sim.state.position.lat, sim.state.position.lon);
      sim.paused = args.paused ?? true;
      sim.render();
      return {
        loaded: true,
        startMode: 'runway',
        airportId,
        runwayEnd,
        paused: sim.paused
      };
    }

    const altitudeFt = clamp(
      finiteOr(args.altitudeMslFt, sim.state.position.altitude),
      -1000,
      60000
    );
    const iasKt = clamp(finiteOr(args.iasKt, Math.max(1, sim.state.getIAS())), 1, 400);
    const flaps = clamp(finiteOr(args.flaps, sim.controls.flaps), 0, 1);
    const trim = calculateLevelFlightTrim(sim.specs, altitudeFt, iasKt, { flaps });

    sim.state.position.lat = finiteOr(args.latitude, sim.state.position.lat);
    sim.state.position.lon = finiteOr(args.longitude, sim.state.position.lon);
    sim.state.position.altitude = altitudeFt;
    sim.state.velocity.u = trim.velocity.u;
    sim.state.velocity.v = trim.velocity.v;
    sim.state.velocity.w = trim.velocity.w;
    sim.state.orientation.pitch = Number.isFinite(args.pitchDeg)
      ? args.pitchDeg * DEG_TO_RAD
      : trim.pitch;
    sim.state.orientation.roll = finiteOr(args.rollDeg, 0) * DEG_TO_RAD;
    sim.state.orientation.yaw = finiteOr(args.headingDeg, 0) * DEG_TO_RAD;
    sim.state.angularVelocity.p = 0;
    sim.state.angularVelocity.q = 0;
    sim.state.angularVelocity.r = 0;

    sim.controls.elevator = trim.elevator;
    sim.controls.aileron = 0;
    sim.controls.rudder = 0;
    sim.controls.throttle = clamp(finiteOr(args.throttle, trim.throttle), 0, 1);
    sim.controls.brake = 0;
    sim.controls.flaps = flaps;
    sim.input.elevatorTrim = trim.elevator;
    sim.initialTrim = trim;
    sim.ground?.reset({ contact: false });
    sim.groundState = sim.ground?.getStatus(sim.state, sim.controls) ?? null;
    sim.updateMapZoom(1);
    this.refreshDiagnostics();
    if (args.airportId) this.selectAirport({ airportId: args.airportId });
    sim.chart.setCenter(sim.state.position.lat, sim.state.position.lon);
    sim.paused = args.paused ?? true;
    sim.render();

    return {
      loaded: true,
      startMode: 'airborne',
      latitude: sim.state.position.lat,
      longitude: sim.state.position.lon,
      altitudeMslFt: altitudeFt,
      iasKt,
      headingDeg: ((sim.state.orientation.yaw * RAD_TO_DEG) + 360) % 360,
      paused: sim.paused,
      trim: {
        pitchDeg: trim.pitch * RAD_TO_DEG,
        throttle: trim.throttle
      }
    };
  }

  advance({ milliseconds }) {
    const duration = clamp(Math.round(milliseconds), 1, 30000);
    this.simulator.advanceTime(duration);
    return {
      advancedMilliseconds: this.simulator.paused ? 0 : duration,
      paused: this.simulator.paused,
      flightTimeSeconds: this.simulator.flightTime
    };
  }

  execute(name, args = {}) {
    switch (name) {
      case 'get_state': return this.getSnapshot();
      case 'get_nearby_airports': return this.getNearbyAirports(args.maxDistanceNm, args.limit);
      case 'get_configuration': return this.getConfiguration();
      case 'get_landing_history': return this.simulator.persistence.getLandingHistory();
      case 'pause': return this.setPaused(true);
      case 'resume': return this.setPaused(false);
      case 'reset': return this.reset();
      case 'set_controls': return this.setControls(args);
      case 'set_control_owner': return this.setControlOwner(args);
      case 'hold_heading': return this.holdHeading(args);
      case 'hold_altitude': return this.holdAltitude(args);
      case 'hold_airspeed': return this.holdAirspeed(args);
      case 'fly_to_waypoint': return this.flyToWaypoint(args);
      case 'join_pattern': return this.joinPattern(args);
      case 'fly_approach': return this.flyApproach(args);
      case 'show_instruction': return this.showInstruction(args);
      case 'flight_recorder': return this.recorder(args);
      case 'set_wind': return this.setWind(args);
      case 'select_airport': return this.selectAirport(args);
      case 'tune_vor': return this.tuneVor(args);
      case 'set_display': return this.setDisplay(args);
      case 'set_parameter': return this.setParameter(args);
      case 'load_scenario': return this.loadScenario(args);
      case 'advance': return this.advance(args);
      default: throw new Error(`Unknown MCP command: ${name}`);
    }
  }
}
