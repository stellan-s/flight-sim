/**
 * Filename: config.js
 * Purpose: Centralized configuration for the flight simulator
 *
 * All tunable parameters, initial conditions, and UI settings
 * are collected here for easy modification.
 */

export const CONFIG = {
  // Physics simulation
  PHYSICS_TIMESTEP: 1/60,  // seconds per physics step
  PHYSICS_SUBSTEPS: 1,     // RK4 substeps per frame

  // Initial aircraft state
  INITIAL_ALTITUDE: 5000,  // ft MSL
  INITIAL_SPEED: 100,      // knots IAS
  INITIAL_HEADING: 0,      // degrees
  INITIAL_PITCH_OFFSET: 0, // degrees from calculated level-flight trim
  INITIAL_ROLL: 0,         // degrees
  INITIAL_START_MODE: 'runway', // 'runway' or 'airborne'
  INITIAL_AIRPORT: 'KABC',
  INITIAL_RUNWAY_END: '18',

  // Initial wind conditions
  INITIAL_WIND_DIRECTION: 270,  // degrees
  INITIAL_WIND_SPEED: 15,       // knots

  // Ground interaction and landing evaluation
  GEAR_HEIGHT_FT: 4.1,
  GROUND_CONTACT_TOLERANCE_FT: 0.35,
  RUNWAY_ROLLING_RESISTANCE: 0.018,
  ROUGH_GROUND_ROLLING_RESISTANCE: 0.09,
  BRAKE_DECELERATION: 5.2,          // m/s2 at full brake
  LATERAL_TIRE_GRIP: 4.5,           // m/s2 cross-runway correction
  GROUND_STEER_RATE: 24,            // deg/s at full rudder
  GROUND_MAX_ROTATION_DEG: 14,
  BOUNCE_SINK_RATE_FPM: 360,
  HARD_LANDING_SINK_RATE_FPM: 480,
  CRASH_SINK_RATE_FPM: 900,
  CRASH_BANK_DEG: 32,
  CRASH_PITCH_DEG: 22,

  // Chart rendering
  BASE_SCALE: 10000,       // meters per degree at zoom=1
  DEFAULT_ZOOM: 3.0,
  GROUND_MAP_ZOOM: 6.0,
  GROUND_ZOOM_TRANSITION_RATE: 4.0,
  MAX_ZOOM: 15.0,
  MIN_ZOOM: 0.1,
  ZOOM_SPEED: 1.1,         // Zoom multiplier per scroll
  DEFAULT_MAP_THEME: 'black-white',

  // Default rotation mode: 'north-up' or 'track-up'
  DEFAULT_ROTATION_MODE: 'north-up',

  // UI panel positions (pixels from edges)
  STATE_PANEL_X: 280,      // Right side state vectors
  STATE_PANEL_Y: 60,

  // Force vector visualization
  FORCE_VECTOR_SCALE: 0.02,      // Scale for force arrows
  VELOCITY_VECTOR_SCALE: 2,      // Scale for velocity arrows

  // VOR visualization
  VOR_RADIAL_LENGTH_PIXELS: 2000,

  // Navigation audio
  MORSE_VOLUME: 0.08,            // Linear Web Audio gain (0=silent, 1=full)

  // Flight-envelope audio
  STALL_WARNING_ENABLED: true,
  STALL_WARNING_VOLUME: 0.12,    // Linear Web Audio gain (0=silent, 1=full)
  STALL_WARNING_FREQUENCY: 680,  // Hz, deliberately distinct from VOR Morse
  STALL_WARNING_PULSE_HZ: 3.2,

  // Instrument rendering
  SHOW_PITCH_INDICATOR: true,
  PITCH_SCALE_PIXELS_PER_DEG: 5,   // Pixels per degree for the viewport horizon
  PITCH_SCALE_RANGE: 30,           // Degrees shown on the viewport edge scales
  SHOW_THROTTLE_INDICATOR: true,
  THROTTLE_INDICATOR_OFFSET_X: 96, // Pixels right of screen center
  THROTTLE_INDICATOR_OFFSET_Y: 0,  // Pixels below screen center
  THROTTLE_INDICATOR_WIDTH: 14,
  THROTTLE_INDICATOR_HEIGHT: 116,

  // Debug mode
  DEBUG_MODE: false,               // Enable/disable debug logging
  DEBUG_OUTPUT_INTERVAL: 2000,     // ms between debug outputs

  // Flight timer display
  FLIGHT_TIMER_X: 20,
  FLIGHT_TIMER_Y: 30,
};
