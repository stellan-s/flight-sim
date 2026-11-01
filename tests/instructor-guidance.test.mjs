import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPlainInstructorMessage,
  buildFlightInstructorPrompt,
  findInstructorJargon,
  INSTRUCTOR_MESSAGE_MAX_LENGTH,
  INSTRUCTOR_SERVER_INSTRUCTIONS,
  INSTRUCTOR_TOOL_DESCRIPTION
} from '../server/instructor-guidance.mjs';

test('MCP instructor requires one short, measurable, plain-language action', () => {
  const prompt = buildFlightInstructorPrompt('level flight');

  assert.equal(INSTRUCTOR_MESSAGE_MAX_LENGTH, 160);
  assert.match(INSTRUCTOR_TOOL_DESCRIPTION, /one exact action/i);
  assert.match(INSTRUCTOR_TOOL_DESCRIPTION, /current value/i);
  assert.match(INSTRUCTOR_TOOL_DESCRIPTION, /no abbreviations or aviation jargon/i);
  assert.match(prompt, /one action only/i);
  assert.match(prompt, /desired value or a clear point at which to stop/i);
  assert.match(prompt, /Do not ask the pilot to type/i);
  assert.match(prompt, /wait_for_flight_change/i);
  assert.match(prompt, /instructorMonitor\.revision/i);
  assert.match(prompt, /Use Swedish when the pilot's language is not clear/i);
  assert.match(prompt, /Training focus: level flight/);
});

test('server-wide instructor rules require continuous state checks and ordinary words', () => {
  const instructions = INSTRUCTOR_SERVER_INSTRUCTIONS.join(' ');

  assert.match(instructions, /read the live flight state before every instruction/i);
  assert.match(instructions, /one action at a time/i);
  assert.match(instructions, /ordinary words/i);
  assert.match(instructions, /Do not ask the pilot to reply/i);
  assert.match(instructions, /samples instructor conditions locally once per second/i);
});

test('pilot-facing jargon is blocked before it reaches the simulator', () => {
  const oldMessage = 'STALLRISK 15 KT - 1281 FT AGL - STABILISERA OCH TRIMMA BORT SPAKTRYCKET';
  assert.deepEqual(
    findInstructorJargon(oldMessage),
    ['AGL', 'KT', 'FT', 'trim', 'spaktryck', 'stall', 'stabilisera']
  );
  assert.throws(
    () => assertPlainInstructorMessage(oldMessage),
    /Rewrite the instruction in ordinary words/
  );
});

test('specific everyday-language instruction is accepted', () => {
  const message = 'Tryck uppåtpilen kort. Farten är 54 knop; släpp vid 70 knop.';
  assert.deepEqual(findInstructorJargon(message), []);
  assert.doesNotThrow(() => assertPlainInstructorMessage(message));
});
