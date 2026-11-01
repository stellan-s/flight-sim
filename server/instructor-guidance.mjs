export const INSTRUCTOR_MESSAGE_MAX_LENGTH = 160;

export const INSTRUCTOR_TOOL_DESCRIPTION = [
  'Show one plain-language instruction to the pilot.',
  'Give one exact action, the current value, and a target or stop condition.',
  `Use at most ${INSTRUCTOR_MESSAGE_MAX_LENGTH} characters and no abbreviations or aviation jargon.`
].join(' ');

export const INSTRUCTOR_SERVER_INSTRUCTIONS = [
  'When coaching the pilot, read the live flight state before every instruction.',
  'Give only one action at a time, then read the state again before continuing.',
  'After showing an instruction, call wait_for_flight_change with the current instructorMonitor revision instead of repeatedly polling.',
  'The simulator samples instructor conditions locally once per second; formulate a new instruction only when its revision changes.',
  'Keep pilot-facing text short but specific: name the action, current value, target, and stop condition when relevant.',
  'Use ordinary words in the pilot\'s language; never use unexplained abbreviations, codes, or aviation jargon.',
  'Do not ask the pilot to reply when the simulator can show whether the action worked.'
];

const PILOT_FACING_JARGON = [
  ['AGL', /\bagl\b/i],
  ['IAS', /\bias\b/i],
  ['FPM', /\bfpm\b/i],
  ['VS', /\bvs\b/i],
  ['MSL', /\bmsl\b/i],
  ['AOA', /\baoa\b/i],
  ['VNE', /\bvne\b/i],
  ['KT', /\bkts?\b/i],
  ['FT', /\bft\b/i],
  ['NM', /\bnm\b/i],
  ['ALT', /\balt\b/i],
  ['HDG', /\bhdg\b/i],
  ['GS', /\bgs\b/i],
  ['TAS', /\btas\b/i],
  ['CAS', /\bcas\b/i],
  ['RPM', /\brpm\b/i],
  ['pitch', /\bpitch(?:a|en)?\b/i],
  ['bank', /\bbank(?:a|en)?\b/i],
  ['roll', /\broll(?:a|en)?\b/i],
  ['trim', /\btrim(?:ma|men|ning)?\b/i],
  ['spaktryck', /\bspaktryck(?:et)?\b/i],
  ['throttle', /\bthrottle\b/i],
  ['airspeed', /\bairspeed\b/i],
  ['vertical speed', /\bvertical\s+speed\b/i],
  ['altitude', /\baltitude\b/i],
  ['attitude', /\battitude\b/i],
  ['angle of attack', /\bangle\s+of\s+attack\b/i],
  ['aileron', /\bailerons?\b/i],
  ['elevator', /\belevators?\b/i],
  ['rudder', /\brudders?\b/i],
  ['flaps', /\bflaps?\b/i],
  ['skevroder', /\bskevroder\b/i],
  ['höjdroder', /\bhöjdroder\b/i],
  ['sidroder', /\bsidroder\b/i],
  ['klaffar', /\bklaff(?:ar|arna)?\b/i],
  ['stall', /\bstall(?:risk|en|a)?\b/i],
  ['stabilisera', /\bstabiliser(?:a|ing)\b/i],
  ['ILS', /\bils\b/i],
  ['VOR', /\bvor\b/i],
  ['CDI', /\bcdi\b/i],
  ['OBS', /\bobs\b/i],
  ['DME', /\bdme\b/i],
  ['localizer', /\blocali[sz]er\b/i],
  ['glideslope', /\bglide\s*slope\b/i],
  ['heading', /\bheading\b/i],
  ['course', /\bcourse\b/i],
  ['ground track', /\bground\s+track\b/i],
  ['flight path', /\bflight\s+path\b/i],
  ['radial', /\bradial\b/i],
  ['final', /\bfinal(?:en)?\b/i],
  ['crosswind', /\bcrosswind\b/i],
  ['lift', /\blift\b/i],
  ['drag', /\bdrag\b/i],
  ['thrust', /\bthrust\b/i],
  ['moment', /\bmoment\b/i],
  ['torque', /\btorque\b/i]
];

export function findInstructorJargon(message) {
  const text = String(message ?? '');
  return PILOT_FACING_JARGON
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

export function assertPlainInstructorMessage(message) {
  const jargon = findInstructorJargon(message);
  if (jargon.length === 0) return;
  throw new Error(
    `Rewrite the instruction in ordinary words before showing it. Avoid: ${jargon.join(', ')}.`
  );
}

export function buildFlightInstructorPrompt(focus = '') {
  const focusLine = String(focus ?? '').trim()
    ? `\nTraining focus: ${String(focus).trim()}`
    : '';

  return `Act as a calm flight instructor for the live Cessna 172 simulator.

Work continuously:
1. Read flight://state before each instruction and note instructorMonitor.revision.
2. Choose the single most important action for safety or the current exercise.
3. Call show_instruction with that action.
4. Call wait_for_flight_change with that revision. If changed is false, keep waiting without repeating the instruction.
5. When the revision changes, read flight://state again and only then give the next action. Do not ask the pilot to type that the action is complete.

Every message shown to the pilot must follow all of these rules:
- Use the pilot's language. Use Swedish when the pilot's language is not clear.
- Use no more than two short sentences and ${INSTRUCTOR_MESSAGE_MAX_LENGTH} characters.
- Give one action only. State the key or control, the direction, and a small amount when useful.
- Include the current value and the desired value or a clear point at which to stop when useful.
- Use ordinary words. Do not use abbreviations, letter codes, aviation slang, or unexplained technical terms.
- Say "height above the ground", not "AGL". Say "speed", not "IAS". Say "climbing or descending ... feet per minute", not "VS" or "FPM".
- Say "raise or lower the nose", not "pitch". Say "tilt the wings left or right", not "bank" or "roll".
- Do not tell the pilot to "trim" or "remove control pressure". Name Page Up or Page Down and explain the visible result instead.
- Describe what a force does in ordinary words. Do not make the pilot decode vector letters or formulas.
- Never say only "stabilize", "correct", "capture", or "hold". State exactly what the pilot should do and what result to watch for.

Bad: "STABILIZE 105 KT, 1281 FT AGL, VS +389 - TRIM OUT CONTROL PRESSURE."
Good: "Tryck uppåtpilen kort. Farten är 54 knop; släpp vid 70 knop."
Good: "Tryck Page Down kort tills höjden är stadig utan att du håller nedåtpilen."

Use the Vector 3D geometry only as an abstract runway and ground reference. Never claim to see realistic scenery. Do not take control unless the pilot explicitly asks you to.${focusLine}`;
}
