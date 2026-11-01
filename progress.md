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

## MCP integration (2026-10-30)

- Started a local Model Context Protocol integration requested by the user.
- Architecture decision: one Node process serves the existing static game on
  port 3005, exposes MCP over stdio, and exchanges live state/actions with the
  visible browser session over WebSocket. The browser remains the sole owner of
  physics state.
- Planned first release: structured flight/force/navigation/configuration
  reads plus pause, resume, reset, control, wind, navigation, display, scenario,
  parameter, and deterministic time-step actions.
- Completed the local MCP server with 17 tools, five JSON resources, and
  flight-instructor/scenario-director prompts. The same process hosts the game
  on port 3005 and communicates with the visible browser over WebSocket.
- Added a browser adapter for live state, force/moment diagnostics, nearby
  airports, complete configuration, landing history, flight controls, wind,
  VOR/airport selection, display settings, runtime parameters, runway/airborne
  scenarios, pause/resume/reset, and deterministic time advancement.
- Added MCP session tests and README setup/configuration documentation.
- End-to-end verification used the real MCP stdio handshake and tools against a
  connected Chromium game: loaded a trimmed 4,200 ft / 95 kt scenario near
  KCHR, selected runway 13, set 220°/12 kt wind, and verified 10,187 N lift,
  10,228 N weight, 901 N thrust, 900 N drag, 0.99 G, correct AGL/terrain state,
  and zero browser console errors.
- Final automated check passes: 64 tests plus JavaScript syntax validation.
- Replaced the combined stdio/HTTP-host startup with a local Streamable HTTP
  endpoint at `/mcp`. Codex can now connect to the already-running game host
  instead of spawning a second process that either collides on port 3005 or is
  denied permission to bind the port from its sandbox.
- Verified MCP initialization, all 17 tool definitions, the live browser bridge,
  and `get_flight_state` over HTTP. Updated the global `flight-sim` Codex entry
  to `http://127.0.0.1:3005/mcp`.
- Re-ran the full 64-test check and the required Playwright game smoke pass.
  The inspected screenshot and text state both showed the aircraft stationary
  on KABC runway 18, the default black-and-white vector display, and no browser
  errors after the transport change.

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

## Three-film brag series (2026-10-27)

- Created a new timestamped, uncommitted video run under
  `brag-output-2026-10-27-145758/` with separate vector, theme, and scenario
  plans, composition briefs, compositions, and share copy.
- Vector film isolates complete, force-only, motion-only, and recombined vector
  views from the real simulator capture.
- Theme film retimes one uninterrupted real flight through Black + White,
  Phosphor, Amber, Nord, Dracula, GitHub Dark, Solarized Dark, Tokyo Night, and
  back to the default palette.
- Scenario capture runs the real simulator deterministically at 2× time. The
  final scripted training run progresses from crosswind cruise through a stall
  and developed spin; opposite rudder and forward elevator break the spin, but
  the deliberately late pullout exceeds the structural limit.
- All three films remain silent and use only low, flat-background subtitles.
- HyperFrames validation passed for all three compositions: no lint, runtime,
  layout, motion, or contrast failures. The only craft warning is intentional
  silence.
- Inspected contact sheets and final poster frames for all three films.
- Rendered `vectors/brag.mp4` and `themes/brag.mp4` at 20 seconds each, plus
  `scenario/brag.mp4` at 22 seconds. All are 1920×1080 H.264 at 30 fps with no
  audio stream.
- Baked each selected poster into frame zero and verified the encoded first
  frames visually.

## Crosswind-landing film (2026-10-27)

- Planned a separate 22-second silent film showing a complete landing on KABC
  runway 18 in an 18-knot westerly crosswind.
- Added a deterministic Playwright capture controller that flies the real
  physics model at 2× simulation time: crabbed final, centerline intercept,
  decrab, upwind wing low, flare, touchdown, and braking.
- Froze the scenario at exactly 270°/18 kt so the displayed wind and active
  runway remain consistent throughout the film.
- Iterated the approach using image-free trial runs. The verified run touches
  down on asphalt 13 m left of centerline with a `GOOD` 52/100 landing at
  239 ft/min, 53 kt groundspeed, 5.5° bank, and 7.2° pitch.
- Recorded the final UI footage and built the HyperFrames composition with six
  plain subtitle cards and no audio.
- HyperFrames check passes lint, runtime, layout, motion, and all 4/4 WCAG AA
  contrast checks. The only warning is the intentional silent-film warning.
- Rendered the 22-second 1920×1080 H.264 delivery at 30 fps, generated the
  landing poster, and baked that poster into frame zero for sharing previews.

## Flight-test and MCP control architecture (2026-10-30)

- Replaced the airport-boundary AGL fallback with a continuous terrain estimate
  interpolated from the nearest charted field elevations. AGL no longer jumps
  to MSL when the aircraft leaves the modeled airport surface.
- Added takeoff/landing hysteresis: upward force must persist before wheel
  contact releases, landing evaluation is not armed until flight is established,
  and an immediate recontact cannot create a false scored touchdown.
- Added explicit `human`, `instructor`, and `autopilot` control ownership.
  Keyboard flight input disconnects non-human control; MCP direct controls no
  longer get overwritten by the keyboard return-to-neutral logic.
- Added in-game heading, altitude, and airspeed regulators plus waypoint,
  traffic-pattern, and approach route guidance. MCP now submits targets instead
  of attempting a networked 60 Hz control loop.
- Added a Worker-backed background clock so physics continues while rendering
  is throttled in a hidden tab. Deterministic `advance_simulation` remains
  available for tests and server-directed stepping.
- Expanded telemetry with ground track, flight-path angle, turn rate, sideslip,
  selected-airport height, pattern altitude MSL, terrain elevation, runway
  centerline error, control owner, clock mode, and controller targets.
- Added a themed ASCII instructor subtitle inside the canvas and an MCP
  `show_instruction` command for continuous coaching without chat interaction.
- Added a timestamped 10 Hz ring-buffer flight recorder with start, stop, clear,
  status, and export actions plus takeoff/touchdown/crash event markers.
- Added four deterministic regression evaluations: stable level flight, a
  one-second trim disturbance, a 15 kt crosswind takeoff, and scored runway
  landing. The trim disturbance remains bounded with the existing aerodynamic
  coefficients, so no speculative pitch-model tuning was applied.
- Browser QA verified the live recorder/telemetry, runway rendering, internal
  `hold_heading` command, instructor subtitle, and zero console/page errors.

## Context-sensitive ground zoom (2026-10-30)

- Added a 6x minimum chart zoom while wheel contact is active, compared with
  the normal 3x pilot-selected zoom.
- Kept effective and requested zoom separate so ground zoom never overwrites
  the pilot's saved airborne preference. Manual zoom can still go closer than
  6x while on the ground.
- Added a smooth configurable transition back to the requested zoom after
  liftoff, plus `Ground minimum zoom` and `Ground zoom transition` settings in
  the ASCII DISPLAY panel.
- Text telemetry now reports effective zoom, requested zoom, and whether ground
  zoom is active. Persistence stores the requested value rather than the
  temporary ground value.

## Boxless ASCII HUD (2026-10-30)

- Kept the original solid vertical throttle tape and added shared deterministic
  helpers for the new horizontal ASCII control gauges.
- Removed panel rectangles from ground, envelope, vector-mode, pitch-label,
  airport-navigation, and instructor HUD elements. Force, moment, and motion
  vector labels deliberately retain their color-coded boxes. Narrow
  theme-colored text halos preserve legibility for the remaining plain text.
- Rebuilt the top-right flight/force/control readout as compact sections with
  ASCII elevator, trim, throttle, and flap meters.
- Reserved separate top status rows, a bottom mode/timer footer, and extra
  clearance below the energy diagram to prevent the known HUD overlaps.
- Added collision-aware boxed vector-label placement with reserved HUD zones for
  the top strip, original throttle tape, state readout, navigation, instructor
  line, energy graph, and footer. A compact layout moves airport navigation to
  the left at widths below 1100 pixels.
- Replaced the full-screen dimmed pause layer with a boxless `|| PAUSED` ASCII
  status and compact key hints above the flight display.
- Added regression coverage that requires runtime ground/envelope status to
  remain rectangle-free, the throttle to retain its filled vector bar, and
  boxed vector labels to avoid reserved regions.
- Corrected the first HUD interpretation after user review: force, moment, and
  motion labels are boxed again, while the original filled throttle tape is
  restored at its original 96-pixel center offset. Collision-aware placement
  now measures the complete label boxes, including their padding.
- Browser QA verified boxed vector labels at runway start and the restored
  throttle tape at 0% and 65%. The labels avoided the tape and each other, the
  state reported the same 65% command, and no console errors occurred.
- A 1024×640 airborne pass with navigation and instructor text confirmed the
  wider label boxes also remain separated in the compact layout.
- Current automated result: 79 tests plus JavaScript syntax validation passing.

### HUD QA remaining

- [x] Inspect the boxless HUD in the browser at runway start and in flight.
- [x] Verify vector/map footer separation and energy-chart clearance.
- [x] Verify the active airport-navigation readout and instructor message.
- [x] Check Nord plus black-and-white at 1280×720 and 1024×640.
- [x] Exercise pause, elevator, aileron, rudder, and brake input through the
  Playwright game client; screenshots and state were produced without browser
  errors.
- Automated checks pass: 74 tests and JavaScript syntax validation. Browser QA
  verified 6x on the runway and restoration to 3x in an airborne scenario with
  no console or page errors.

## Full-screen ILS guidance (2026-10-30)

- Added runway-threshold Instrument Landing System guidance for the selected
  airport and wind-selected active runway.
- Added a full-height localizer line, full-width glideslope line, center-scale
  ticks, capture colors, target altitude, range, and ASCII approach status.
- Added configurable course width, glide angle, range, threshold crossing
  height, and needle travel to the ASCII DISPLAY settings.
- Added an `I` keyboard toggle and an ILS help section. `L` continues to choose
  the airport that supplies the approach.
- Exposed localizer/glideslope errors, dots, target altitude, height error, and
  capture state through text telemetry and MCP navigation state. MCP
  `set_display` can also show or hide the ILS layer.
- Added deterministic geometry and renderer coverage for centered, lateral,
  vertical, beyond-threshold, and out-of-range cases.
- Browser QA placed the aircraft five nautical miles from KABC runway 18. A
  centered three-degree final produced `ILS CAPTURED`; a 450 m left / 400 ft
  high case moved the localizer right and glideslope down, matching the
  steering correction. Text telemetry matched both views with no console or
  page errors.
- Current automated result: 83 tests plus JavaScript syntax validation passing.

## Persistent instructor subtitle visibility (2026-10-30)

- Diagnosed an MCP/browser reconnect immediately after an instruction update;
  the new browser runtime had an empty overlay until the next instructor poll.
- Reduced the external trim instructor refresh interval to three seconds and
  retained a 60-second instruction lifetime so reloads cannot create a long gap.
- Replaced the easy-to-miss halo-only instructor line with a borderless inverse
  subtitle strip. Long instructions wrap to two centered lines and remain
  legible over runways, ILS lines, and force vectors.
- Added regression coverage for contrast, wrapping, and expiry behavior.
- Found that two open `?mcp=1` tabs repeatedly replaced each other's game
  socket, so instructions and control commands alternated between two aircraft.
  The browser bridge now disconnects while hidden and identifies its visibility
  during the handshake; the server accepts only the visible simulator tab.
- Added a deterministic static production build and root `netlify.toml` so the
  Git-connected Netlify site can build `dist/` from every push to `main`
  without publishing server code, local configuration, or dependencies.

## Magnitude-scaled moment vectors (2026-10-31)

- Replaced the fixed-length L/M/N circles with curved arrows whose sweep grows
  with roll, pitch, and yaw moment magnitude and whose direction follows the
  moment sign.
- Moment labels now include signed values in N·m. The top-right diagnostic row
  identifies the same unit explicitly.
- Added live ASCII settings for full-scale moment and minimum/maximum arc sweep.
- Added focused regression coverage for magnitude growth, saturation, sign,
  near-zero suppression, and label formatting.
- Browser QA verified signed L/M/N labels and distinct curved arrows at rest and
  under combined elevator, aileron, and rudder input with no console errors.
- Current automated result: 89 tests, syntax validation, and static build pass.

## Multi-client engine branch and Vector 3D (2026-11-01)

- User prompt: support interchangeable clients above one flight engine, retaining
  the current ASCII client and adding a 3D client with multiple aesthetics.
- Created branch `codex/multi-client-3d` from the latest local `main`.
- Added `SimulationSession` as a renderer-neutral command, state, stepping, and
  serialization boundary. The existing fixed physics step now runs through it,
  and it is exposed as `window.flightSimulatorSession` for future clients.
- Added a runtime `ClientManager` and compatibility `AsciiMapClient`. Switching
  clients changes only rendering; it does not clone, pause, or reset physics.
- Added the Canvas-based `Vector3DClient`: body-frame perspective projection,
  attitude horizon, world-aligned ground grid, clipped runway surfaces,
  centerlines and lights, obstacles, ILS needles, throttle, linear forces, and
  signed roll/pitch/yaw moment arcs.
- Added four 3D aesthetics: Vector Day, Nord Night, Amber CRT with scanlines,
  and Blueprint. K switches clients and Y cycles aesthetics. Both selections
  are available in ASCII settings, browser persistence, URL parameters, text
  telemetry, and MCP `set_display`.
- Browser QA inspected the unchanged ASCII client, all four 3D ground views,
  and a paused 95-knot airborne scene at 1,001 ft AGL with a 12-degree bank.
  The airborne render showed the projected runway and grid plus balanced lift,
  weight, thrust, and drag with no console errors.
- End-to-end keyboard QA verified ASCII -> Vector 3D -> Nord Night -> ASCII
  while paused, preserving exact position and flight time.

### Multi-client follow-ups

- [ ] Move the remaining legacy browser-host construction out of `main.js` so
  `SimulationSession` can create the complete engine without a DOM host.
- [ ] Add optional terrain height tiles; Vector 3D currently projects the same
  continuous flat-field terrain estimate used by AGL.
- [x] Add chase and tower cameras after the cockpit projection is flight-tested.

## Vector 3D cameras (2026-11-01)

- Added Cockpit, Chase, and Tower cameras to the Vector 3D client. J cycles the
  camera without mutating position, controls, physics time, or control ownership.
- Chase follows 72 metres behind and 18 metres above the aircraft with a lightly
  damped bank angle. Tower stays beside the nearest or selected airport runway
  and continuously tracks the aircraft.
- External views draw a projected Cessna wireframe and attach the force vectors
  to its screen position. Vector directions are transformed through the camera,
  so lift, weight, thrust, and drag remain spatially meaningful outside cockpit view.
- Camera selection is available through URL state, ASCII settings, persistence,
  deterministic text state, the session command boundary, and MCP `set_display`.
- Browser QA inspected all three ground and airborne views. Keyboard QA produced
  Cockpit -> Chase -> Tower -> Cockpit with unchanged aircraft state and flight
  time, and no console or page errors. The ASCII DISPLAY screen shows the live
  camera selection.

### Terrain design checkpoint

- [ ] Do not add decorative 3D terrain independently of the map. Define one
  geodetic world source whose elevation and feature data feed AGL, the ASCII map,
  and Vector 3D together.
- [ ] Decide elevation tile format, level-of-detail rules, offline/cache policy,
  map contour treatment, and whether the current fictional airports remain or
  become a selectable world layer before implementing terrain.

## Vector 3D ground-grid projection fix (2026-11-01)

- Fixed grid lines appearing in the sky during banked flight. The renderer had
  clamped each projected endpoint independently to a +/-50,000-pixel square,
  which changed the slope of long near-plane lines and detached them from the
  projected ground plane.
- Added true rectangular screen-segment clipping. It preserves the original
  perspective line while discarding only the off-screen part. The attitude
  background now also uses the exact tangent-based pitch projection.
- Converted grid calculations from feet to metres and anchored major lines to
  absolute geographic indices instead of the nearest aircraft-relative cell.
- A first follow-up made the grid too faint and shortened its range. Restored
  the original 0.16/0.38 alpha, line widths, and effective altitude density,
  while retaining correct clipping and extending the grid back to the visible
  horizon.
- Browser QA reproduced a 4,114 ft MSL / 2,915 ft AGL scene at 0, -16.2, -30,
  and +30 degrees bank. Every grid line remained on the ground side of the
  horizon and the browser reported no console or page errors.
- Replaced the remaining finite grid square with nested near, middle, and far
  distance levels. The coarse outer levels begin beyond the previous level and
  extend the projected ground plane to within a few pixels of the mathematical
  horizon without stacking lines or weakening the foreground grid.
- Regression QA matched the reported 2,496 ft MSL / 1,296 ft AGL scene at +4.5
  degrees pitch and -0.3, -16.2, and +30 degrees bank. Grid and horizon now meet
  at every tested attitude, with no sky-side lines or browser errors.

## Vector 3D ASCII control panel (2026-11-01)

- Added a borderless, theme-aware ASCII control readout below the 3D client label.
  It shows elevator trim independently from live elevator position, plus aileron,
  rudder, throttle, flap angle, and wheel brake command.
- Trim includes a numerical percentage, NOSE UP / NOSE DN / NEUTRAL direction,
  and a higher-resolution signed bar scaled to the configured normal +/-30%
  trim range. The existing center-adjacent throttle tape remains unchanged.
- Browser QA exercised Page Down trim followed by opposite elevator input. The
  panel showed +6% NOSE UP trim while the elevator remained negative, matching
  deterministic text state. Throttle 43% and flaps 10 degrees also matched.
- Final result: 100 tests and the static build pass; no browser console or page
  errors were reported.

## Vector 3D grid horizon density (2026-11-01)

- The corrected grid geometry still accumulated too many opaque projected lines
  close to the horizon, producing a dark moire-like band in banked flight.
- Split the grid into four distance-based detail levels. The closest 4.5-12 km
  keeps the existing strong contrast; outer rings progressively reduce opacity,
  line width, and line frequency without changing the foreground appearance.
- Reproduced the reported square viewport at 3,058 ft MSL / 1,858 ft AGL,
  +3.6 degrees pitch, and -11.8 degrees bank, then checked 0 and +30 degrees.
  All grid lines remain on the ground side, meet the horizon, and no longer form
  a nearly solid far-distance band. Browser console and page errors remain empty.

## Vector 3D ground-level grid coverage (2026-11-01)

- Fixed the empty lower viewport at runway height. The generic 20-metre near
  clipping plane prevented the projected ground grid from reaching the bottom
  when the cockpit was only 4 ft above terrain.
- Grid clipping now scales from 1.5 metres near the surface to the unchanged
  20-metre limit aloft and uses camera height, so cockpit, chase, and tower views
  receive appropriate coverage independently.
- The single world grid changes scale with camera height: 2-metre cells at runway
  height, then 5, 10, and 25 metres before progressively coarser airborne scales.
  Its near clipping still fills the foreground without introducing a second grid.
- Browser QA inspected both 1280x720 and the reported 1280x1280 layout at 4.1 ft
  AGL. Grid lines now remain visible through the bottom foreground, meet the
  horizon, and produce no browser console or page errors.

## Stable MCP subtitle and runway foreground (2026-11-01)

- Locked the in-game MCP instructor subtitle to white text on a black background.
  Its colour no longer changes with the selected visual theme or with instruction
  versus warning severity.
- Confirmed with a deterministic ground test that the aircraft spawns on runway
  18/36 with zero cross-track displacement. The apparent off-runway position was
  a rendering problem rather than a placement or physics problem.
- Applied the height-dependent near clipping plane to the complete runway drawing,
  including its filled surface, edges, markings, centreline, and lights. The
  runway now reaches the bottom foreground at 4.1 ft AGL instead of ending in a
  narrow strip at the horizon.
- Browser QA inspected cockpit and chase views in the reported square layout. The
  aircraft is visually centred on the runway, the warning subtitle remains black
  and white, and no browser console or page errors were reported.

## Continuous Vector 3D wireframe (2026-11-01)

- Removed the concentric grid detail rings. Their cut-out centres caused lines to
  terminate at arbitrary square boundaries, so the surface looked like separate
  patches instead of one wireframe.
- The ground is now one world-anchored grid at any given camera height. Every line
  spans the same complete surface extent, with one spacing and one major-line
  rhythm; only the whole grid scale changes as camera height changes.
- Browser QA covered runway-height cockpit and chase views plus banked flight at
  1,858 ft AGL. The mesh remains continuous from the foreground to the horizon,
  stays entirely on the ground side, and produced no console or page errors.

## Shared ASCII and Vector 3D themes (2026-11-01)

- Removed the independent `3D aesthetic` setting. The active chart theme is now
  the single source of truth for the ASCII map, settings/help surfaces, and the
  Vector 3D client.
- Vector 3D palettes are generated from all fourteen chart themes, including the
  same semantic force-vector colours. The 3D ground is a subtle blend of each
  theme's background and foreground so the horizon remains readable.
- `Y`, the configuration console, persistence, URL style selection, and MCP
  display changes all update the shared theme. Legacy `vector-day`, `nord-night`,
  `amber-crt`, and `blueprint` URLs map to compatible current themes.
- Browser QA followed `ASCII Nord -> Vector 3D Nord -> Vector 3D Dracula ->
  ASCII Dracula` using real `K` and `Y` key events. Both reported theme fields
  matched at every step, all four screenshots matched visually, and no browser
  console or page errors were reported.

## Shared HUD across rendering clients (2026-11-01)

- Split the normal HUD into a shared underlay and overlay. The pitch reference and
  full-screen ILS guidance render below client-specific force vectors; every other
  instrument renders above the ASCII map or Vector 3D world from the same methods.
- Vector 3D now shows the normal altitude/IAS/heading/vertical-speed header, wind
  and zoom, ground and envelope status, flight/force/control panel, throttle tape,
  airport navigation, energy trend, vector and map modes, client/camera/theme,
  timer, mouse crosshair, pause state, instruction strip, help, and settings.
- Expanded the common control panel with aileron, rudder, and brake bars so moving
  from the retired special 3D HUD does not remove any control information. The
  crosshair now uses the active theme foreground instead of hard-coded black.
- Removed the separate 3D HUD renderer. Browser QA compared paused Nord ASCII and
  3D frames with a selected airport, populated energy history, and crosshair at an
  identical aircraft state, then checked the chase camera separately. Layout and
  values matched and no browser console or page errors were reported.

## Plain-language MCP instructor (2026-11-01)

- Rewrote the reusable flight-instructor prompt as a continuous observe, instruct,
  and verify loop. It gives one action, reads the resulting flight state, and only
  then continues without asking the pilot to reply in chat.
- Each on-screen instruction is limited to 160 characters and at most two short
  sentences. It names the exact key or control action plus current and desired
  values or a clear stopping condition.
- Pilot-facing text must use the pilot's language and ordinary words. The prompt
  explicitly replaces abbreviations and aviation terms such as AGL, IAS, FPM,
  pitch, bank, and trim with direct descriptions of height, speed, movement, and
  keyboard actions.
- Added shared server instructions, stricter `show_instruction` guidance, focused
  regression tests, and matching README/MCP documentation.
- Added a server-side plain-language gate after browser QA caught an older active
  instructor still sending `STALLRISK 15 KT`. Common abbreviations and aviation
  terms are rejected before reaching the subtitle, forcing the client to rewrite
  the instruction in ordinary words.
- Restarted the local MCP server and verified the real HTTP endpoint returns the
  updated prompt and tool description and rejects the old jargon-heavy message.
  A full browser/MCP pass accepted and displayed a concise Swedish instruction in
  Vector 3D; the inspected screenshot matched the requested subtitle style and
  reported no console or page errors. All 110 tests and the static build pass.

## Recorded instructor-flight review (2026-11-01)

- Stopped and exported the 10 Hz flight recorder after the guided circuit and
  landing. It contains 14,719 samples over 1,471.8 seconds and five ground events.
- The landing was off-runway on grass. The first contact was 299 ft/min at 76 kt
  with -0.8 degrees pitch, followed 0.317 seconds later by a false `takeoff`, a
  364 ft/min bounce, and a second contact at 73 kt. The displayed 50/100 report
  therefore describes only the final contact and hides the worse first contact.
- Code review found three high-priority defects exposed by the flight: active
  runway selection has no hysteresis and changes ends as a crosswind varies;
  held keyboard keys are not cleared on browser blur or visibility loss; and a
  post-touchdown rebound starts a new takeoff/landing cycle instead of remaining
  part of one landing.
- Landing quality also conflates impact severity with runway adherence: any
  off-runway contact is labelled `HARD`, even the one recorded at 1 ft/min.
- The recorder lacks wind, selected runway, ILS deviations, runway surface and
  on-runway state, so a complete navigation/approach replay cannot yet be derived
  from the export alone. No aerodynamic coefficient change is justified by this
  flight because instructor latency and potentially stuck inputs contaminated the
  handling data; the deterministic trim tests remain bounded.

## Flight-review corrections (2026-11-01)

- Added browser blur and visibility-loss handling for human input. Lost keyup
  events now clear held keys, return elevator to trim, centre aileron/rudder and
  release wheel brakes while preserving the pilot's selected throttle.
- Active runway selection now locks on the first wind-based choice for a selected
  airport. Wind variation cannot swap reciprocal runway ends or move the ILS
  during an approach; explicitly re-selecting the airport chooses again.
- Reworked touchdown handling into one landing cycle. Initial contact, aerodynamic
  rebound and subsequent bounces are accumulated until wheel contact is stable;
  only one touchdown report is persisted, using the worst impact and lowest score.
- Split impact quality from surface result. A smooth grass contact remains
  `SMOOTH / OFF_RUNWAY` instead of being mislabeled `HARD`, while off-runway
  penalties and the overall safety result remain intact.
- Upgraded flight-recorder exports to version 2. Every 10 Hz sample now includes
  wind, locked runway, centreline distance, compact ILS deviations/capture,
  ground surface/contact, brakes, trim, envelope state and instructor subtitle.
- Added a renderer-neutral instructor monitor that samples inside the simulation
  once per second and increments a revision only for meaningful flight changes.
  MCP now exposes `wait_for_flight_change`, a long-poll tool that wakes on that
  revision instead of requiring an AI client to issue one read every second.
- Runway and airborne scenario loads now publish a complete instructor sample
  immediately. Monitor revisions remain monotonic across resets, so an MCP wait
  cannot wake on a temporary `unknown` state.
- Runway starts explicitly lock navigation to the same runway end as the physical
  spawn. Live reset verification now reports heading 180, active runway 18 and a
  locked runway 18 instead of leaving the ILS on reciprocal runway 36.
- Final verification passes all 122 tests, JavaScript syntax checks and the static
  production build. Live HTTP MCP verification confirms all 27 tools, a meaningful
  wait transition from revision 1 to 2, and a clean reset to the runway state.

## Mouse look, map pan and joystick input (2026-11-01)

- Added one right-button drag gesture across both clients. It pans a persistent
  aircraft-relative map offset in ASCII and changes yaw/pitch view offsets in
  cockpit, chase and tower cameras without changing the aircraft state.
- Preserved stationary right-click VOR tuning in the ASCII map; the three-pixel
  drag threshold prevents a click from accidentally moving the map.
- Added browser Gamepad API polling with safe activation. A detected joystick
  remains inactive until an axis moves or a button is pressed, avoiding an
  unexpected throttle or control jump merely from connecting hardware.
- Default mappings cover roll, pitch, rudder, throttle, wheel brake, flap detents
  and both trim directions. Deadzone, activation threshold, axis/button indices,
  inversion, mouse-look sensitivity and map-pan sensitivity are live, persistent
  settings in the `CONTROLS` console group.
- Deterministic text output now reports map offset, 3D look angle, pointer mode,
  joystick identity, connection/activation state, and normalized live axes.
- Browser QA performed real held-right-button drags in both clients and injected
  a virtual flight stick. Map and camera state changed independently, the HUD
  reflected every joystick command, and no console or page errors were reported.
- The final full suite passes all 128 tests and JavaScript syntax checks; the
  production static build also completes successfully.
