import { calculateFlightMetrics } from './flight-metrics.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Stable, renderer-neutral interface to one running simulation.
 *
 * The legacy browser host still constructs the individual systems, but clients,
 * tests and MCP can now consume one command/state boundary instead of reaching
 * into Canvas rendering code.
 */
export class SimulationSession {
  constructor(simulator) {
    this.simulator = simulator;
  }

  stepFixed() {
    const sim = this.simulator;
    const substepDt = sim.dt / sim.physicsSubsteps;

    for (let i = 0; i < sim.physicsSubsteps; i++) {
      if (typeof sim.wind.updateDynamic === 'function') {
        sim.wind.updateDynamic(substepDt);
      }
      sim.flightController.update(substepDt);
      sim.lastForces = sim.physics.update(substepDt);
      sim.groundState = sim.physics.lastGroundState ?? sim.groundState;
      sim.envelopeState = sim.envelope.update(
        substepDt,
        sim.state,
        sim.controls,
        sim.lastForces,
        sim.groundState
      );
      sim.handleGroundEvent(sim.groundState?.event);
    }

    sim.energyDiagram.update(sim.state, sim.dt);
    sim.flightTime += sim.dt;
    sim.instructorMonitor?.update(sim, sim.flightTime);
    sim.flightRecorder.update(sim.flightTime, () => sim.createRecorderSample());
    sim.updateMapZoom(sim.dt);
    sim.chart.setCenter(sim.state.position.lat, sim.state.position.lon);
    sim.debugInterval += sim.dt;
    if (sim.debugMode && sim.debugInterval >= sim.config.DEBUG_OUTPUT_INTERVAL / 1000) {
      sim.debugInterval = 0;
      console.log('FLIGHT DEBUG', sim.createRecorderSample());
    }
  }

  advance(seconds, options = {}) {
    const milliseconds = Math.max(0, Number(seconds) || 0) * 1000;
    this.simulator.advanceSimulation(milliseconds, options);
    return this.getFrame();
  }

  command(command = {}) {
    const sim = this.simulator;
    switch (command.type) {
      case 'set_controls': {
        for (const key of ['elevator', 'aileron', 'rudder']) {
          if (Number.isFinite(command[key])) sim.controls[key] = clamp(command[key], -1, 1);
        }
        for (const key of ['throttle', 'brake', 'flaps']) {
          if (Number.isFinite(command[key])) sim.controls[key] = clamp(command[key], 0, 1);
        }
        break;
      }
      case 'pause': sim.paused = true; break;
      case 'resume': sim.paused = false; break;
      case 'toggle_pause': sim.paused = !sim.paused; break;
      case 'reset': sim.resetConfiguredFlight(); break;
      case 'set_client': sim.clients.select(command.client); break;
      case 'set_3d_style': sim.clients.setStyle(command.style); break;
      case 'set_3d_camera': sim.clients.setCamera(command.camera); break;
      default: throw new Error(`Unknown simulation command: ${command.type ?? '(missing)'}`);
    }
    sim.render();
    return this.getFrame();
  }

  getFrame() {
    const sim = this.simulator;
    return {
      time: sim.flightTime,
      paused: sim.paused,
      worldReady: sim.worldReady,
      position: { ...sim.state.position },
      orientation: { ...sim.state.orientation },
      angularVelocity: { ...sim.state.angularVelocity },
      velocity: { ...sim.state.velocity },
      indicatedAirspeedKt: sim.state.getIAS(),
      verticalSpeedFpm: sim.state.getClimbRate(),
      controls: {
        elevator: sim.controls.elevator,
        aileron: sim.controls.aileron,
        rudder: sim.controls.rudder,
        throttle: sim.controls.throttle,
        brake: sim.controls.brake,
        flaps: sim.controls.flaps,
        trim: sim.input.elevatorTrim,
        trimMin: sim.input.trimMin,
        trimMax: sim.input.trimMax
      },
      wind: {
        directionFromDeg: sim.wind.direction,
        speedKt: sim.wind.speed,
        north: sim.wind.windNorth,
        east: sim.wind.windEast,
        down: sim.wind.windDown
      },
      forces: sim.lastForces,
      ground: sim.groundState,
      envelope: sim.envelopeState,
      navigation: calculateFlightMetrics(sim),
      features: sim.chartFeatures
    };
  }

  getState() {
    return JSON.parse(this.simulator.renderGameToText());
  }

  serialize() {
    return this.simulator.persistence.capture(this.simulator);
  }
}
