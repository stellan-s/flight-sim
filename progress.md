Original prompt: all of them please

## Goal

Implement all seven approved simulator improvements while preserving the existing canvas layout and displaying every modeled force as a vector/arrow.

## Completed before this task

- Fixes 1–4 committed as `239d571`.
- Issue 5 track-up transformation implemented and verified; currently uncommitted.
- Twelve regression tests passing before this task began.

## Current work

- Lowered the 1020 Hz VOR Morse identifier peak gain from 0.30 to 0.08
  (approximately 11.5 dB quieter) and exposed it as a live, persistent
  `Morse identifier volume` control in the ASCII `NAVIGATION` group.
- Added runway-start ground operations: configured airport/runway-end spawn,
  airport elevation, runway and rough-surface friction, wheel brakes, crosswind
  tire grip, rudder steering, neutral-rudder runway alignment, and a 14-degree
  ground-rotation limit.
- Ground contact now uses earth-relative motion while flight remains air-relative,
  so a stationary aircraft stays still in crosswind. Liftoff occurs when the
  free-flight force exceeds the support force; touchdown handling grades smooth,
  good, firm, hard, bounce, and crash outcomes.
- Added a theme-aware ground status readout and ground-reaction vector. The
  deterministic text state reports runway, surface, above-ground height, brake,
  ground speed, phase, and the latest landing result.
- Added browser-local persistence for configuration, aircraft parameters, input
  tuning, wind, display state, editable chart data, and persistence preferences.
  It supports automatic restore, named presets, portable JSON import/export,
  and the last 50 landing reports.
- Added `GROUND OPS` and `PERSISTENCE` groups to the ASCII console and B as a
  hold-to-brake control. Both pages were exercised through the real keyboard
  flow and visually inspected in the default black-and-white theme.
- Browser checks verified a wind-correct stationary runway start, acceleration,
  complete braking, runway-aligned ground roll, force-based liftoff at 55 kt and
  14 degrees, named-preset/theme restoration after reload, and a clean console.
  Two restarted flights also produced independent `FIRM` and `GOOD` touchdown
  reports, both of which remained in landing history after a page reload.
- Added focused ground and persistence tests covering runway spawn, braking,
  yaw/rotation constraints, liftoff, touchdown grades, bounce/crash behavior,
  autosave restore, named/JSON presets, and landing-history retention.
- Kept the default chart and settings console monochrome while restoring a
  separate high-contrast semantic color system for force, moment, airspeed,
  wind, and ground-track vectors in the `black-white` theme.
- Browser checks verified the colored vectors in both trimmed and maneuvering
  flight against the monochrome chart, with matching arrow/label colors and no
  console errors.
- Made `black-white` the startup map theme and connected the full-screen ASCII
  settings console to the active chart palette. Theme changes now repaint the
  console live, including its background, frame, text, selection, status, and
  error colors.
- Verified the black-and-white startup chart and settings console in the browser,
  then cycled the open console through all fourteen themes. Every palette remained
  readable and the browser console reported no errors.
- Expanded the live chart palette from four to fourteen themes: `black-white`,
  GitHub light/dark, Nord, Dracula, Solarized light/dark, Gruvbox Dark, Tokyo
  Night, and Catppuccin Mocha join the existing themes. Each palette covers the
  complete map, navigation, vector, instrument, and energy color system.
- Cycled through all fourteen themes using the real keyboard settings flow,
  captured and inspected each 1280x720 canvas, matched every reported theme to
  the visible palette, and found no browser console errors.
- Confirmed the W/S throttle input drives the modeled thrust output and added a
  theme-aware vertical throttle tape beside the screen-center aircraft. Its
  visibility, center offsets, width, and height are exposed in ASCII settings.
- Browser verification moved throttle from 40.3% to 76.5% with W and raised
  thrust from 950 N to 1,804 N; S reduced both again. The final tape placement
  cleared the force labels and produced no browser console errors.
- Restored the original viewport-wide pitch horizon in place of the compact
  corner instrument. It follows pitch and bank, retains the fixed level
  reference and edge scales, and now uses the active map theme.
- Browser checks verified viewport-line rotation through a 37-degree bank and
  translation to -34 degrees pitch. Drawing it beneath HUD text keeps status
  labels readable; the throttle tape remains unobstructed and no console errors
  were reported.
- Verified level flight, combined pitch/bank motion, all four map themes, and
  the settings toggle through Playwright; state output matched the display and
  no browser console errors were reported.
- Added a live map theme system with coordinated palettes for chart surfaces,
  features, navigation, instruments, vectors, and the energy diagram. Both the
  startup default and live theme are configurable from ASCII `DISPLAY` settings.
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

- [x] Verify runway start, roll, braking, rotation, and liftoff in the browser.
- [x] Verify autosave and a named preset survive a browser reload.
- [x] Verify the ASCII Ground Ops and Persistence screens.
- [ ] Add a full time-series flight replay; the current persistence layer stores
  configuration, presets, and landing summaries only.
- [x] Verify colored vectors against the black-and-white chart in live flight.
- [x] Verify black-white startup and live settings-console recoloring in browser.
- [x] Complete settings interaction and visual QA for all fourteen map themes.
- [x] Complete browser motion and visual QA for the restored viewport pitch line.
- [x] Complete browser input and visual QA for the center throttle indicator.
- [x] Complete browser interaction and visual QA for the corner pitch indicator.
- [x] Complete browser interaction and visual QA for every map theme.
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

## Flight-envelope pass (2026-10-25)

- Added four flap detents on F (0/10/20/30 degrees), including flap lift,
  drag and pitch effects in physics and level-flight trim.
- Added height-dependent ground effect using runway/terrain AGL: a small lift
  increase and reduced induced drag within one wingspan of the surface.
- Added deterministic stall warning, buffet, wing drop, developed spins, and a
  recovery sequence requiring forward elevator plus opposite rudder.
- Added positive/negative G limits, Vne overspeed tracking, accumulating
  structural damage, and structural-failure roll behavior.
- Added a compact theme-aware envelope HUD and a complete ASCII `ENVELOPE`
  settings group for live state and all tuning parameters.
- Removed the normal pause overlay while the configuration console is open so
  the black-and-white ASCII screen remains clean and readable.
- `render_game_to_text` now exposes flap, ground-effect, stall/spin, G-load,
  overspeed, recovery, and structural-damage state.
- Full check passes: 56 tests plus JavaScript syntax validation.
- Browser QA verified F cycles 10/20/30/0, stall -> spin -> recovery -> normal,
  the new HUD, and the ASCII envelope screen with no console or page errors.

## Next suggestions

- [ ] Add a full time-series flight replay; persistence currently stores
  configuration, presets, and landing summaries only.
- [ ] Add weather layers, turbulence, and cloud/visibility effects.
- [ ] Add engine mixture, propeller, fuel, and failure management.

## Audible stall warning (2026-10-25)

- Added a dedicated browser Web Audio stall horn, distinct from the VOR Morse
  identifier: 680 Hz triangle tone, 3.2 Hz pulse cadence, and 0.12 default gain.
- The horn arms on the first keyboard or pointer interaction, follows live stall
  severity, becomes continuous in a fully developed stall, and mutes while the
  simulator is paused or the configuration console is open.
- Added persistent ASCII `ENVELOPE` controls for enable/disable, volume,
  frequency, and pulse rate, plus live horn state in `render_game_to_text`.
- Full check passes: 59 tests plus JavaScript syntax validation.
- Browser QA verified Web Audio unlock, audible/silent pulse phases, pause mute,
  the warning HUD, and the ASCII audio settings with no console or page errors.

## ASCII help terminal (2026-10-25)

- Rebuilt help as the same full-screen ASCII terminal system used by settings:
  active chart palette, literal character borders, topic rail, content pane,
  fixed status/key footer, and ASCII scrollbar.
- Reorganized the manual into flight controls, navigation, display/system,
  stall/spin recovery, VOR basics, setup, CDI tracking, and procedures.
- Help preserves mouse, arrow, page, Home, and End scrolling; the active topic
  follows the visible content and reopening resets to the first section.
- The pause overlay no longer bleeds through help, and text state now reports
  the visible help section.
- Full check passes: 61 tests plus JavaScript syntax validation.
- Browser QA verified top/middle/end navigation, close/reopen behavior, and
  black-white plus Nord rendering with no console or page errors.
