/**
 * Filename: logger.js
 * Purpose: Centralized logging utility with enable/disable toggle
 *
 * Usage:
 * - Create a logger instance with DEBUG_MODE from config
 * - Use logger.log() instead of console.log()
 * - Toggle at runtime with logger.setEnabled(true/false)
 */

export class Logger {
  constructor(enabled = false) {
    this.enabled = enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  log(...args) {
    if (this.enabled) {
      console.log(...args);
    }
  }

  warn(...args) {
    if (this.enabled) {
      console.warn(...args);
    }
  }

  error(...args) {
    // Always log errors
    console.error(...args);
  }
}
