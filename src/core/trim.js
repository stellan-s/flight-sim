import {
  calculateTrueAirspeedForIAS,
  getAirDensity
} from './forces.js';
import {
  AIR_DENSITY_SEA_LEVEL,
  DEG_TO_RAD,
  GRAVITY
} from '../utils/constants.js';

export function calculateLevelFlightTrim(
  specs,
  altitudeFt,
  indicatedAirspeedKt,
  controls = {}
) {
  const trueAirspeed = calculateTrueAirspeedForIAS(
    indicatedAirspeedKt,
    altitudeFt
  );
  const density = getAirDensity(altitudeFt);
  const dynamicPressure = 0.5 * density * trueAirspeed ** 2;
  const pressureArea = dynamicPressure * specs.wingArea;
  const gravityMultiplier = specs.gravityMultiplier ?? 1;
  const liftMultiplier = specs.liftMultiplier ?? 1;
  const dragMultiplier = specs.dragMultiplier ?? 1;
  const thrustMultiplier = specs.thrustMultiplier ?? 1;
  const flaps = Math.max(0, Math.min(1, controls.flaps ?? 0));
  const flapCl = flaps * (specs.flapClIncrement ?? 0);
  const flapCd = flaps * flaps * (specs.flapCdIncrement ?? 0);
  const weight = specs.mass * GRAVITY * gravityMultiplier;

  let alpha = (weight / (pressureArea * liftMultiplier) - specs.Cl0 - flapCl) /
    specs.Cl_alpha;
  for (let iteration = 0; iteration < 12; iteration++) {
    const Cl = specs.Cl0 + specs.Cl_alpha * alpha + flapCl;
    const Cd = specs.Cd0 + specs.K * Cl ** 2 + flapCd;
    const tanAlpha = Math.tan(alpha);
    const residual = pressureArea * (
      liftMultiplier * Cl + dragMultiplier * Cd * tanAlpha
    ) - weight;
    const dCdDAlpha = 2 * specs.K * Cl * specs.Cl_alpha;
    const derivative = pressureArea * (
      liftMultiplier * specs.Cl_alpha +
      dragMultiplier * dCdDAlpha * tanAlpha +
      dragMultiplier * Cd / Math.cos(alpha) ** 2
    );
    alpha -= residual / derivative;
  }

  const Cl = specs.Cl0 + specs.Cl_alpha * alpha + flapCl;
  const maximumCl = specs.Cl_max + flapCl;
  if (Cl > maximumCl || alpha >= specs.stallAlpha) {
    throw new Error('Configured initial speed is below the level-flight trim envelope');
  }

  const Cd = specs.Cd0 + specs.K * Cl ** 2 + flapCd;
  const lift = pressureArea * Cl * liftMultiplier;
  const drag = pressureArea * Cd * dragMultiplier;
  const thrust = drag / Math.cos(alpha);
  const elevatorRadians = -(
    specs.Cm0 + specs.Cm_alpha * alpha +
    (specs.flapCmIncrement ?? 0) * flaps
  ) / specs.Cm_de;
  const maxElevatorDeflection = (specs.elevatorMaxDeg ?? 25) * DEG_TO_RAD;
  const elevator = elevatorRadians / maxElevatorDeflection;

  const powerFactor = Math.pow(
    density / AIR_DENSITY_SEA_LEVEL,
    specs.powerLapseRate
  );
  const availableThrust = specs.maxThrust * powerFactor * thrustMultiplier;
  const throttle = thrust / availableThrust;

  if (Math.abs(elevator) > 1 || throttle < 0 || throttle > 1) {
    throw new Error('Configured initial condition exceeds the control trim envelope');
  }

  return {
    alpha,
    pitch: alpha,
    trueAirspeed,
    velocity: {
      u: trueAirspeed * Math.cos(alpha),
      v: 0,
      w: trueAirspeed * Math.sin(alpha)
    },
    elevator,
    throttle,
    lift,
    drag,
    thrust,
    weight
  };
}
