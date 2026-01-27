/**
 * Filename: constants.js
 * Purpose: Physical constants and conversion factors
 *
 * All constants used throughout the simulator are centralized here
 * for easy reference and modification.
 */

// Physics constants
export const GRAVITY = 9.80665; // m/s² - Standard gravity at sea level
export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³ - ISA standard
export const SPEED_OF_SOUND = 340.3; // m/s at sea level, 15°C

// Conversion factors
export const FEET_TO_METERS = 0.3048;
export const METERS_TO_FEET = 1 / 0.3048;
export const KNOTS_TO_MS = 0.514444;
export const MS_TO_KNOTS = 1 / 0.514444;
export const METERS_PER_DEGREE = 111320; // Approximate meters per degree latitude/longitude
export const NM_PER_DEGREE = 60; // Nautical miles per degree

// Angular conversions
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
