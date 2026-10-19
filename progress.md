Original prompt: all of them please

## Goal

Implement all seven approved simulator improvements while preserving the existing canvas layout and displaying every modeled force as a vector/arrow.

## Completed before this task

- Fixes 1–4 committed as `239d571`.
- Issue 5 track-up transformation implemented and verified; currently uncommitted.
- Twelve regression tests passing before this task began.

## Current work

- Restyled the runtime configuration console as a literal ASCII terminal UI:
  character borders, bracketed values, dotted leaders, `>` selection cursors,
  a phosphor-dark surface, and one amber interaction accent.
- Added a full-screen runtime configuration console opened with C or Enter.
- The console exposes live state, force/moment gains, every aircraft coefficient,
  integration/input tuning, wind, display/navigation settings, airports, runways,
  VORs, and obstacles through keyboard-only controls.
- Force and moment multipliers, control-surface limits, and rate/ground safety
  limits are now first-class aircraft specifications used by physics and trim.
- Existing 26-test suite still passes after the physics configuration changes.
- Final automated check passes: 31 tests plus syntax validation; Playwright
  screenshots verified Session, Forces, Live State, and airport/runway editing.
- Deterministic `render_game_to_text` and `advanceTime(ms)` hooks added.
- Web-game client verified pitch/roll input, state output, and screenshots.
- Initial screenshots confirm the existing vertical-force projection is misleading; scheduled for the force-vector pass.
- Reciprocal active-runway selection now retains the runway end, effective heading, and consistent pattern side.
- Runway selection verified with focused tests and the web-game smoke loop.
- Force rendering now includes lift, weight, thrust, drag, side force, resultant, and roll/pitch/yaw moment arrows using a non-collapsing oblique projection.
- Physics updates now return final-state moments for finite diagnostics.
- First vector screenshot showed moment-value label crowding; numeric values remain in the state panel and curved arrows now use compact L/M/N labels.
- Second vector screenshot verified all modeled linear forces and finite moments without console errors.
- Airport ETA and the ground-track arrow now use horizontal ground velocity derived from transformed airspeed plus wind.
- Level-flight trim solver added for configured altitude/IAS; it balances four linear forces and pitching moment, then initializes pitch, body velocity, elevator trim, and throttle from that solution.
- Five-second browser and 60-second engine checks hold 5,000 ft, 100 kt IAS, and 0 FPM.
- Trim screenshot exposed and prompted correction of lift/drag arrow signs to match the actual body-force equations.
- Added VOR/CDI, wind convention, coordinate round-trip, ground-speed, and RK4 convergence coverage.
- Added dependency-free npm start/test/check commands; local server remains on port 8765.
- Full automated check passes: 26 tests plus syntax validation (`npm run check`).
- Exhaustive controls verified: pause/resume, help and scrolling, both map modes,
  all vector modes, zoom presets and wheel zoom, OBS, airport selection, flight
  controls, throttle, trim, and right-click VOR tuning.
- Final screenshots inspected; browser console remained clean.
- Final automated check passes: 26 tests plus syntax validation.

## TODO

- [x] Finish browser visual QA for the ASCII configuration restyle.
- [x] Complete browser interaction and visual QA for the configuration console.
- [x] Add focused regression tests for runtime force multipliers and editor controls.
- [x] Fix reciprocal active-runway selection and approach guidance.
- [x] Complete force and moment vector rendering.
- [x] Repair missing-moment debug diagnostics.
- [x] Use wind-corrected ground speed for ETA.
- [x] Calculate a trimmed starting condition.
- [x] Expand physics/navigation tests and add npm test tooling.
- [x] Finish the web-game Playwright client and browser control pass.
