/**
 * Filename: main.js
 * Purpose: Main entry point and game loop for the flight simulator
 *
 * This file orchestrates all simulator subsystems:
 * - Physics engine (6DOF aircraft dynamics)
 * - Rendering (chart, instruments, vectors)
 * - User input (keyboard, mouse)
 * - Navigation (VOR, wind)
 * - Audio (morse code)
 *
 * The game loop runs at 60 FPS, updating physics and rendering each frame.
 */

import { AircraftState, AircraftSpecs, Controls } from './core/aircraft.js';
import { PhysicsEngine } from './core/physics.js';
import { calculateLevelFlightTrim } from './core/trim.js';
import { GroundSystem } from './core/ground.js';
import { FlightEnvelopeSystem } from './core/flight-envelope.js';
import { FlightController } from './core/flight-controller.js';
import { FlightRecorder } from './core/flight-recorder.js';
import { calculateFlightMetrics } from './core/flight-metrics.js';
import { PersistenceManager } from './core/persistence.js';
import { StallWarningPlayer } from './audio/stall-warning.js';
import { ChartRenderer } from './rendering/chart.js';
import { VectorRenderer } from './rendering/vectors.js';
import { InstrumentRenderer } from './rendering/instruments.js';
import { EnergyDiagram } from './rendering/energy-diagram.js';
import { IlsOverlayRenderer } from './rendering/ils-overlay.js';
import { drawAsciiText } from './rendering/ascii-hud.js';
import { ConfigurationPanel } from './ui/configuration-panel.js';
import { HelpPanel } from './ui/help-panel.js';
import { InstructorOverlay } from './ui/instructor-overlay.js';
import { InputHandler } from './controls/input.js';
import { WindModel } from './navigation/wind.js';
import { VORNavigation } from './navigation/vor.js';
import { AirportNavigation } from './navigation/airport-nav.js';
import { CONFIG } from './config.js';
import { DEG_TO_RAD, MS_TO_KNOTS } from './utils/constants.js';
import {
  calculateGroundVelocity,
  getHorizontalSpeed
} from './utils/coordinates.js';

class FlightSimulator {
  constructor() {
    this.canvas = document.getElementById('chart');
    this.resizeCanvas();
    this.config = CONFIG;

    // World data is loaded after all dependent systems are ready.
    this.chartFeatures = null;
    this.worldReady = false;
    this.ground = null;
    this.groundState = null;

    // Initialize systems
    this.state = new AircraftState();
    this.specs = new AircraftSpecs('cessna172');
    this.controls = new Controls();
    this.envelope = new FlightEnvelopeSystem(this.specs);
    this.envelopeState = this.envelope.status;
    this.stallWarning = new StallWarningPlayer(CONFIG);
    this.stallWarning.attachUnlock(document);

    // Set the configured initial flight condition.
    this.state.position.altitude = CONFIG.INITIAL_ALTITUDE;
    const initialTrim = calculateLevelFlightTrim(
      this.specs,
      CONFIG.INITIAL_ALTITUDE,
      CONFIG.INITIAL_SPEED
    );
    this.state.velocity.u = initialTrim.velocity.u;
    this.state.velocity.v = initialTrim.velocity.v;
    this.state.velocity.w = initialTrim.velocity.w;
    this.state.orientation.pitch = initialTrim.pitch +
      CONFIG.INITIAL_PITCH_OFFSET * DEG_TO_RAD;
    this.state.orientation.roll = CONFIG.INITIAL_ROLL * DEG_TO_RAD;
    this.state.orientation.yaw = CONFIG.INITIAL_HEADING * DEG_TO_RAD;
    this.state.angularVelocity.p = 0;
    this.state.angularVelocity.q = 0;
    this.state.angularVelocity.r = 0;
    this.controls.throttle = initialTrim.throttle;
    this.controls.elevator = initialTrim.elevator;
    this.initialTrim = initialTrim;

    // Debug mode
    this.debugMode = CONFIG.DEBUG_MODE;
    this.debugInterval = 0;
    this.lastDebugTime = 0;
    this.frameCount = 0;

    // Rendering
    this.chart = new ChartRenderer(this.canvas);
    this.vectors = new VectorRenderer(this.chart);
    this.instruments = new InstrumentRenderer(this.chart);
    this.energyDiagram = new EnergyDiagram(this.chart);
    this.ilsOverlay = new IlsOverlayRenderer(this.chart);

    // Wind model with dynamic variations
    this.wind = new WindModel();
    this.wind.setBaseWind(
      CONFIG.INITIAL_WIND_DIRECTION,
      CONFIG.INITIAL_WIND_SPEED
    );

    // VOR navigation (wait for chart features to load)
    this.vorNav = null;

    // Physics
    this.physics = new PhysicsEngine(this.state, this.specs, this.controls);
    this.physics.setWindModel(this.wind);

    // Input
    this.input = new InputHandler(this.controls, this.chart, null, this, this.vectors);
    this.flightController = new FlightController(this);
    this.flightRecorder = new FlightRecorder();
    this.instructorOverlay = new InstructorOverlay();

    // Full runtime configuration console
    this.configPanel = new ConfigurationPanel(this);
    this.helpPanel = new HelpPanel(this);

    // Restore durable tuning and display preferences before world initialization.
    this.persistence = new PersistenceManager();
    this.persistedSnapshot = this.persistence.loadAutosave();
    if (this.persistedSnapshot) {
      this.persistence.apply(this, this.persistedSnapshot, { features: false });
    }

    // Hold the calculated elevator trim when the pitch control is released.
    this.input.elevatorTrim = initialTrim.elevator;

    // Timing
    this.lastTime = performance.now();
    this.dt = CONFIG.PHYSICS_TIMESTEP;
    this.physicsSubsteps = Math.max(1, Math.floor(CONFIG.PHYSICS_SUBSTEPS));
    this.accumulator = 0;

    // Start game loop
    this.lastForces = null;
    this.running = true;

    // Pause and help state
    this.paused = false;
    this.showHelp = false;
    this.helpScrollOffset = 0; // Scroll position for help overlay

    // Flight timer
    this.flightTime = 0; // seconds
    this.flightStartTime = performance.now();
    this.simulationClockMode = 'foreground';

    // Display controls
    this.showControls();

    // Load airports/runways, apply persisted edits, then place the aircraft.
    this.loadChartFeatures();

    console.log('Starting game loop...');
    requestAnimationFrame(() => this.gameLoop());
    this.setupBackgroundClock();

    // Handle window resize
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  setupBackgroundClock() {
    const source = `setInterval(() => postMessage(performance.now()), 50);`;
    const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    this.clockWorker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    this.backgroundClockTime = null;
    this.clockWorker.addEventListener('message', event => {
      if (!document.hidden || !this.running) {
        this.backgroundClockTime = event.data;
        return;
      }
      const elapsedMs = this.backgroundClockTime === null
        ? 0
        : Math.max(0, Math.min(1000, event.data - this.backgroundClockTime));
      this.backgroundClockTime = event.data;
      this.simulationClockMode = 'background-worker';
      if (elapsedMs > 0) {
        this.advanceSimulation(elapsedMs, { processInput: false, render: false });
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.lastTime = performance.now();
      this.accumulator = 0;
      this.backgroundClockTime = null;
      this.simulationClockMode = document.hidden ? 'background-worker' : 'foreground';
    });
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  async loadChartFeatures() {
    try {
      const response = await fetch('data/chart-features.json');
      this.chartFeatures = await response.json();
      console.log('Chart features loaded:', this.chartFeatures);

      if (this.persistedSnapshot) {
        this.persistence.apply(this, this.persistedSnapshot, { features: true });
      }
      this.rebuildWorldSystems();
      this.resetConfiguredFlight();
      this.worldReady = true;
    } catch (error) {
      console.warn('Could not load chart features:', error);
      this.worldReady = true;
    }
  }

  rebuildWorldSystems() {
    if (!this.chartFeatures) return;
    this.vorNav = new VORNavigation(this.chartFeatures);
    this.airportNav = new AirportNavigation(this.chartFeatures);
    this.ground = new GroundSystem(this.chartFeatures, this.specs, CONFIG);
    this.physics.setGroundSystem(this.ground);
    this.input.setVORNavigation(this.vorNav);

    if (this.chartFeatures.vors?.length) {
      this.vorNav.selectVOR(this.chartFeatures.vors[0].id);
      this.vorNav.setOBS(0);
    }
  }

  showControls() {
    console.log('=== FLIGHT SIMULATOR - PHASE 3 (VOR NAVIGATION) ===');
    console.log('');
    console.log('SYSTEM:');
    console.log('  P or SPACE: Pause/Resume');
    console.log('  H or ?: Help overlay (scrollable VOR navigation guide)');
    console.log('  C or ENTER: Full flight-model configuration');
    console.log('  Mouse Wheel / Arrows: Scroll help when open');
    console.log('');
    console.log('FLIGHT CONTROLS:');
    console.log('  Arrow Up/Down: Pitch (↑=pitch down, ↓=pitch up)');
    console.log('  Arrow Left/Right: Roll (bank left/right)');
    console.log('  A/D: Rudder (yaw left/right)');
    console.log('  W/S: Throttle up/down');
    console.log('  B: Hold wheel brakes');
    console.log('  F: Cycle flaps 0/10/20/30°');
    console.log('  PageUp/PageDown: Elevator TRIM (holds pitch)');
    console.log('  Home: Reset trim to zero');
    console.log('');
    console.log('NAVIGATION CONTROLS:');
    console.log('  ⭐ Right-Click or Ctrl+Click: Tune VOR on chart ⭐');
    console.log('  Q/E: Adjust OBS (course selector) ±10°');
    console.log('  L: Select airport | I: Toggle full-screen ILS guidance');
    console.log('  N: North-Up (fixed map) | T: Track-Up (map rotates with plane)');
    console.log('  Note: Wind arrows rotate with map in Track-Up mode');
    console.log('  Mouse: Full-screen crosshair for precision');
    console.log('  Mouse Wheel: Zoom in/out');
    console.log('  1/2/3/4: Zoom presets (1x, 3x, 5x, 10x)');
    console.log('');
    console.log('AIRCRAFT: Cessna 172 Skyhawk');
    console.log(CONFIG.INITIAL_START_MODE === 'runway'
      ? `  Starting: ${CONFIG.INITIAL_AIRPORT} runway ${CONFIG.INITIAL_RUNWAY_END}`
      : `  Starting: ${CONFIG.INITIAL_ALTITUDE}ft MSL, ${CONFIG.INITIAL_SPEED}kt IAS, trimmed for cruise`);
    console.log(`  Wind: ${CONFIG.INITIAL_WIND_DIRECTION}° @ ${CONFIG.INITIAL_WIND_SPEED}kt base (DYNAMIC - varies ±20°, ±5kt)`);
    console.log('  Navigation: ABC VOR auto-tuned');
    console.log('  Timer: Flight time displayed bottom-right');
    console.log('');
    console.log('VOR NAVIGATION:');
    console.log('  1. Right-Click on any VOR to tune it');
    console.log('  2. Use Q/E to set desired course (OBS)');
    console.log('  3. Watch CDI needle (bottom-right) for course guidance');
    console.log('  4. TO/FROM flag shows direction to VOR');
    console.log('  5. Green line = OBS course, Blue line = your current radial');
    console.log('  6. DME shows distance in nautical miles');
    console.log('');
    console.log('DISPLAYS:');
    console.log('  Top-center: Heading tape (linear compass)');
    console.log('  CENTER: Black deviation line (turn to center it on green OBS)');
    console.log('  Near aircraft: Attitude indicator (moves with plane)');
    console.log('  Top-right: Instruments (ALT, IAS, VS, WIND) + State');
    console.log('  Bottom-right: CDI (VOR navigation)');
    console.log('  Left: VOR selection panel');
    console.log('  Bottom-left: Navigation data (TAS, GS, drift)');
    console.log('  Bottom-right: CDI instrument');
    console.log('  Full screen: ILS localizer and glideslope for selected airport');
    console.log('  Left side: VOR selection panel');
    console.log('  Center screen: Black line (turn to center = on course)');
    console.log('  Chart: Green=OBS/center, Blue=radial, Black=your offset');
    console.log('');
    console.log(this.debugMode
      ? `Debug output enabled (every ${CONFIG.DEBUG_OUTPUT_INTERVAL / 1000} seconds)...`
      : 'Debug output disabled.');
    console.log('');
  }

  stepSimulation() {
    const substepDt = this.dt / this.physicsSubsteps;
    for (let i = 0; i < this.physicsSubsteps; i++) {
      if (typeof this.wind.updateDynamic === 'function') {
        this.wind.updateDynamic(substepDt);
      }
      this.flightController.update(substepDt);
      this.lastForces = this.physics.update(substepDt);
      this.groundState = this.physics.lastGroundState ?? this.groundState;
      this.envelopeState = this.envelope.update(
        substepDt,
        this.state,
        this.controls,
        this.lastForces,
        this.groundState
      );
      this.handleGroundEvent(this.groundState?.event);
    }

    this.energyDiagram.update(this.state, this.dt);
    this.flightTime += this.dt;
    this.flightRecorder.update(this.flightTime, () => this.createRecorderSample());
    this.updateMapZoom(this.dt);
    this.chart.setCenter(this.state.position.lat, this.state.position.lon);
    this.debugInterval += this.dt;
    if (this.debugMode && this.debugInterval >= CONFIG.DEBUG_OUTPUT_INTERVAL / 1000) {
      this.debugInterval = 0;
      console.log('FLIGHT DEBUG', this.createRecorderSample());
    }
  }

  updateMapZoom(dt) {
    return this.chart.updateContextZoom(
      this.groundState?.contact ? CONFIG.GROUND_MAP_ZOOM : null,
      dt,
      CONFIG.GROUND_ZOOM_TRANSITION_RATE
    );
  }

  createRecorderSample() {
    const metrics = calculateFlightMetrics(this);
    return {
      latitude: this.state.position.lat,
      longitude: this.state.position.lon,
      altitudeMslFt: this.state.position.altitude,
      aglFt: this.groundState?.aglFt ?? null,
      iasKt: this.state.getIAS(),
      groundSpeedKt: metrics.groundSpeedKt,
      groundTrackDeg: metrics.groundTrackDeg,
      flightPathAngleDeg: metrics.flightPathAngleDeg,
      verticalSpeedFpm: this.state.getClimbRate(),
      headingDeg: (this.state.orientation.yaw * 180 / Math.PI + 360) % 360,
      pitchDeg: this.state.orientation.pitch * 180 / Math.PI,
      rollDeg: this.state.orientation.roll * 180 / Math.PI,
      turnRateDegPerSecond: metrics.turnRateDegPerSecond,
      sideslipDeg: metrics.sideslipDeg,
      controls: {
        elevator: this.controls.elevator,
        aileron: this.controls.aileron,
        rudder: this.controls.rudder,
        throttle: this.controls.throttle,
        flaps: this.controls.flaps
      },
      controlOwner: this.flightController.owner,
      controllerMode: this.flightController.mode,
      groundPhase: this.groundState?.phase ?? null
    };
  }

  gameLoop() {
    const currentTime = performance.now();
    const frameTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    if (document.hidden) {
      if (this.running) requestAnimationFrame(() => this.gameLoop());
      return;
    }
    this.simulationClockMode = 'foreground';

    // Fixed timestep with accumulator
    this.accumulator += frameTime;

    // Prevent spiral of death
    if (this.accumulator > 0.2) {
      this.accumulator = 0.2;
    }

    // Always process input (even when paused, for pause/help keys)
    this.input.update(frameTime);
    if (this.worldReady) this.persistence.update(this, frameTime);

    // Update physics with fixed timestep (skip if paused)
    if (!this.paused && this.worldReady) {
      while (this.accumulator >= this.dt) {
        this.stepSimulation();
        this.accumulator -= this.dt;
      }
    } else {
      // When paused, clear accumulator to prevent jump on unpause
      this.accumulator = 0;
      this.updateMapZoom(frameTime);
    }

    // Render (always render even when paused)
    this.render();

    if (this.running) {
      requestAnimationFrame(() => this.gameLoop());
    }
  }

  advanceSimulation(milliseconds, { processInput = true, render = true } = {}) {
    const steps = Math.max(1, Math.round(milliseconds / (this.dt * 1000)));

    for (let step = 0; step < steps; step++) {
      if (processInput) this.input.update(this.dt);
      if (this.worldReady) this.persistence.update(this, this.dt);
      if (this.paused || !this.worldReady) continue;
      this.stepSimulation();
    }

    this.chart.setCenter(this.state.position.lat, this.state.position.lon);
    this.lastTime = performance.now();
    this.accumulator = 0;
    if (render) this.render();
  }

  advanceTime(milliseconds) {
    this.simulationClockMode = 'deterministic';
    this.advanceSimulation(milliseconds);
  }

  retrimCurrentFlight() {
    const altitude = this.state.position.altitude;
    const indicatedAirspeed = Math.max(1, this.state.getIAS());
    const trim = calculateLevelFlightTrim(
      this.specs,
      altitude,
      indicatedAirspeed,
      { flaps: this.controls.flaps }
    );

    this.state.velocity.u = trim.velocity.u;
    this.state.velocity.v = trim.velocity.v;
    this.state.velocity.w = trim.velocity.w;
    this.state.orientation.pitch = trim.pitch;
    this.state.angularVelocity.p = 0;
    this.state.angularVelocity.q = 0;
    this.state.angularVelocity.r = 0;
    this.controls.elevator = trim.elevator;
    this.controls.aileron = 0;
    this.controls.rudder = 0;
    this.controls.throttle = trim.throttle;
    this.controls.brake = 0;
    this.input.elevatorTrim = trim.elevator;
    this.initialTrim = trim;
    this.lastForces = null;
    return trim;
  }

  resetConfiguredFlight() {
    this.wind.time = 0;
    this.wind.setBaseWind(CONFIG.INITIAL_WIND_DIRECTION, CONFIG.INITIAL_WIND_SPEED);
    this.flightTime = 0;
    this.lastForces = null;
    this.lastGroundEventSequence = null;
    this.envelopeState = this.envelope.reset();
    this.flightController?.disengage('RESET — MANUAL CONTROL');
    this.flightRecorder?.reset(0);

    if (CONFIG.INITIAL_START_MODE === 'runway' && this.ground) {
      const spawn = this.ground.spawnOnRunway(
        this.state,
        this.controls,
        {
          north: this.wind.windNorth,
          east: this.wind.windEast,
          down: this.wind.windDown
        },
        CONFIG.INITIAL_AIRPORT,
        CONFIG.INITIAL_RUNWAY_END
      );
      if (spawn) {
        this.input.elevatorTrim = 0;
        this.initialTrim = null;
        this.groundState = this.ground.getStatus(this.state, this.controls);
        this.updateMapZoom(1);
        this.chart.setCenter(this.state.position.lat, this.state.position.lon);
        return spawn;
      }
    }

    this.state.position.lat = 0;
    this.state.position.lon = 0;
    this.state.position.altitude = CONFIG.INITIAL_ALTITUDE;

    const trim = calculateLevelFlightTrim(
      this.specs,
      CONFIG.INITIAL_ALTITUDE,
      CONFIG.INITIAL_SPEED
    );
    this.state.velocity.u = trim.velocity.u;
    this.state.velocity.v = trim.velocity.v;
    this.state.velocity.w = trim.velocity.w;
    this.state.orientation.pitch = trim.pitch + CONFIG.INITIAL_PITCH_OFFSET * DEG_TO_RAD;
    this.state.orientation.roll = CONFIG.INITIAL_ROLL * DEG_TO_RAD;
    this.state.orientation.yaw = CONFIG.INITIAL_HEADING * DEG_TO_RAD;
    this.state.angularVelocity.p = 0;
    this.state.angularVelocity.q = 0;
    this.state.angularVelocity.r = 0;

    this.controls.elevator = trim.elevator;
    this.controls.aileron = 0;
    this.controls.rudder = 0;
    this.controls.throttle = trim.throttle;
    this.controls.brake = 0;
    this.controls.flaps = 0;
    this.input.elevatorTrim = trim.elevator;
    this.initialTrim = trim;
    this.ground?.reset({ contact: false });
    this.groundState = this.ground?.getStatus(this.state, this.controls) ?? null;
    this.updateMapZoom(1);
    this.chart.setCenter(0, 0);
    return trim;
  }

  handleGroundEvent(event) {
    if (!event || event.sequence === this.lastGroundEventSequence) return;
    this.lastGroundEventSequence = event.sequence;
    this.flightRecorder?.addEvent(event.type, this.flightTime, event.report);
    if ((event.type === 'touchdown' || event.type === 'crash') && event.report) {
      this.persistence.recordLanding(event.report, this.flightTime);
      this.persistence.saveAutosave(this, { force: true });
    }
  }

  applySnapshot(snapshot) {
    if (!this.persistence.apply(this, snapshot, { features: true })) {
      throw new Error('Unsupported snapshot');
    }
    this.rebuildWorldSystems();
    this.resetConfiguredFlight();
    this.persistence.saveAutosave(this, { force: true });
  }

  saveNamedPreset() {
    return this.persistence.savePreset(this.persistence.profileName, this);
  }

  loadNamedPreset() {
    const snapshot = this.persistence.loadPreset(this.persistence.profileName);
    this.applySnapshot(snapshot);
    return this.persistence.profileName;
  }

  deleteNamedPreset() {
    return this.persistence.deletePreset(this.persistence.profileName);
  }

  exportConfiguration() {
    return this.persistence.download(this);
  }

  async importConfiguration() {
    const snapshot = await this.persistence.requestImport();
    this.applySnapshot(snapshot);
    return true;
  }

  renderGameToText() {
    const toDegrees = radians => radians * 180 / Math.PI;
    const round = (value, digits = 3) => Number(value.toFixed(digits));
    const components = this.lastForces?.components;
    const groundVelocity = calculateGroundVelocity(
      this.state.velocity,
      this.state.orientation,
      {
        north: this.wind.windNorth,
        east: this.wind.windEast,
        down: this.wind.windDown
      }
    );
    const metrics = calculateFlightMetrics(this);
    const controller = this.flightController.getState();
    const recorder = this.flightRecorder.getStatus();

    return JSON.stringify({
      coordinateSystem: 'lat/lon degrees; altitude feet MSL; body velocity m/s (forward/right/down)',
      mode: {
        paused: this.paused,
        helpVisible: this.showHelp,
        helpSection: this.helpPanel.activeSection,
        configuration: this.configPanel.getState(),
        helpScrollOffset: round(this.helpScrollOffset, 1),
        mapRotation: this.chart.rotationMode,
        mapTheme: this.chart.theme,
        pitchLineVisible: CONFIG.SHOW_PITCH_INDICATOR,
        throttleIndicatorVisible: CONFIG.SHOW_THROTTLE_INDICATOR,
        ilsOverlayVisible: CONFIG.SHOW_ILS_OVERLAY,
        vectorMode: this.vectors.vectorMode,
        zoom: round(this.chart.zoom, 1),
        requestedZoom: round(this.chart.requestedZoom, 1),
        groundZoomActive: this.groundState?.contact === true,
        simulationClock: this.simulationClockMode
      },
      aircraft: {
        latitude: round(this.state.position.lat, 6),
        longitude: round(this.state.position.lon, 6),
        altitudeFt: round(this.state.position.altitude, 1),
        iasKt: round(this.state.getIAS(), 1),
        groundSpeedKt: round(getHorizontalSpeed(groundVelocity) * MS_TO_KNOTS, 1),
        groundTrackDeg: round(metrics.groundTrackDeg, 1),
        flightPathAngleDeg: round(metrics.flightPathAngleDeg, 1),
        turnRateDegPerSecond: round(metrics.turnRateDegPerSecond, 2),
        sideslipDeg: round(metrics.sideslipDeg, 1),
        verticalSpeedFpm: round(this.state.getClimbRate(), 1),
        headingDeg: round((toDegrees(this.state.orientation.yaw) + 360) % 360, 1),
        pitchDeg: round(toDegrees(this.state.orientation.pitch), 1),
        rollDeg: round(toDegrees(this.state.orientation.roll), 1),
        velocityBody: {
          u: round(this.state.velocity.u),
          v: round(this.state.velocity.v),
          w: round(this.state.velocity.w)
        }
      },
      controls: {
        owner: controller.owner,
        mode: controller.mode,
        elevator: round(this.controls.elevator),
        aileron: round(this.controls.aileron),
        rudder: round(this.controls.rudder),
        throttle: round(this.controls.throttle),
        brake: round(this.controls.brake),
        flaps: round(this.controls.flaps),
        flapsDeg: round(this.controls.flaps * this.specs.flapMaxDeg, 1),
        elevatorTrim: round(this.input.elevatorTrim)
      },
      wind: {
        directionFromDeg: round((this.wind.direction + 360) % 360, 1),
        speedKt: round(this.wind.speed, 1)
      },
      navigation: {
        selectedVor: this.vorNav?.selectedVOR?.id ?? null,
        obsDeg: this.vorNav?.obs ?? null,
        selectedAirport: this.airportNav?.selectedAirport?.id ?? null,
        activeRunway: metrics.activeRunwayId,
        heightAboveSelectedAirportFt: metrics.heightAboveSelectedAirportFt === null
          ? null
          : round(metrics.heightAboveSelectedAirportFt, 1),
        patternAltitudeMslFt: metrics.patternAltitudeMslFt === null
          ? null
          : round(metrics.patternAltitudeMslFt, 1),
        runwayCenterlineDistanceMeters: metrics.runway === null
          ? null
          : round(metrics.runway.centerlineDistanceMeters, 1),
        runwayCenterlineSignedMeters: metrics.runway === null
          ? null
          : round(metrics.runway.crossTrackMeters, 1),
        ils: metrics.ils?.available ? {
          status: metrics.ils.status,
          airportId: metrics.ils.airportId,
          runwayId: metrics.ils.runwayId,
          runwayHeadingDeg: round(metrics.ils.runwayHeadingDeg, 1),
          distanceToThresholdNm: round(metrics.ils.distanceToThresholdNm, 2),
          crossTrackMeters: round(metrics.ils.crossTrackMeters, 1),
          localizerErrorDeg: round(metrics.ils.localizerErrorDeg, 2),
          localizerDots: round(metrics.ils.localizerDots, 2),
          glideslopeErrorDeg: round(metrics.ils.glideslopeErrorDeg, 2),
          glideslopeDots: round(metrics.ils.glideslopeDots, 2),
          targetAltitudeMslFt: round(metrics.ils.targetAltitudeMslFt, 1),
          heightErrorFt: round(metrics.ils.heightErrorFt, 1),
          localizerCaptured: metrics.ils.localizerCaptured,
          glideslopeCaptured: metrics.ils.glideslopeCaptured,
          captured: metrics.ils.captured
        } : {
          status: 'UNAVAILABLE',
          reason: metrics.ils?.reason ?? 'SELECT AIRPORT',
          airportId: metrics.ils?.airportId ?? null,
          runwayId: metrics.ils?.runwayId ?? null
        }
      },
      ground: this.groundState ? {
        phase: this.groundState.phase,
        contact: this.groundState.contact,
        crashed: this.groundState.crashed,
        airportId: this.groundState.airportId,
        runwayId: this.groundState.runwayId,
        surfaceType: this.groundState.surfaceType,
        onRunway: this.groundState.onRunway,
        aglFt: round(this.groundState.aglFt, 1),
        terrainElevationFt: round(this.groundState.terrainElevationFt, 1),
        landingArmed: this.groundState.landingArmed,
        groundSpeedKt: round(this.groundState.groundSpeedKt, 1),
        brake: round(this.groundState.brake),
        message: this.groundState.message,
        lastLanding: this.groundState.lastReport
      } : null,
      envelope: this.envelopeState ? {
        phase: this.envelopeState.phase,
        warning: this.envelopeState.warning,
        stalled: this.envelopeState.stalled,
        spinning: this.envelopeState.spinning,
        recovering: this.envelopeState.recovering,
        failed: this.envelopeState.failed,
        alphaDeg: round(this.envelopeState.alphaDeg, 1),
        stallMarginDeg: round(this.envelopeState.stallMarginDeg, 1),
        stallSeverity: round(this.envelopeState.stallSeverity),
        spinDirection: this.envelopeState.spinDirection,
        recoveryProgress: round(this.envelopeState.recoveryProgress),
        loadFactorG: round(this.envelopeState.loadFactorG, 2),
        overspeed: this.envelopeState.overspeed,
        structuralDamage: round(this.envelopeState.structuralDamage),
        failureCause: this.envelopeState.failureCause,
        groundEffect: round(this.envelopeState.groundEffect),
        audibleWarning: this.stallWarning.getState()
      } : null,
      persistence: {
        autoSave: this.persistence.autoSave,
        profileName: this.persistence.profileName,
        presetCount: this.persistence.getPresetNames().length,
        landingCount: this.persistence.getLandingHistory().length
      },
      autopilot: controller,
      instructor: this.instructorOverlay.getState(this.flightTime),
      recorder,
      forcesNewtons: components ? {
        lift: round(components.lift, 1),
        weight: round(components.weight, 1),
        thrust: round(components.thrust, 1),
        drag: round(components.drag, 1),
        side: round(components.side, 1)
      } : null,
      momentsNewtonMeters: this.lastForces?.moments ? {
        roll: round(this.lastForces.moments.L, 1),
        pitch: round(this.lastForces.moments.M, 1),
        yaw: round(this.lastForces.moments.N, 1)
      } : null,
      flightTimeSeconds: round(this.flightTime, 2)
    });
  }

  render() {
    this.stallWarning.update(this.envelopeState, {
      muted: this.paused || this.configPanel.isOpen
    });

    // Update aircraft heading for track-up mode
    this.chart.aircraftHeading = this.state.orientation.yaw;

    this.chart.clear();
    this.chart.drawGrid();

    // Draw wind field (behind everything)
    this.chart.drawWindField(this.wind);

    // Draw chart features (VORs, airports, obstacles)
    // But skip selected airport - we'll draw it highlighted separately
    if (this.chartFeatures) {
      const selectedAirportId = this.airportNav?.selectedAirport?.id;

      // Draw VORs
      if (this.chartFeatures.vors) {
        this.chartFeatures.vors.forEach(vor => {
          this.chart.drawVOR(vor.lat, vor.lon, vor.id, vor.frequency);
        });
      }

      // Draw obstacles
      if (this.chartFeatures.obstacles) {
        this.chartFeatures.obstacles.forEach(obstacle => {
          this.chart.drawObstacle(obstacle.lat, obstacle.lon, obstacle.elevation);
        });
      }

      // Draw airports (non-selected ones normally, selected one highlighted)
      if (this.chartFeatures.airports) {
        this.chartFeatures.airports.forEach(airport => {
          const isSelected = airport.id === selectedAirportId;
          if (isSelected) {
            this.chart.drawAirport(airport, true);
          } else {
            this.chart.drawAirport(airport);
          }
        });
      }
    }

    // Draw VOR navigation aids if VOR is tuned
    if (this.vorNav && this.vorNav.selectedVOR) {
      const navData = this.vorNav.getNavigationData(
        this.state.position.lat,
        this.state.position.lon
      );

      // Draw OBS course line, radial, and heading vector
      this.chart.drawVORRadial(
        this.vorNav.selectedVOR.lat,
        this.vorNav.selectedVOR.lon,
        this.state.position.lat,
        this.state.position.lon,
        navData.obs,
        this.state.orientation.yaw
      );

      // Draw DME arc at current distance
      if (navData.distance) {
        this.chart.drawDMEArc(
          this.vorNav.selectedVOR.lat,
          this.vorNav.selectedVOR.lon,
          navData.distance
        );
      }
    }

    // Draw airport navigation aids if airport is selected
    if (this.airportNav && this.airportNav.selectedAirport) {
      const groundVelocity = calculateGroundVelocity(
        this.state.velocity,
        this.state.orientation,
        {
          north: this.wind.windNorth,
          east: this.wind.windEast,
          down: this.wind.windDown
        }
      );
      const groundSpeed = getHorizontalSpeed(groundVelocity) * MS_TO_KNOTS;

      // Get navigation data
      const airportNavData = this.airportNav.getNavigationData(
        this.state.position.lat,
        this.state.position.lon,
        this.state.orientation.yaw,
        groundSpeed,
        this.wind.direction
      );

      // Draw direct-to line
      this.chart.drawDirectToLine(
        this.state.position.lat,
        this.state.position.lon,
        this.airportNav.selectedAirport.lat,
        this.airportNav.selectedAirport.lon
      );

      // Draw navigation info box
      this.chart.drawAirportNavInfo(airportNavData);
    }

    // Draw the roll-rotated pitch horizon beneath HUD text and vector labels.
    this.instruments.drawAttitudeIndicator(this.state);

    // Full-screen localizer and glideslope needles stay beneath force vectors.
    this.ilsOverlay.draw(calculateFlightMetrics(this).ils);

    this.chart.drawInstruments(this.state, this.chart.zoom, this.wind);

    // Draw force vectors
    if (this.lastForces) {
      this.vectors.drawForceVectors(this.state, this.lastForces, this.wind);
    }

    // Draw state vectors (top-right)
    this.vectors.drawStateVectors(this.state, this.controls, this.input, this.lastForces);

    // Keep commanded engine power visible beside the screen-center aircraft.
    this.instruments.drawThrottleIndicator(this.controls.throttle);

    // Runway contact, braking, and landing evaluation status.
    this.instruments.drawGroundStatus(this.groundState);

    // Stall, spin, structural-load, flap, and ground-effect status.
    this.instruments.drawEnvelopeStatus(
      this.envelopeState,
      this.controls,
      this.specs
    );

    // Draw vector mode indicator (bottom-left)
    this.vectors.drawVectorModeIndicator();

    // Draw aircraft last (on top)
    this.chart.drawAircraft(this.state);

    // Draw rotation mode indicator
    this.chart.drawRotationModeIndicator();

    // Draw flight timer
    this.chart.drawFlightTimer(this.flightTime);

    // Draw energy diagram (bottom of screen)
    this.energyDiagram.draw(this.state);

    // Draw crosshair (very last, on top of everything)
    this.input.drawCrosshair();

    // Short in-world instructions remain visible without switching to chat.
    this.instructorOverlay.draw(
      this.chart.ctx,
      this.canvas,
      this.chart.palette,
      this.flightTime
    );

    // Draw pause indicator
    if (this.paused && !this.configPanel.isOpen && !this.showHelp) {
      this.drawPauseOverlay();
    }

    // Draw help overlay
    if (this.showHelp) {
      this.helpPanel.draw(this.chart.ctx, this.canvas);
    }

    // Configuration is always the topmost full-screen surface.
    this.configPanel.draw(this.chart.ctx, this.canvas);
  }

  drawPauseOverlay() {
    const ctx = this.chart.ctx;
    const canvas = this.chart.canvas;
    const palette = this.chart.palette;
    const centerX = canvas.width / 2;
    const y = 105;

    drawAsciiText(ctx, '|| PAUSED', centerX, y, {
      color: palette.foreground,
      haloColor: palette.panelSolid,
      font: 'bold 24px "B612 Mono", monospace',
      align: 'center',
      baseline: 'middle',
      haloWidth: 5
    });
    drawAsciiText(ctx, '[P] RESUME   [H] HELP   [C] CONFIG', centerX, y + 29, {
      color: palette.muted,
      haloColor: palette.panelSolid,
      font: '11px "B612 Mono", monospace',
      align: 'center',
      baseline: 'middle'
    });
  }

  drawHelpOverlay() {
    const ctx = this.chart.ctx;
    const canvas = this.chart.canvas;

    const boxX = 50;
    const boxY = 50;
    const boxWidth = canvas.width - 100;
    const boxHeight = canvas.height - 100;

    ctx.save();

    // Semi-transparent background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Create clipping region for scrollable content
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX + 5, boxY + 5, boxWidth - 10, boxHeight - 10);
    ctx.clip();

    // Content (with scroll offset)
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let y = 70 - this.helpScrollOffset;
    const x = 80;
    const lineHeight = 20;

    // Title
    ctx.font = 'bold 20px monospace';
    ctx.fillText('FLIGHT SIMULATOR - HELP & VOR NAVIGATION GUIDE', x, y);
    y += 35;

    // Flight Controls
    ctx.font = 'bold 14px monospace';
    ctx.fillText('FLIGHT CONTROLS:', x, y);
    y += lineHeight + 5;

    ctx.font = '12px monospace';
    const controls = [
      '↑/↓ Arrow Keys         Pitch (↑ = pitch down, ↓ = pitch up)',
      '←/→ Arrow Keys         Roll (bank left/right)',
      'A / D                  Rudder (yaw left/right)',
      'W / S                  Throttle up/down',
      'B                      Hold wheel brakes',
      'F                      Cycle flaps 0/10/20/30°',
      'PageUp / PageDown      Elevator TRIM (crucial for hands-off flight)',
      'Home                   Reset trim to zero',
    ];
    controls.forEach(line => {
      ctx.fillText(line, x + 10, y);
      y += lineHeight;
    });

    y += 10;

    // Navigation Controls
    ctx.font = 'bold 14px monospace';
    ctx.fillText('NAVIGATION CONTROLS:', x, y);
    y += lineHeight + 5;

    ctx.font = '12px monospace';
    const navControls = [
      'Right-Click on VOR     Tune VOR station',
      'Q / E                  Adjust OBS (course selector) ±10°',
      'N / T                  Toggle North-Up / Track-Up mode',
      '                       (Wind arrows rotate with map in Track-Up)',
      'Mouse Wheel            Zoom in/out',
      '1 / 2 / 3 / 4          Zoom presets',
    ];
    navControls.forEach(line => {
      ctx.fillText(line, x + 10, y);
      y += lineHeight;
    });

    y += 10;

    // System Controls
    ctx.font = 'bold 14px monospace';
    ctx.fillText('SYSTEM:', x, y);
    y += lineHeight + 5;

    ctx.font = '12px monospace';
    ctx.fillText('P or SPACE             Pause/Resume', x + 10, y);
    y += lineHeight;
    ctx.fillText('H or ?                 Toggle this help', x + 10, y);
    y += lineHeight;
    ctx.fillText('C or ENTER             Open full configuration console', x + 10, y);
    y += lineHeight + 15;

    // VOR Navigation Guide
    ctx.font = 'bold 16px monospace';
    ctx.fillText('═══ VOR NAVIGATION GUIDE ═══', x, y);
    y += lineHeight + 10;

    ctx.font = 'bold 13px monospace';
    ctx.fillText('What is VOR?', x, y);
    y += lineHeight;

    ctx.font = '11px monospace';
    const vorIntro = [
      'VOR (VHF Omnidirectional Range) is a radio navigation beacon that transmits',
      '360 radials. Aircraft tune the VOR frequency and select a course to track.',
    ];
    vorIntro.forEach(line => {
      ctx.fillText(line, x + 10, y);
      y += lineHeight - 3;
    });
    y += 10;

    ctx.font = 'bold 13px monospace';
    ctx.fillText('How to Fly a VOR Radial:', x, y);
    y += lineHeight + 3;

    ctx.font = '11px monospace';
    const steps = [
      '1. TUNE VOR: Right-click on a VOR station on the chart (e.g., ABC VOR)',
      '   • VOR info appears in left panel and CDI (bottom-right)',
      '',
      '2. SET COURSE (OBS): Press Q/E to dial in desired course',
      '   • OBS = Omni-Bearing Selector (the course you want to fly)',
      '   • Example: Set 090° to fly eastbound on the 090 radial',
      '',
      '3. UNDERSTAND THE VECTORS ON CHART:',
      '   • Blue dashed line = your current radial FROM the VOR',
      '   • Green dashed line = your selected OBS course (target)',
      '   • Black solid arrow = your HEADING (where nose points)',
      '   • Shows HDG 090° label on the arrow',
      '',
      '4. INTERCEPT THE RADIAL:',
      '   • Turn so your black heading arrow points toward the green line',
      '   • Intercept at ~30-45° angle for smooth capture',
      '',
      '5. READ THE CDI (Course Deviation Indicator):',
      '   • Vertical needle shows left/right deviation',
      '   • Each dot = 2° off course (full scale = 10° deviation)',
      '   • Center needle = ON COURSE ✓',
      '   • Needle LEFT → fly LEFT to get back on course',
      '   • Needle RIGHT → fly RIGHT to get back on course',
      '',
      '6. TO/FROM FLAG:',
      '   • TO = flying TOWARD the VOR station',
      '   • FROM = flying AWAY FROM the VOR station',
      '   • If flag shows "TO" and you\'re flying away, you\'re on the',
      '     opposite radial - turn 180° or reverse your OBS',
      '',
      '7. USE THE HEADING DEVIATION LINE (thin black line):',
      '   • Line moves across screen based on your heading error',
      '   • Center = on course (aligned with green OBS line)',
      '   • Line to the RIGHT = you are LEFT of course → turn RIGHT',
      '   • Line to the LEFT = you are RIGHT of course → turn LEFT',
      '   • Goal: Turn to bring black line to CENTER',
      '',
      '8. TRACK THE COURSE:',
      '   • Keep both CDI needle AND heading indicator centered',
      '   • Wind will cause drift - adjust heading to maintain track',
      '   • Watch: Black heading arrow may not align with green OBS line',
      '     due to wind correction angle',
      '   • Typical corrections: 5-10° heading change',
      '',
      '9. DME (Distance Measuring Equipment):',
      '   • Shows distance to VOR in nautical miles',
      '   • Blue dashed circle on chart = your current DME arc',
    ];

    steps.forEach(line => {
      if (line === '') {
        y += 5;
      } else if (line.startsWith('   ')) {
        ctx.fillText(line, x + 10, y);
        y += lineHeight - 3;
      } else {
        ctx.font = 'bold 11px monospace';
        ctx.fillText(line, x + 10, y);
        ctx.font = '11px monospace';
        y += lineHeight - 2;
      }
    });

    y += 10;

    ctx.font = 'bold 13px monospace';
    ctx.fillText('Common VOR Procedures:', x, y);
    y += lineHeight + 3;

    ctx.font = '11px monospace';
    const procedures = [
      '• RADIAL INBOUND: Set OBS to VOR bearing, fly until TO flag, track inbound',
      '• RADIAL OUTBOUND: Set OBS to desired radial, fly until FROM flag appears',
      '• CROSS-RADIAL FIX: Tune 2 VORs, find intersection of radials for position',
      '• ARC DME: Fly circular path maintaining constant DME distance',
    ];
    procedures.forEach(line => {
      ctx.fillText(line, x + 10, y);
      y += lineHeight - 2;
    });

    // Calculate total content height
    const contentHeight = y + this.helpScrollOffset - 70 + 100; // Total height including padding
    const maxScroll = Math.max(0, contentHeight - boxHeight);

    // Clamp scroll position
    this.helpScrollOffset = Math.max(0, Math.min(this.helpScrollOffset, maxScroll));

    ctx.restore(); // End clipping region

    // Draw scrollbar if content is scrollable
    if (maxScroll > 0) {
      const scrollbarX = boxX + boxWidth - 15;
      const scrollbarY = boxY + 5;
      const scrollbarHeight = boxHeight - 10;
      const scrollbarWidth = 10;

      // Scrollbar track
      ctx.fillStyle = '#DDDDDD';
      ctx.fillRect(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight);

      // Scrollbar thumb
      const thumbHeight = Math.max(30, (boxHeight / contentHeight) * scrollbarHeight);
      const thumbY = scrollbarY + (this.helpScrollOffset / maxScroll) * (scrollbarHeight - thumbHeight);

      ctx.fillStyle = '#888888';
      ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);

      // Scrollbar border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight);
    }

    // Close instruction (always visible at bottom)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX + 10, canvas.height - 100, boxWidth - 20, 45);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 10, canvas.height - 100, boxWidth - 20, 45);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('Press H or ? to close help', canvas.width / 2, canvas.height - 90);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('SCROLL: Mouse Wheel, ↑↓ arrows, PgUp/PgDn, Home/End', canvas.width / 2, canvas.height - 70);

    ctx.restore();
  }
}

// Start even when a host injects the module after DOMContentLoaded.
function startSimulator() {
  const simulator = new FlightSimulator();
  window.flightSimulator = simulator;
  window.render_game_to_text = () => simulator.renderGameToText();
  window.advanceTime = milliseconds => simulator.advanceTime(milliseconds);

  if (new URLSearchParams(window.location.search).get('mcp') === '1') {
    import('./integrations/mcp-bridge.js')
      .then(({ McpGameBridge }) => {
        const bridge = new McpGameBridge(simulator);
        window.flightSimulatorMcp = bridge;
        bridge.connect();
      })
      .catch(error => console.error('Could not start MCP game bridge:', error));
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startSimulator, { once: true });
} else {
  startSimulator();
}
