import { CONFIG } from '../config.js';
import { CHART_THEME_NAMES } from '../rendering/chart-themes.js';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

const clamp = (value, min = -Infinity, max = Infinity) =>
  Math.max(min, Math.min(max, value));

const wrap = (value, length) => ((value % length) + length) % length;

function decimalsForStep(step) {
  if (!Number.isFinite(step) || step >= 1) return 0;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
}

function heading(label) {
  return { type: 'heading', label, selectable: false };
}

function numberItem(label, get, set, options = {}) {
  return {
    type: 'number',
    label,
    get,
    set,
    step: options.step ?? 1,
    min: options.min ?? -Infinity,
    max: options.max ?? Infinity,
    precision: options.precision ?? decimalsForStep(options.step ?? 1),
    unit: options.unit ?? '',
    description: options.description ?? ''
  };
}

function angleItem(label, target, key, options = {}) {
  return numberItem(
    label,
    () => target[key] * RAD_TO_DEG,
    value => { target[key] = value * DEG_TO_RAD; },
    { step: 1, min: -180, max: 360, unit: 'deg', ...options }
  );
}

function textItem(label, get, set, options = {}) {
  return {
    type: 'text',
    label,
    get,
    set,
    description: options.description ?? ''
  };
}

function enumItem(label, get, set, options, description = '') {
  return { type: 'enum', label, get, set, options, description };
}

function boolItem(label, get, set, description = '') {
  return { type: 'boolean', label, get, set, description };
}

function readonlyItem(label, get, unit = '', description = '') {
  return { type: 'readonly', label, get, unit, description };
}

function actionItem(label, run, description = '') {
  return { type: 'action', label, run, description };
}

function numericProperty(target, key, label, options = {}) {
  return numberItem(label, () => target[key], value => { target[key] = value; }, options);
}

/**
 * Full-screen, keyboard-operated editor for every runtime simulator parameter.
 * The simulator is paused while the panel is open and changes are applied live.
 */
export class ConfigurationPanel {
  constructor(simulator) {
    this.simulator = simulator;
    this.isOpen = false;
    this.categoryIndex = 0;
    this.rowIndex = 1;
    this.rowScroll = 0;
    this.categoryScroll = 0;
    this.wasPaused = false;
    this.openedAt = 0;
    this.displayRowY = null;
    this.editing = null;
    this.status = 'LIVE VALUES — CHANGES APPLY IMMEDIATELY';
    this.statusUntil = 0;
  }

  open() {
    if (this.isOpen) return;
    this.wasPaused = this.simulator.paused;
    this.simulator.paused = true;
    this.simulator.showHelp = false;
    this.isOpen = true;
    this.openedAt = performance.now();
    this.editing = null;
    this.ensureSelection();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.editing = null;
    this.simulator.paused = this.wasPaused;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  setStatus(message) {
    this.status = message;
    this.statusUntil = performance.now() + 2400;
  }

  refreshDiagnostics() {
    const sim = this.simulator;
    if (!sim.physics?.computeDerivatives) return;
    const diagnostics = sim.physics.computeDerivatives(sim.state, sim.controls);
    sim.lastForces = {
      ...diagnostics.forces,
      moments: diagnostics.moments
    };
  }

  getCategories() {
    const sim = this.simulator;
    const specs = sim.specs;
    const state = sim.state;
    const controls = sim.controls;
    const input = sim.input;
    const wind = sim.wind;
    const features = sim.chartFeatures ?? { airports: [], vors: [], obstacles: [] };
    const categories = [];

    categories.push({
      id: 'session',
      label: 'SESSION',
      description: 'Simulation clock, integration, startup state and maintenance actions.',
      items: [
        heading('INTEGRATION'),
        numberItem('Physics timestep', () => sim.dt, value => {
          sim.dt = value;
          CONFIG.PHYSICS_TIMESTEP = value;
        }, { step: 0.001, min: 0.001, max: 0.1, precision: 4, unit: 's' }),
        numberItem('Physics substeps', () => sim.physicsSubsteps, value => {
          sim.physicsSubsteps = Math.max(1, Math.round(value));
          CONFIG.PHYSICS_SUBSTEPS = sim.physicsSubsteps;
        }, { step: 1, min: 1, max: 16, precision: 0 }),
        boolItem('Debug logging', () => sim.debugMode, value => {
          sim.debugMode = value;
          CONFIG.DEBUG_MODE = value;
        }),
        numericProperty(CONFIG, 'DEBUG_OUTPUT_INTERVAL', 'Debug interval', {
          step: 250, min: 250, max: 30000, unit: 'ms'
        }),
        heading('INITIAL CONDITIONS'),
        numericProperty(CONFIG, 'INITIAL_ALTITUDE', 'Initial altitude', {
          step: 100, min: 0, max: 60000, unit: 'ft'
        }),
        numericProperty(CONFIG, 'INITIAL_SPEED', 'Initial IAS', {
          step: 1, min: 1, max: 500, unit: 'kt'
        }),
        numericProperty(CONFIG, 'INITIAL_HEADING', 'Initial heading', {
          step: 1, min: 0, max: 359, unit: 'deg'
        }),
        numericProperty(CONFIG, 'INITIAL_PITCH_OFFSET', 'Initial pitch offset', {
          step: 0.5, min: -45, max: 45, unit: 'deg'
        }),
        numericProperty(CONFIG, 'INITIAL_ROLL', 'Initial roll', {
          step: 1, min: -180, max: 180, unit: 'deg'
        }),
        numericProperty(CONFIG, 'INITIAL_WIND_DIRECTION', 'Initial wind direction', {
          step: 5, min: 0, max: 359, unit: 'deg'
        }),
        numericProperty(CONFIG, 'INITIAL_WIND_SPEED', 'Initial wind speed', {
          step: 1, min: 0, max: 250, unit: 'kt'
        }),
        heading('ACTIONS'),
        actionItem('RETRIM AT CURRENT IAS / ALT', () => sim.retrimCurrentFlight(),
          'Solve lift, drag, pitch moment and power for the current flight condition.'),
        actionItem('RESTART FROM INITIAL VALUES', () => sim.resetConfiguredFlight(),
          'Reset position, attitude, speed, controls, wind and timer to the values above.')
      ]
    });

    categories.push({
      id: 'live',
      label: 'LIVE STATE',
      description: 'The active 12-state aircraft vector and pilot controls.',
      items: [
        heading('POSITION'),
        numericProperty(state.position, 'lat', 'Latitude', { step: 0.001, min: -90, max: 90, precision: 5, unit: 'deg' }),
        numericProperty(state.position, 'lon', 'Longitude', { step: 0.001, min: -180, max: 180, precision: 5, unit: 'deg' }),
        numericProperty(state.position, 'altitude', 'Altitude MSL', { step: 100, min: -1500, max: 100000, unit: 'ft' }),
        heading('BODY VELOCITY'),
        numericProperty(state.velocity, 'u', 'Forward velocity u', { step: 1, min: -500, max: 2000, unit: 'm/s' }),
        numericProperty(state.velocity, 'v', 'Right velocity v', { step: 0.5, min: -500, max: 500, unit: 'm/s' }),
        numericProperty(state.velocity, 'w', 'Down velocity w', { step: 0.5, min: -500, max: 500, unit: 'm/s' }),
        heading('ATTITUDE'),
        angleItem('Pitch', state.orientation, 'pitch'),
        angleItem('Roll', state.orientation, 'roll'),
        angleItem('Heading / yaw', state.orientation, 'yaw', { min: 0, max: 359 }),
        heading('ANGULAR RATES'),
        angleItem('Roll rate p', state.angularVelocity, 'p', { step: 0.5, min: -1000, max: 1000, unit: 'deg/s' }),
        angleItem('Pitch rate q', state.angularVelocity, 'q', { step: 0.5, min: -1000, max: 1000, unit: 'deg/s' }),
        angleItem('Yaw rate r', state.angularVelocity, 'r', { step: 0.5, min: -1000, max: 1000, unit: 'deg/s' }),
        heading('CONTROLS'),
        numericProperty(controls, 'elevator', 'Elevator command', { step: 0.01, min: -1, max: 1, precision: 2 }),
        numericProperty(controls, 'aileron', 'Aileron command', { step: 0.01, min: -1, max: 1, precision: 2 }),
        numericProperty(controls, 'rudder', 'Rudder command', { step: 0.01, min: -1, max: 1, precision: 2 }),
        numericProperty(controls, 'throttle', 'Throttle', { step: 0.01, min: 0, max: 1, precision: 2 }),
        numericProperty(input, 'elevatorTrim', 'Elevator trim', { step: 0.005, min: -1, max: 1, precision: 3 }),
        heading('DERIVED — READ ONLY'),
        readonlyItem('Indicated airspeed', () => state.getIAS(), 'kt'),
        readonlyItem('Vertical speed', () => state.getClimbRate(), 'ft/min'),
        readonlyItem('Angle of attack', () => state.getAlpha() * RAD_TO_DEG, 'deg'),
        readonlyItem('Sideslip angle', () => state.getBeta() * RAD_TO_DEG, 'deg')
      ]
    });

    const force = sim.lastForces;
    categories.push({
      id: 'forces',
      label: 'FORCES',
      description: 'Independent live gains for all modeled forces and moments.',
      items: [
        heading('FORCE GAINS'),
        numericProperty(specs, 'gravityMultiplier', 'Gravity / weight', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'liftMultiplier', 'Lift', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'dragMultiplier', 'Drag', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'thrustMultiplier', 'Thrust', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'sideForceMultiplier', 'Side force', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        heading('MOMENT GAINS'),
        numericProperty(specs, 'rollMomentMultiplier', 'Roll moment L', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'pitchMomentMultiplier', 'Pitch moment M', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        numericProperty(specs, 'yawMomentMultiplier', 'Yaw moment N', { step: 0.05, min: 0, max: 10, precision: 2, unit: 'x' }),
        heading('CURRENT OUTPUT — READ ONLY'),
        readonlyItem('Lift', () => force?.components?.lift ?? 0, 'N'),
        readonlyItem('Weight', () => force?.components?.weight ?? 0, 'N'),
        readonlyItem('Thrust', () => force?.components?.thrust ?? 0, 'N'),
        readonlyItem('Drag', () => force?.components?.drag ?? 0, 'N'),
        readonlyItem('Side force', () => force?.components?.side ?? 0, 'N'),
        readonlyItem('Roll moment', () => force?.moments?.L ?? 0, 'N m'),
        readonlyItem('Pitch moment', () => force?.moments?.M ?? 0, 'N m'),
        readonlyItem('Yaw moment', () => force?.moments?.N ?? 0, 'N m')
      ]
    });

    categories.push({
      id: 'airframe',
      label: 'AIRFRAME',
      description: 'Aircraft identity, geometry, mass, engine, inertia and operating limits.',
      items: [
        heading('IDENTITY'),
        textItem('Aircraft name', () => specs.name, value => { specs.name = value; }),
        textItem('Model key', () => specs.type, value => { specs.type = value; }),
        heading('GEOMETRY / MASS'),
        numericProperty(specs, 'mass', 'Mass', { step: 10, min: 1, max: 1000000, unit: 'kg' }),
        numericProperty(specs, 'wingArea', 'Wing area', { step: 0.1, min: 0.1, max: 1000, precision: 1, unit: 'm2' }),
        numericProperty(specs, 'wingspan', 'Wingspan', { step: 0.1, min: 0.1, max: 200, precision: 1, unit: 'm' }),
        numericProperty(specs, 'chord', 'Mean chord', { step: 0.01, min: 0.01, max: 50, precision: 2, unit: 'm' }),
        heading('ENGINE'),
        numericProperty(specs, 'maxThrust', 'Maximum thrust', { step: 50, min: 0, max: 1000000, unit: 'N' }),
        numericProperty(specs, 'propEfficiency', 'Propeller efficiency', { step: 0.01, min: 0, max: 2, precision: 2 }),
        numericProperty(specs, 'powerLapseRate', 'Power lapse exponent', { step: 0.01, min: 0, max: 5, precision: 2 }),
        heading('INERTIA'),
        numericProperty(specs, 'Ixx', 'Roll inertia Ixx', { step: 10, min: 0.1, max: 10000000, unit: 'kg m2' }),
        numericProperty(specs, 'Iyy', 'Pitch inertia Iyy', { step: 10, min: 0.1, max: 10000000, unit: 'kg m2' }),
        numericProperty(specs, 'Izz', 'Yaw inertia Izz', { step: 10, min: 0.1, max: 10000000, unit: 'kg m2' }),
        numericProperty(specs, 'Ixz', 'Cross inertia Ixz', { step: 10, min: -10000000, max: 10000000, unit: 'kg m2' }),
        heading('REFERENCE LIMITS'),
        numericProperty(specs, 'Vne', 'Never exceed Vne', { step: 1, min: 0, max: 2000, unit: 'kt' }),
        numericProperty(specs, 'Vso', 'Landing stall Vso', { step: 1, min: 0, max: 1000, unit: 'kt' }),
        numericProperty(specs, 'Vs', 'Clean stall Vs', { step: 1, min: 0, max: 1000, unit: 'kt' })
      ]
    });

    categories.push({
      id: 'aero-long',
      label: 'AERO / LONG',
      description: 'Lift, drag and longitudinal stability coefficients.',
      items: [
        heading('LIFT / DRAG POLAR'),
        numericProperty(specs, 'Cl0', 'Lift coefficient Cl0', { step: 0.01, min: -5, max: 5, precision: 3 }),
        numericProperty(specs, 'Cl_alpha', 'Lift slope Cl_alpha', { step: 0.1, min: -20, max: 20, precision: 2, unit: '/rad' }),
        numericProperty(specs, 'Cl_max', 'Maximum lift Cl_max', { step: 0.05, min: -5, max: 10, precision: 2 }),
        numericProperty(specs, 'Cd0', 'Zero-lift drag Cd0', { step: 0.001, min: 0, max: 5, precision: 3 }),
        numericProperty(specs, 'K', 'Induced drag K', { step: 0.001, min: 0, max: 5, precision: 3 }),
        numberItem('Stall angle', () => specs.stallAlpha * RAD_TO_DEG,
          value => { specs.stallAlpha = value * DEG_TO_RAD; },
          { step: 0.5, min: -90, max: 90, precision: 1, unit: 'deg' }),
        numericProperty(specs, 'stallDecay', 'Post-stall lift decay', { step: 0.05, min: 0, max: 20, precision: 2 }),
        heading('PITCH STABILITY'),
        numericProperty(specs, 'Cm0', 'Pitch coefficient Cm0', { step: 0.01, min: -10, max: 10, precision: 3 }),
        numericProperty(specs, 'Cm_alpha', 'Pitch stiffness Cm_alpha', { step: 0.01, min: -50, max: 50, precision: 2, unit: '/rad' }),
        numericProperty(specs, 'Cm_q', 'Pitch damping Cm_q', { step: 0.1, min: -100, max: 100, precision: 1 }),
        numericProperty(specs, 'Cm_de', 'Elevator effectiveness Cm_de', { step: 0.05, min: -20, max: 20, precision: 2 }),
        heading('CONTROL GEOMETRY'),
        numericProperty(specs, 'elevatorMaxDeg', 'Elevator max deflection', { step: 1, min: 0, max: 90, unit: 'deg' })
      ]
    });

    categories.push({
      id: 'aero-lat',
      label: 'AERO / LAT',
      description: 'Side force, roll and yaw stability derivatives.',
      items: [
        heading('SIDE FORCE'),
        ...['Cy_beta', 'Cy_p', 'Cy_r', 'Cy_da', 'Cy_dr'].map(key =>
          numericProperty(specs, key, key, { step: 0.01, min: -20, max: 20, precision: 3 })),
        heading('ROLL MOMENT'),
        ...['Cl_beta', 'Cl_p', 'Cl_r', 'Cl_da', 'Cl_dr'].map(key =>
          numericProperty(specs, key, key, { step: 0.01, min: -20, max: 20, precision: 3 })),
        heading('YAW MOMENT'),
        ...['Cn_beta', 'Cn_p', 'Cn_r', 'Cn_da', 'Cn_dr'].map(key =>
          numericProperty(specs, key, key, { step: 0.01, min: -20, max: 20, precision: 3 })),
        heading('CONTROL GEOMETRY'),
        numericProperty(specs, 'aileronMaxDeg', 'Aileron max deflection', { step: 1, min: 0, max: 90, unit: 'deg' }),
        numericProperty(specs, 'rudderMaxDeg', 'Rudder max deflection', { step: 1, min: 0, max: 90, unit: 'deg' })
      ]
    });

    categories.push({
      id: 'controls',
      label: 'CONTROLS',
      description: 'Pilot input rates, centering behavior and numerical safety limits.',
      items: [
        heading('INPUT RATES'),
        numericProperty(input, 'pitchRate', 'Pitch input rate', { step: 0.05, min: 0, max: 20, precision: 2, unit: '/s' }),
        numericProperty(input, 'rollRate', 'Roll input rate', { step: 0.05, min: 0, max: 20, precision: 2, unit: '/s' }),
        numericProperty(input, 'rudderRate', 'Rudder input rate', { step: 0.05, min: 0, max: 20, precision: 2, unit: '/s' }),
        numericProperty(input, 'throttleRate', 'Throttle input rate', { step: 0.05, min: 0, max: 20, precision: 2, unit: '/s' }),
        numericProperty(input, 'trimRate', 'Trim input rate', { step: 0.01, min: 0, max: 5, precision: 2, unit: '/s' }),
        heading('CONTROL CENTERING'),
        numericProperty(input, 'elevatorReturnRate', 'Elevator return rate', { step: 0.1, min: 0, max: 100, precision: 1, unit: '/s' }),
        numericProperty(input, 'aileronReturnRate', 'Aileron return rate', { step: 0.1, min: 0, max: 100, precision: 1, unit: '/s' }),
        numericProperty(input, 'rudderReturnRate', 'Rudder return rate', { step: 0.1, min: 0, max: 100, precision: 1, unit: '/s' }),
        numericProperty(input, 'trimMin', 'Minimum trim command', { step: 0.05, min: -1, max: 1, precision: 2 }),
        numericProperty(input, 'trimMax', 'Maximum trim command', { step: 0.05, min: -1, max: 1, precision: 2 }),
        heading('SAFETY LIMITS'),
        numberItem('Maximum pitch rate', () => specs.maxPitchRate * RAD_TO_DEG,
          value => { specs.maxPitchRate = value * DEG_TO_RAD; },
          { step: 5, min: 1, max: 5000, unit: 'deg/s' }),
        numberItem('Maximum roll rate', () => specs.maxRollRate * RAD_TO_DEG,
          value => { specs.maxRollRate = value * DEG_TO_RAD; },
          { step: 5, min: 1, max: 5000, unit: 'deg/s' }),
        numberItem('Maximum yaw rate', () => specs.maxYawRate * RAD_TO_DEG,
          value => { specs.maxYawRate = value * DEG_TO_RAD; },
          { step: 5, min: 1, max: 5000, unit: 'deg/s' }),
        numericProperty(specs, 'groundAltitude', 'Ground plane altitude', { step: 100, min: -1500, max: 30000, unit: 'ft MSL' }),
        numericProperty(specs, 'earthRadius', 'Earth radius', { step: 1000, min: 1000, max: 100000000, unit: 'm' })
      ]
    });

    categories.push({
      id: 'wind',
      label: 'WIND',
      description: 'Base wind and the deterministic slow variation model.',
      items: [
        heading('BASE WIND'),
        numberItem('Direction from', () => wind.baseDirection, value => {
          wind.setBaseWind(value, wind.baseSpeed);
          CONFIG.INITIAL_WIND_DIRECTION = value;
        }, { step: 5, min: 0, max: 359, unit: 'deg' }),
        numberItem('Speed', () => wind.baseSpeed, value => {
          wind.setBaseWind(wind.baseDirection, value);
          CONFIG.INITIAL_WIND_SPEED = value;
        }, { step: 1, min: 0, max: 250, unit: 'kt' }),
        heading('DYNAMIC VARIATION'),
        numericProperty(wind, 'directionVariation', 'Direction variation', { step: 1, min: 0, max: 180, unit: '+/- deg' }),
        numericProperty(wind, 'speedVariation', 'Speed variation', { step: 0.5, min: 0, max: 250, precision: 1, unit: '+/- kt' }),
        numericProperty(wind, 'changeRate', 'Change rate', { step: 0.005, min: 0, max: 10, precision: 3, unit: 'rad/s' }),
        numericProperty(wind, 'time', 'Wind time phase', { step: 1, min: 0, max: 1000000, precision: 1, unit: 's' }),
        numberItem('Vertical wind (+ down)', () => wind.verticalWind, value => {
          wind.verticalWind = value;
          wind.windDown = value;
        }, { step: 0.5, min: -100, max: 100, precision: 1, unit: 'm/s' }),
        heading('CURRENT VECTOR — READ ONLY'),
        readonlyItem('Current direction from', () => wind.direction, 'deg'),
        readonlyItem('Current speed', () => wind.speed, 'kt'),
        readonlyItem('North component', () => wind.windNorth, 'm/s'),
        readonlyItem('East component', () => wind.windEast, 'm/s'),
        readonlyItem('Down component', () => wind.windDown, 'm/s')
      ]
    });

    categories.push({
      id: 'display',
      label: 'DISPLAY',
      description: 'Chart transform, overlays, vector scaling and instrument layout.',
      items: [
        heading('CHART'),
        enumItem('Default map theme', () => CONFIG.DEFAULT_MAP_THEME,
          value => { CONFIG.DEFAULT_MAP_THEME = value; }, CHART_THEME_NAMES),
        enumItem('Map theme', () => sim.chart.theme,
          value => sim.chart.setTheme(value), CHART_THEME_NAMES,
          'Complete live chart palette: background, grid, labels and navigation colors.'),
        numericProperty(CONFIG, 'DEFAULT_ZOOM', 'Default zoom', { step: 0.1, min: 0.01, max: 1000, precision: 1, unit: 'x' }),
        enumItem('Default map rotation', () => CONFIG.DEFAULT_ROTATION_MODE,
          value => { CONFIG.DEFAULT_ROTATION_MODE = value; }, ['north-up', 'track-up']),
        numberItem('Zoom', () => sim.chart.zoom, value => sim.chart.setZoom(value), {
          step: 0.1, min: CONFIG.MIN_ZOOM, max: CONFIG.MAX_ZOOM, precision: 1, unit: 'x'
        }),
        numericProperty(CONFIG, 'MIN_ZOOM', 'Minimum zoom', { step: 0.1, min: 0.01, max: 100, precision: 2, unit: 'x' }),
        numericProperty(CONFIG, 'MAX_ZOOM', 'Maximum zoom', { step: 0.5, min: 0.1, max: 1000, precision: 1, unit: 'x' }),
        numberItem('Base chart scale', () => sim.chart.baseScale, value => {
          sim.chart.baseScale = value;
          CONFIG.BASE_SCALE = value;
        }, { step: 500, min: 100, max: 1000000, unit: 'px/deg' }),
        numericProperty(CONFIG, 'ZOOM_SPEED', 'Wheel zoom factor', { step: 0.05, min: 1.01, max: 5, precision: 2 }),
        enumItem('Map rotation', () => sim.chart.rotationMode,
          value => sim.chart.setRotationMode(value), ['north-up', 'track-up']),
        heading('VECTOR OVERLAYS'),
        enumItem('Vector mode', () => sim.vectors.vectorMode,
          value => { sim.vectors.vectorMode = value; }, ['all', 'energy', 'nav']),
        numericProperty(CONFIG, 'FORCE_VECTOR_SCALE', 'Force vector scale', { step: 0.005, min: 0, max: 10, precision: 3 }),
        numericProperty(CONFIG, 'VELOCITY_VECTOR_SCALE', 'Velocity vector scale', { step: 0.1, min: 0, max: 100, precision: 1 }),
        numericProperty(CONFIG, 'VOR_RADIAL_LENGTH_PIXELS', 'VOR radial length', { step: 100, min: 0, max: 100000, unit: 'px' }),
        heading('INSTRUMENTS / LAYOUT'),
        boolItem('Viewport pitch line', () => CONFIG.SHOW_PITCH_INDICATOR,
          value => { CONFIG.SHOW_PITCH_INDICATOR = value; }),
        numericProperty(CONFIG, 'PITCH_SCALE_PIXELS_PER_DEG', 'Pitch line scale', { step: 0.5, min: 0.5, max: 20, precision: 1, unit: 'px/deg' }),
        numericProperty(CONFIG, 'PITCH_SCALE_RANGE', 'Pitch edge scale range', { step: 5, min: 5, max: 180, unit: 'deg' }),
        boolItem('Throttle indicator', () => CONFIG.SHOW_THROTTLE_INDICATOR,
          value => { CONFIG.SHOW_THROTTLE_INDICATOR = value; }),
        numericProperty(CONFIG, 'THROTTLE_INDICATOR_OFFSET_X', 'Throttle indicator X offset', { step: 5, min: -4000, max: 4000, unit: 'px' }),
        numericProperty(CONFIG, 'THROTTLE_INDICATOR_OFFSET_Y', 'Throttle indicator Y offset', { step: 5, min: -4000, max: 4000, unit: 'px' }),
        numericProperty(CONFIG, 'THROTTLE_INDICATOR_WIDTH', 'Throttle indicator width', { step: 1, min: 8, max: 28, unit: 'px' }),
        numericProperty(CONFIG, 'THROTTLE_INDICATOR_HEIGHT', 'Throttle indicator height', { step: 5, min: 60, max: 1000, unit: 'px' }),
        numericProperty(CONFIG, 'STATE_PANEL_X', 'State panel right inset', { step: 10, min: 0, max: 4000, unit: 'px' }),
        numericProperty(CONFIG, 'STATE_PANEL_Y', 'State panel top inset', { step: 10, min: 0, max: 4000, unit: 'px' }),
        numericProperty(CONFIG, 'FLIGHT_TIMER_X', 'Timer right inset', { step: 5, min: 0, max: 4000, unit: 'px' }),
        numericProperty(CONFIG, 'FLIGHT_TIMER_Y', 'Timer bottom inset', { step: 5, min: 0, max: 4000, unit: 'px' }),
        heading('ENERGY DIAGRAM'),
        numericProperty(sim.energyDiagram, 'maxSamples', 'History samples', { step: 10, min: 2, max: 10000, precision: 0 }),
        numericProperty(sim.energyDiagram, 'sampleInterval', 'Sample interval', { step: 0.1, min: 0.01, max: 60, precision: 2, unit: 's' }),
        numericProperty(sim.energyDiagram, 'referenceMass', 'Reference mass', { step: 100, min: 1, max: 1000000, unit: 'kg' }),
        numericProperty(sim.energyDiagram, 'g', 'Diagram gravity', { step: 0.01, min: 0, max: 100, precision: 2, unit: 'm/s2' }),
        numericProperty(sim.energyDiagram, 'height', 'Diagram height', { step: 10, min: 20, max: 2000, unit: 'px' }),
        numericProperty(sim.energyDiagram.margin, 'top', 'Diagram top margin', { step: 5, min: 0, max: 500, unit: 'px' }),
        numericProperty(sim.energyDiagram.margin, 'right', 'Diagram right margin', { step: 5, min: 0, max: 1000, unit: 'px' }),
        numericProperty(sim.energyDiagram.margin, 'bottom', 'Diagram bottom margin', { step: 5, min: 0, max: 500, unit: 'px' }),
        numericProperty(sim.energyDiagram.margin, 'left', 'Diagram left margin', { step: 5, min: 0, max: 1000, unit: 'px' })
      ]
    });

    const vorOptions = ['NONE', ...(features.vors ?? []).map(vor => vor.id)];
    const airportOptions = ['NONE', ...(features.airports ?? []).map(airport => airport.id)];
    categories.push({
      id: 'navigation',
      label: 'NAVIGATION',
      description: 'Active radio course and direct-to airport selection.',
      items: [
        heading('VOR RECEIVER'),
        enumItem('Tuned VOR', () => sim.vorNav?.selectedVOR?.id ?? 'NONE', value => {
          if (!sim.vorNav) return;
          sim.vorNav.selectedVOR = value === 'NONE'
            ? null
            : features.vors.find(vor => vor.id === value) ?? null;
        }, vorOptions),
        numberItem('OBS course', () => sim.vorNav?.obs ?? 0,
          value => sim.vorNav?.setOBS(value),
          { step: 1, min: 0, max: 359, unit: 'deg' }),
        heading('AIRPORT DIRECT-TO'),
        enumItem('Selected airport', () => sim.airportNav?.selectedAirport?.id ?? 'NONE', value => {
          if (!sim.airportNav) return;
          if (value === 'NONE') sim.airportNav.clearSelection();
          else sim.airportNav.selectAirport(value);
        }, airportOptions),
        heading('DATASET'),
        readonlyItem('Airport count', () => features.airports?.length ?? 0),
        readonlyItem('VOR count', () => features.vors?.length ?? 0),
        readonlyItem('Obstacle count', () => features.obstacles?.length ?? 0),
        actionItem('ADD AIRPORT', () => {
          const index = (features.airports?.length ?? 0) + 1;
          features.airports.push({
            id: `NEW${index}`,
            name: `New Airport ${index}`,
            lat: state.position.lat + 0.05,
            lon: state.position.lon + 0.05,
            elevation: Math.round(state.position.altitude),
            runways: [{
              id: '18/36', heading: 180, length: 3000, width: 75,
              surfaceType: 'asphalt',
              trafficPattern: { side: 'left', altitude: 1000, distance: 0.8 }
            }]
          });
          this.setStatus('AIRPORT ADDED — OPEN ITS NEW CATEGORY TO EDIT');
        }),
        actionItem('ADD VOR', () => {
          const index = (features.vors?.length ?? 0) + 1;
          features.vors.push({ id: `NV${index}`, name: `New VOR ${index}`, lat: state.position.lat, lon: state.position.lon, frequency: '113.0' });
          this.setStatus('VOR ADDED');
        }),
        actionItem('ADD OBSTACLE', () => {
          features.obstacles.push({ lat: state.position.lat, lon: state.position.lon, elevation: Math.round(state.position.altitude), agl: 500, type: 'tower' });
          this.setStatus('OBSTACLE ADDED');
        })
      ]
    });

    (features.airports ?? []).forEach(airport => {
      const items = [
        heading('AIRPORT'),
        textItem('Identifier', () => airport.id, value => { airport.id = value.toUpperCase(); }),
        textItem('Name', () => airport.name, value => { airport.name = value; }),
        numericProperty(airport, 'lat', 'Latitude', { step: 0.001, min: -90, max: 90, precision: 5, unit: 'deg' }),
        numericProperty(airport, 'lon', 'Longitude', { step: 0.001, min: -180, max: 180, precision: 5, unit: 'deg' }),
        numericProperty(airport, 'elevation', 'Field elevation', { step: 10, min: -1500, max: 30000, unit: 'ft' })
      ];

      (airport.runways ?? []).forEach((runway, index) => {
        runway.trafficPattern ??= { side: 'left', altitude: 1000, distance: 0.8 };
        items.push(
          heading(`RUNWAY ${index + 1}`),
          textItem('Runway identifier', () => runway.id, value => { runway.id = value; }),
          numericProperty(runway, 'heading', 'Runway heading', { step: 1, min: 0, max: 359, unit: 'deg' }),
          numericProperty(runway, 'length', 'Runway length', { step: 100, min: 0, max: 50000, unit: 'ft' }),
          numericProperty(runway, 'width', 'Runway width', { step: 5, min: 0, max: 1000, unit: 'ft' }),
          enumItem('Surface', () => runway.surfaceType,
            value => { runway.surfaceType = value; }, ['asphalt', 'concrete', 'grass', 'gravel', 'dirt', 'water']),
          enumItem('Traffic pattern side', () => runway.trafficPattern.side,
            value => { runway.trafficPattern.side = value; }, ['left', 'right']),
          numericProperty(runway.trafficPattern, 'altitude', 'Pattern altitude', { step: 100, min: 0, max: 10000, unit: 'ft AGL' }),
          numericProperty(runway.trafficPattern, 'distance', 'Pattern distance', { step: 0.1, min: 0.1, max: 20, precision: 1, unit: 'NM' })
        );
      });

      items.push(actionItem('ADD RUNWAY', () => {
        airport.runways ??= [];
        airport.runways.push({
          id: '18/36', heading: 180, length: 3000, width: 75,
          surfaceType: 'asphalt',
          trafficPattern: { side: 'left', altitude: 1000, distance: 0.8 }
        });
        this.setStatus(`RUNWAY ADDED TO ${airport.id}`);
      }));

      categories.push({
        id: `airport-${airport.id}`,
        label: `APT ${airport.id}`,
        description: `${airport.name}: location, elevation, runways and traffic patterns.`,
        items
      });
    });

    const vorItems = [];
    (features.vors ?? []).forEach((vor, index) => {
      vorItems.push(
        heading(`VOR ${index + 1} / ${vor.id}`),
        textItem('Identifier', () => vor.id, value => { vor.id = value.toUpperCase(); }),
        textItem('Name', () => vor.name, value => { vor.name = value; }),
        numericProperty(vor, 'lat', 'Latitude', { step: 0.001, min: -90, max: 90, precision: 5, unit: 'deg' }),
        numericProperty(vor, 'lon', 'Longitude', { step: 0.001, min: -180, max: 180, precision: 5, unit: 'deg' }),
        textItem('Frequency', () => vor.frequency, value => { vor.frequency = value; })
      );
    });
    categories.push({
      id: 'vors',
      label: 'VOR DATA',
      description: 'Every VOR beacon identifier, frequency and chart position.',
      items: vorItems.length ? vorItems : [readonlyItem('No VOR stations loaded', () => '')]
    });

    const obstacleItems = [];
    (features.obstacles ?? []).forEach((obstacle, index) => {
      obstacleItems.push(
        heading(`OBSTACLE ${index + 1}`),
        enumItem('Type', () => obstacle.type, value => { obstacle.type = value; }, ['tower', 'mast', 'chimney', 'building', 'terrain']),
        numericProperty(obstacle, 'lat', 'Latitude', { step: 0.001, min: -90, max: 90, precision: 5, unit: 'deg' }),
        numericProperty(obstacle, 'lon', 'Longitude', { step: 0.001, min: -180, max: 180, precision: 5, unit: 'deg' }),
        numericProperty(obstacle, 'elevation', 'Elevation MSL', { step: 10, min: -1500, max: 100000, unit: 'ft' }),
        numericProperty(obstacle, 'agl', 'Height AGL', { step: 10, min: 0, max: 50000, unit: 'ft' })
      );
    });
    categories.push({
      id: 'obstacles',
      label: 'OBSTACLES',
      description: 'Every obstacle type, chart position and elevation.',
      items: obstacleItems.length ? obstacleItems : [readonlyItem('No obstacles loaded', () => '')]
    });

    return categories;
  }

  getSelected() {
    const categories = this.getCategories();
    const category = categories[this.categoryIndex];
    return { categories, category, item: category?.items[this.rowIndex] };
  }

  ensureSelection() {
    const categories = this.getCategories();
    this.categoryIndex = clamp(this.categoryIndex, 0, Math.max(0, categories.length - 1));
    const items = categories[this.categoryIndex]?.items ?? [];
    this.rowIndex = clamp(this.rowIndex, 0, Math.max(0, items.length - 1));
    if (items[this.rowIndex]?.selectable === false) {
      const next = items.findIndex(item => item.selectable !== false);
      this.rowIndex = next < 0 ? 0 : next;
    }
  }

  moveRow(direction, amount = 1) {
    const { category } = this.getSelected();
    if (!category?.items.length) return;
    let index = this.rowIndex;
    for (let count = 0; count < amount; count++) {
      do {
        index = wrap(index + direction, category.items.length);
      } while (category.items[index]?.selectable === false && index !== this.rowIndex);
    }
    this.rowIndex = index;
  }

  moveCategory(direction) {
    const categories = this.getCategories();
    this.categoryIndex = wrap(this.categoryIndex + direction, categories.length);
    this.rowIndex = 0;
    this.rowScroll = 0;
    this.ensureSelection();
    this.displayRowY = null;
  }

  changeValue(direction, multiplier = 1) {
    const { item } = this.getSelected();
    if (!item || item.type === 'readonly' || item.type === 'heading' || item.type === 'text' || item.type === 'action') return;

    if (item.type === 'number') {
      const current = Number(item.get());
      const next = clamp(current + direction * item.step * multiplier, item.min, item.max);
      item.set(Number(next.toPrecision(12)));
    } else if (item.type === 'enum') {
      const currentIndex = Math.max(0, item.options.indexOf(item.get()));
      item.set(item.options[wrap(currentIndex + direction, item.options.length)]);
    } else if (item.type === 'boolean') {
      item.set(!item.get());
    }
    this.refreshDiagnostics();
    this.setStatus('VALUE UPDATED');
  }

  beginEdit(item) {
    if (item.type !== 'number' && item.type !== 'text') return;
    this.editing = {
      type: item.type,
      buffer: item.type === 'number' ? '' : String(item.get()),
      original: item.get()
    };
  }

  commitEdit() {
    const { item } = this.getSelected();
    if (!this.editing || !item) return;
    if (this.editing.type === 'number') {
      const parsed = Number(this.editing.buffer);
      if (!Number.isFinite(parsed)) {
        this.setStatus('INVALID NUMBER — VALUE NOT CHANGED');
        this.editing = null;
        return;
      }
      item.set(clamp(parsed, item.min, item.max));
    } else {
      item.set(this.editing.buffer);
    }
    this.refreshDiagnostics();
    this.editing = null;
    this.setStatus('VALUE UPDATED');
  }

  activateSelected() {
    const { item } = this.getSelected();
    if (!item) return;
    if (item.type === 'action') {
      try {
        item.run();
        this.refreshDiagnostics();
        if (this.statusUntil < performance.now()) this.setStatus('ACTION COMPLETE');
      } catch (error) {
        this.setStatus(`ACTION FAILED: ${error.message}`);
      }
    } else if (item.type === 'boolean' || item.type === 'enum') {
      this.changeValue(1);
    } else {
      this.beginEdit(item);
    }
  }

  handleKey(event) {
    const key = event.key;
    if (this.editing) {
      if (key === 'Enter') this.commitEdit();
      else if (key === 'Escape') this.editing = null;
      else if (key === 'Backspace') this.editing.buffer = this.editing.buffer.slice(0, -1);
      else if (key.length === 1) {
        const allowed = this.editing.type === 'number' ? /[0-9eE+\-.]/ : /[\x20-\x7E]/;
        if (allowed.test(key)) this.editing.buffer += key;
      }
      return;
    }

    if (key === 'Escape' || key === 'c' || key === 'C') this.close();
    else if (key === 'ArrowUp') this.moveRow(-1);
    else if (key === 'ArrowDown') this.moveRow(1);
    else if (key === 'PageUp') this.moveRow(-1, 8);
    else if (key === 'PageDown') this.moveRow(1, 8);
    else if (key === 'Home') {
      this.rowIndex = 0;
      this.ensureSelection();
    } else if (key === 'End') {
      const { category } = this.getSelected();
      this.rowIndex = Math.max(0, category.items.length - 1);
      while (category.items[this.rowIndex]?.selectable === false && this.rowIndex > 0) this.rowIndex--;
    } else if (key === 'ArrowLeft') this.moveCategory(-1);
    else if (key === 'ArrowRight' || key === 'Tab') this.moveCategory(event.shiftKey ? -1 : 1);
    else if (key === '+' || key === '=') this.changeValue(1, event.altKey ? 10 : 1);
    else if (key === '-' || key === '_') this.changeValue(-1, event.altKey ? 10 : 1);
    else if (key === 'Enter') this.activateSelected();
  }

  formatValue(item) {
    if (item.type === 'action') return '[ ENTER ]';
    if (item.type === 'boolean') return item.get() ? 'ON' : 'OFF';
    if (item.type === 'enum' || item.type === 'text') return String(item.get());
    const value = Number(item.get());
    const formatted = Number.isFinite(value)
      ? value.toLocaleString('en-US', {
        minimumFractionDigits: item.precision ?? 0,
        maximumFractionDigits: item.precision ?? 2,
        useGrouping: false
      })
      : 'N/A';
    return item.unit ? `${formatted} ${item.unit}` : formatted;
  }

  getState() {
    if (!this.isOpen) return { open: false };
    const { category, item, categories } = this.getSelected();
    return {
      open: true,
      category: category?.label ?? null,
      categoryIndex: this.categoryIndex,
      categoryCount: categories.length,
      selectedRow: item?.label ?? null,
      selectedValue: this.editing ? `${this.editing.buffer}_` : item ? this.formatValue(item) : null,
      editing: Boolean(this.editing),
      controls: 'up/down row; left/right category; +/- value; enter edit/action; escape close'
    };
  }

  draw(ctx, canvas) {
    if (!this.isOpen) return;
    const { categories, category, item: selectedItem } = this.getSelected();
    if (!category) return;

    const width = canvas.width;
    const height = canvas.height;
    const fontSize = width < 760 ? 10 : 12;
    const lineHeight = width < 760 ? 18 : 22;
    const fontFamily = '"Courier New", Courier, monospace';

    ctx.save();
    ctx.font = `400 ${fontSize}px ${fontFamily}`;
    const charWidth = ctx.measureText('M').width;
    const totalColumns = Math.max(44, Math.floor((width - 32) / charWidth));
    const groupColumns = clamp(Math.floor(totalColumns * 0.25), 21, 32);
    const contentColumns = totalColumns - groupColumns - 3;
    const totalRows = Math.max(18, Math.floor((height - 18) / lineHeight));
    const listStartRow = 6;
    const footerSeparatorRow = totalRows - 4;
    const visibleRows = Math.max(3, footerSeparatorRow - listStartRow);
    const left = Math.round((width - totalColumns * charWidth) / 2);
    const top = Math.round((height - totalRows * lineHeight) / 2);

    // The settings terminal is part of the chart surface, so it follows the
    // live palette and repaints immediately when Map theme changes.
    const palette = this.simulator.chart.palette;
    const colors = {
      background: palette.background,
      text: palette.foreground,
      bright: palette.heading,
      dim: palette.muted,
      faint: palette.gridLabel,
      accent: palette.accent,
      danger: palette.danger
    };

    const ascii = value => String(value)
      .replace(/[—–]/g, '-')
      .replace(/±/g, '+/-')
      .replace(/×/g, 'x')
      .replace(/[↑↓]/g, match => match === '↑' ? 'UP' : 'DN')
      .replace(/[←→]/g, match => match === '←' ? 'LT' : 'RT')
      .replace(/[^ -~]/g, '?');
    const fit = (value, columns) => {
      const text = ascii(value);
      if (text.length <= columns) return text;
      return columns <= 3 ? text.slice(0, columns) : `${text.slice(0, columns - 3)}...`;
    };
    const pad = (value, columns) => fit(value, columns).padEnd(columns, ' ');
    const drawAt = (row, column, value, color = colors.text, bold = false, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.font = `${bold ? 700 : 400} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(fit(value, totalColumns - column), left + column * charWidth, top + (row + 0.78) * lineHeight);
    };
    const fullBorder = (label = '') => {
      const prefix = label ? `+-- ${ascii(label)} ` : '+';
      return `${prefix}${'-'.repeat(Math.max(0, totalColumns - prefix.length - 1))}+`;
    };
    const splitBorder = () => `+${'-'.repeat(groupColumns)}+${'-'.repeat(contentColumns)}+`;
    const splitRow = (groupText = '', contentText = '') =>
      `|${pad(groupText, groupColumns)}|${pad(contentText, contentColumns)}|`;
    const terminalRow = (value = '') => `|${pad(value, totalColumns - 2)}|`;

    if (this.rowIndex < this.rowScroll) this.rowScroll = this.rowIndex;
    if (this.rowIndex >= this.rowScroll + visibleRows) this.rowScroll = this.rowIndex - visibleRows + 1;
    this.rowScroll = clamp(this.rowScroll, 0, Math.max(0, category.items.length - visibleRows));

    const visibleCategories = visibleRows;
    if (this.categoryIndex < this.categoryScroll) this.categoryScroll = this.categoryIndex;
    if (this.categoryIndex >= this.categoryScroll + visibleCategories) {
      this.categoryScroll = this.categoryIndex - visibleCategories + 1;
    }

    const entrance = clamp((performance.now() - this.openedAt) / 150, 0, 1);
    ctx.globalAlpha = entrance;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Terminal frame and fixed chrome are rendered as literal ASCII characters.
    drawAt(0, 0, fullBorder('C172 SYSTEMS LAB / FLIGHT MODEL CONFIGURATION'), colors.accent, true, entrance);
    drawAt(1, 0, terminalRow(
      `CONFIG BUS: ONLINE  |  EDIT: LIVE  |  SIM: PAUSED  |  GROUP ${String(this.categoryIndex + 1).padStart(2, '0')}/${String(categories.length).padStart(2, '0')}`
    ), colors.bright, false, entrance);
    drawAt(2, 0, splitBorder(), colors.dim, false, entrance);
    drawAt(3, 0, splitRow('PARAMETER GROUPS', `${category.label}  [ROW ${this.rowIndex + 1}/${category.items.length}]`), colors.bright, true, entrance);
    drawAt(4, 0, splitRow(
      `SHOWING ${this.categoryScroll + 1}-${Math.min(categories.length, this.categoryScroll + visibleCategories)}`,
      category.description
    ), colors.dim, false, entrance);
    drawAt(5, 0, splitBorder(), colors.dim, false, entrance);

    for (let visibleIndex = 0; visibleIndex < visibleRows; visibleIndex++) {
      drawAt(listStartRow + visibleIndex, 0, splitRow('', ''), colors.faint, false, entrance);
    }

    categories.slice(this.categoryScroll, this.categoryScroll + visibleCategories).forEach((entry, visibleIndex) => {
      const actualIndex = this.categoryScroll + visibleIndex;
      const selected = actualIndex === this.categoryIndex;
      const label = `${selected ? '>' : ' '}[${String(actualIndex + 1).padStart(2, '0')}] ${entry.label}`;
      drawAt(listStartRow + visibleIndex, 1, pad(label, groupColumns),
        selected ? colors.accent : colors.text, selected, entrance);
    });

    const targetRowY = top + (listStartRow + this.rowIndex - this.rowScroll + 0.78) * lineHeight;
    if (this.displayRowY === null) this.displayRowY = targetRowY;
    this.displayRowY += (targetRowY - this.displayRowY) * 0.42;

    category.items.slice(this.rowScroll, this.rowScroll + visibleRows).forEach((entry, visibleIndex) => {
      const actualIndex = this.rowScroll + visibleIndex;
      const terminalRowIndex = listStartRow + visibleIndex;

      if (entry.type === 'heading') {
        const headingLabel = `--[ ${ascii(entry.label)} ]`;
        const rule = `${headingLabel}${'-'.repeat(Math.max(0, contentColumns - headingLabel.length - 1))}`;
        drawAt(terminalRowIndex, groupColumns + 2, rule, colors.dim, true, entrance);
        return;
      }

      const selected = actualIndex === this.rowIndex;
      const value = ascii(selected && this.editing ? `${this.editing.buffer}_` : this.formatValue(entry));
      const valueToken = entry.type === 'action' ? value : `[${value}]`;
      const label = ascii(entry.label);
      const availableDots = Math.max(1, contentColumns - label.length - valueToken.length - 6);
      const line = `  ${label} ${'.'.repeat(availableDots)} ${valueToken}`;
      const color = selected
        ? colors.accent
        : entry.type === 'readonly' ? colors.dim : colors.text;
      const pulse = selected && this.statusUntil > performance.now()
        ? 0.82 + Math.sin(performance.now() / 80) * 0.18
        : 1;
      drawAt(terminalRowIndex, groupColumns + 2, pad(line, contentColumns), color, selected, entrance * pulse);
    });

    // The selection cursor keeps its short easing motion while remaining a literal ASCII glyph.
    ctx.globalAlpha = entrance;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = colors.accent;
    ctx.fillText('>', left + (groupColumns + 2) * charWidth, this.displayRowY);

    const status = this.statusUntil > performance.now()
      ? this.status
      : selectedItem?.description || 'LIVE VALUES — CHANGES APPLY IMMEDIATELY';
    const statusColor = /FAILED|INVALID|ERROR/.test(status) ? colors.danger : colors.accent;
    const legend = width < 840
      ? '[UP/DN] ROW [LT/RT] GROUP [+/-] CHANGE [ENTER] EDIT [ESC] CLOSE'
      : '[UP/DN] ROW  [LT/RT] GROUP  [+/-] CHANGE  [ALT +/-] x10  [ENTER] EDIT/RUN  [ESC/C] CLOSE';
    drawAt(footerSeparatorRow, 0, splitBorder(), colors.dim, false, entrance);
    drawAt(footerSeparatorRow + 1, 0, terminalRow(`STATUS> ${ascii(status)}`), statusColor, true, entrance);
    drawAt(footerSeparatorRow + 2, 0, terminalRow(`KEYS>   ${legend}`), colors.text, false, entrance);
    drawAt(footerSeparatorRow + 3, 0, fullBorder(), colors.dim, false, entrance);

    ctx.restore();
  }
}
