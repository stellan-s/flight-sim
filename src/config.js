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
  INITIAL_PITCH: 0,        // degrees
  INITIAL_ROLL: 0,         // degrees

  // Initial wind conditions
  INITIAL_WIND_DIRECTION: 270,  // degrees
  INITIAL_WIND_SPEED: 15,       // knots

  // Chart rendering
  BASE_SCALE: 10000,       // meters per degree at zoom=1
  DEFAULT_ZOOM: 3.0,
  MAX_ZOOM: 15.0,
  MIN_ZOOM: 0.1,
  ZOOM_SPEED: 1.1,         // Zoom multiplier per scroll

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

  // Instrument rendering
  PITCH_SCALE_PIXELS_PER_DEG: 5,  // Pixels per degree for attitude indicator
  PITCH_SCALE_RANGE: 30,          // degrees to show above/below horizon

  // Debug mode
  DEBUG_MODE: false,               // Enable/disable debug logging
  DEBUG_OUTPUT_INTERVAL: 2000,     // ms between debug outputs

  // Flight timer display
  FLIGHT_TIMER_X: 20,
  FLIGHT_TIMER_Y: 30,
};
