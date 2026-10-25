// Input handling for flight controls

import { CONFIG } from '../config.js';

export class InputHandler {
  constructor(controls, chartRenderer, vorNavigation = null, simulator = null, vectorRenderer = null) {
    this.controls = controls;
    this.chart = chartRenderer;
    this.vorNav = vorNavigation;
    this.simulator = simulator;
    this.vectors = vectorRenderer;
    this.keys = {};

    // Mouse position for crosshair
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseInCanvas = false;

    // Control sensitivity (reduced for stable handling)
    this.pitchRate = 0.25;     // units per second
    this.rollRate = 0.5;       // units per second
    this.rudderRate = 0.4;     // units per second
    this.throttleRate = 0.3;   // per second
    this.trimRate = 0.05;      // trim units per second
    this.elevatorReturnRate = 1.5;
    this.elevatorAirborneReturnRate = 4.0;
    this.aileronReturnRate = 4.0;
    this.rudderReturnRate = 4.0;
    this.trimMin = -0.3;
    this.trimMax = 0.3;

    // Trim settings
    this.elevatorTrim = 0;     // -1 to +1

    this.setupKeyboard();
    this.setupMouse();
  }

  setSimulator(simulator) {
    this.simulator = simulator;
  }

  setVORNavigation(vorNav) {
    this.vorNav = vorNav;
  }

  setVectors(vectors) {
    this.vectors = vectors;
  }

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.simulator?.configPanel?.isOpen) {
        e.preventDefault();
        this.keys = {};
        this.simulator.configPanel.handleKey(e);
        return;
      }

      if (this.simulator?.configPanel &&
          (e.key === 'c' || e.key === 'C' || e.key === 'Enter')) {
        e.preventDefault();
        this.keys = {};
        this.simulator.configPanel.open();
        return;
      }

      this.keys[e.key] = true;
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }

  setupMouse() {
    const canvas = this.chart.canvas;

    // Track mouse position for crosshair
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.mouseInCanvas = true;
    });

    canvas.addEventListener('mouseenter', () => {
      this.mouseInCanvas = true;
    });

    canvas.addEventListener('mouseleave', () => {
      this.mouseInCanvas = false;
    });

    // Mouse wheel for zoom (or help scrolling)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      if (this.simulator?.configPanel?.isOpen) {
        this.simulator.configPanel.moveRow(e.deltaY > 0 ? 1 : -1);
        return;
      }

      // If help is visible, scroll the help instead of zooming
      if (this.simulator && this.simulator.showHelp) {
        const scrollAmount = e.deltaY * 0.5; // Adjust scroll sensitivity
        this.simulator.helpScrollOffset += scrollAmount;

        // Clamp scroll to valid range (will be refined in draw function)
        this.simulator.helpScrollOffset = Math.max(0, this.simulator.helpScrollOffset);
      } else {
        // Normal zoom behavior
        const delta = e.deltaY > 0
          ? 1 / CONFIG.ZOOM_SPEED
          : CONFIG.ZOOM_SPEED;
        this.chart.setZoom(this.chart.zoom * delta);
      }
    });

    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });

    // Right-click to select VOR
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 && this.vorNav) { // Right mouse button
        e.preventDefault();
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { lat, lon } = this.chart.pixelsToLatLon(x, y);

        if (this.vorNav.selectVORByPosition(lat, lon)) {
          console.log('✓ VOR tuned at', lat.toFixed(4), lon.toFixed(4));
        } else {
          console.log('✗ No VOR found at', lat.toFixed(4), lon.toFixed(4));
        }

        return false;
      }
    });

    // Also support Ctrl+Click for VOR selection
    canvas.addEventListener('click', (e) => {
      if ((e.ctrlKey || e.metaKey) && this.vorNav) {
        e.preventDefault();
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { lat, lon } = this.chart.pixelsToLatLon(x, y);

        if (this.vorNav.selectVORByPosition(lat, lon)) {
          console.log('✓ VOR tuned at', lat.toFixed(4), lon.toFixed(4));
        } else {
          console.log('✗ No VOR found at', lat.toFixed(4), lon.toFixed(4));
        }
      }
    });
  }

  update(dt) {
    // Check pause/help keys first (these work even when paused)
    this.checkSystemKeys();

    // Skip flight control updates if paused
    if (this.simulator && this.simulator.paused) {
      return;
    }

    // Elevator trim (PageUp/PageDown)
    if (this.keys['PageUp']) {
      // Trim nose down (negative)
      this.elevatorTrim = Math.max(this.trimMin, this.elevatorTrim - this.trimRate * dt);
    } else if (this.keys['PageDown']) {
      // Trim nose up (positive)
      this.elevatorTrim = Math.min(this.trimMax, this.elevatorTrim + this.trimRate * dt);
    }

    // Pitch control (Arrow Up/Down - INVERTED Y-AXIS)
    // Returns to trim position when released
    if (this.keys['ArrowUp']) {
      // Arrow up = pitch DOWN = negative elevator
      this.controls.elevator = Math.max(-1, this.controls.elevator - this.pitchRate * dt);
    } else if (this.keys['ArrowDown']) {
      // Arrow down = pitch UP = positive elevator
      this.controls.elevator = Math.min(1, this.controls.elevator + this.pitchRate * dt);
    } else {
      // Return to trim position smoothly
      const diff = this.elevatorTrim - this.controls.elevator;
      const returnRate = this.simulator?.groundState?.contact
        ? this.elevatorReturnRate
        : this.elevatorAirborneReturnRate;
      this.controls.elevator += diff * returnRate * dt;
      if (Math.abs(diff) < 0.01) this.controls.elevator = this.elevatorTrim;
    }

    // Roll control (Arrow Left/Right)
    // Returns to neutral (no roll trim)
    if (this.keys['ArrowLeft']) {
      this.controls.aileron = Math.max(-1, this.controls.aileron - this.rollRate * dt);
    } else if (this.keys['ArrowRight']) {
      this.controls.aileron = Math.min(1, this.controls.aileron + this.rollRate * dt);
    } else {
      // Return to neutral smoothly
      this.controls.aileron -= this.controls.aileron * this.aileronReturnRate * dt;
      if (Math.abs(this.controls.aileron) < 0.01) this.controls.aileron = 0;
    }

    // Rudder (A/D)
    // Returns to neutral
    if (this.keys['a'] || this.keys['A']) {
      this.controls.rudder = Math.max(-1, this.controls.rudder - this.rudderRate * dt);
    } else if (this.keys['d'] || this.keys['D']) {
      this.controls.rudder = Math.min(1, this.controls.rudder + this.rudderRate * dt);
    } else {
      // Return to neutral smoothly
      this.controls.rudder -= this.controls.rudder * this.rudderReturnRate * dt;
      if (Math.abs(this.controls.rudder) < 0.01) this.controls.rudder = 0;
    }

    // Throttle (W/S) - stays where you set it
    if (this.keys['w'] || this.keys['W']) {
      this.controls.throttle = Math.min(1, this.controls.throttle + this.throttleRate * dt);
    } else if (this.keys['s'] || this.keys['S']) {
      this.controls.throttle = Math.max(0, this.controls.throttle - this.throttleRate * dt);
    }

    // Wheel brakes are held while B is pressed.
    this.controls.brake = this.keys['b'] || this.keys['B'] ? 1 : 0;

    // Reset trim (Home key)
    if (this.keys['Home']) {
      this.elevatorTrim = 0;
      this.keys['Home'] = false;
    }
  }

  // System keys that work even when paused
  checkSystemKeys() {
    // Pause (P or Space) - but not when help is showing (space would scroll)
    if (this.simulator && (this.keys['p'] || this.keys['P'] || (!this.simulator.showHelp && this.keys[' ']))) {
      this.simulator.paused = !this.simulator.paused;
      console.log(this.simulator.paused ? '⏸ PAUSED' : '▶ RESUMED');
      this.keys['p'] = false;
      this.keys['P'] = false;
      this.keys[' '] = false;
    }

    // Help (H or ?)
    if (this.simulator && (this.keys['h'] || this.keys['H'] || this.keys['?'])) {
      this.simulator.showHelp = !this.simulator.showHelp;
      // Reset scroll position when opening help
      if (this.simulator.showHelp) {
        this.simulator.helpScrollOffset = 0;
        this.simulator.helpOpenedAt = performance.now();
      }
      this.keys['h'] = false;
      this.keys['H'] = false;
      this.keys['?'] = false;
    }

    // Airport selection (L key - cycle through airports, Shift+L to clear)
    if (this.simulator && this.simulator.airportNav && (this.keys['l'] || this.keys['L'])) {
      if (this.keys['Shift']) {
        // Shift+L: Clear airport selection
        this.simulator.airportNav.clearSelection();
        this.keys['l'] = false;
        this.keys['L'] = false;
      } else {
        // L: Cycle to next nearest airport
        const aircraft = this.simulator.state;
        this.simulator.airportNav.cycleToNextAirport(aircraft.position.lat, aircraft.position.lon);
        this.keys['l'] = false;
        this.keys['L'] = false;
      }
    }

    // Help scrolling with keyboard (when help is open)
    if (this.simulator && this.simulator.showHelp) {
      const scrollSpeed = 30; // pixels per keypress

      if (this.keys['ArrowDown']) {
        this.simulator.helpScrollOffset += scrollSpeed;
        this.keys['ArrowDown'] = false;
      }
      if (this.keys['ArrowUp']) {
        this.simulator.helpScrollOffset = Math.max(0, this.simulator.helpScrollOffset - scrollSpeed);
        this.keys['ArrowUp'] = false;
      }
      if (this.keys['PageDown']) {
        this.simulator.helpScrollOffset += 200;
        this.keys['PageDown'] = false;
      }
      if (this.keys['PageUp']) {
        this.simulator.helpScrollOffset = Math.max(0, this.simulator.helpScrollOffset - 200);
        this.keys['PageUp'] = false;
      }
      if (this.keys['Home']) {
        this.simulator.helpScrollOffset = 0;
        this.keys['Home'] = false;
      }
      if (this.keys['End']) {
        this.simulator.helpScrollOffset = 999999; // Will be clamped in draw function
        this.keys['End'] = false;
      }
    }

    // Cycle 0/10/20/30 degree flap detents.
    if (this.keys['f'] || this.keys['F']) {
      const detents = [0, 1 / 3, 2 / 3, 1];
      const currentIndex = detents.findIndex(value =>
        Math.abs(value - (this.controls.flaps ?? 0)) < 0.05
      );
      this.controls.flaps = detents[(currentIndex + 1 + detents.length) % detents.length];
      this.keys['f'] = false;
      this.keys['F'] = false;
    }

    // Chart rotation mode (N/T keys) - works when paused
    if (this.keys['n'] || this.keys['N']) {
      this.chart.setRotationMode('north-up');
      console.log('MAP: NORTH UP - Wind arrows show true direction');
      this.keys['n'] = false;
      this.keys['N'] = false;
    } else if (this.keys['t'] || this.keys['T']) {
      this.chart.setRotationMode('track-up');
      console.log('MAP: TRACK UP - Wind arrows rotate with map');
      this.keys['t'] = false;
      this.keys['T'] = false;
    }

    // Vector display mode (V key) - works when paused
    if (this.vectors && (this.keys['v'] || this.keys['V'])) {
      this.vectors.toggleVectorMode();
      this.keys['v'] = false;
      this.keys['V'] = false;
    }

    // Zoom presets - works when paused
    if (this.keys['1']) {
      this.chart.setZoom(1.0);
      this.keys['1'] = false;
    } else if (this.keys['2']) {
      this.chart.setZoom(3.0);
      this.keys['2'] = false;
    } else if (this.keys['3']) {
      this.chart.setZoom(5.0);
      this.keys['3'] = false;
    } else if (this.keys['4']) {
      this.chart.setZoom(10.0);
      this.keys['4'] = false;
    }

    // OBS adjustment - works when paused (useful for planning)
    if (this.vorNav) {
      if (this.keys['q'] || this.keys['Q']) {
        this.vorNav.setOBS(this.vorNav.obs - 10);
        this.keys['q'] = false;
        this.keys['Q'] = false;
      } else if (this.keys['e'] || this.keys['E']) {
        this.vorNav.setOBS(this.vorNav.obs + 10);
        this.keys['e'] = false;
        this.keys['E'] = false;
      }
    }
  }

  getTrimDisplay() {
    return this.elevatorTrim;
  }

  // Draw crosshair at mouse position
  drawCrosshair() {
    if (!this.mouseInCanvas) return;

    const ctx = this.chart.ctx;
    const canvas = this.chart.canvas;

    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(this.mouseX, 0);
    ctx.lineTo(this.mouseX, canvas.height);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, this.mouseY);
    ctx.lineTo(canvas.width, this.mouseY);
    ctx.stroke();

    ctx.restore();
  }
}
