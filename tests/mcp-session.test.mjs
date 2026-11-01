import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { GameSession } from '../server/game-session.mjs';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }

  send(rawMessage, callback = () => {}) {
    this.sent.push(JSON.parse(rawMessage));
    callback();
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

test('game session receives live state from the browser bridge', () => {
  const session = new GameSession();
  const socket = new FakeSocket();
  session.attach(socket);

  socket.emit('message', JSON.stringify({
    type: 'state',
    state: { aircraft: { altitudeFt: 2500 }, forcesNewtons: { lift: 10000 } }
  }));

  assert.equal(session.requireState().aircraft.altitudeFt, 2500);
  assert.equal(session.status().connected, true);
  assert.ok(session.status().lastStateAt);
});

test('game session correlates command results', async () => {
  const session = new GameSession({ commandTimeoutMs: 100 });
  const socket = new FakeSocket();
  session.attach(socket);

  const resultPromise = session.command('pause');
  const command = socket.sent[0];
  assert.equal(command.type, 'command');
  assert.equal(command.name, 'pause');

  socket.emit('message', JSON.stringify({
    type: 'result',
    id: command.id,
    ok: true,
    result: { paused: true }
  }));

  assert.deepEqual(await resultPromise, { paused: true });
  assert.equal(session.status().pendingCommands, 0);
});

test('game session reports browser command failures', async () => {
  const session = new GameSession({ commandTimeoutMs: 100 });
  const socket = new FakeSocket();
  session.attach(socket);

  const resultPromise = session.command('select_airport', { airportId: 'NOPE' });
  const command = socket.sent[0];
  socket.emit('message', JSON.stringify({
    type: 'result',
    id: command.id,
    ok: false,
    error: 'Unknown airport: NOPE'
  }));

  await assert.rejects(resultPromise, /Unknown airport: NOPE/);
});

test('game session waits for the browser-local instructor revision to change', async () => {
  const session = new GameSession();
  const socket = new FakeSocket();
  session.attach(socket);
  socket.emit('message', JSON.stringify({
    type: 'state',
    state: { instructorMonitor: { revision: 4, phase: 'airborne', risk: 'none' } }
  }));

  const resultPromise = session.waitForInstructorChange(4, 100);
  assert.equal(session.status().waitingInstructorReads, 1);
  socket.emit('message', JSON.stringify({
    type: 'state',
    state: { instructorMonitor: { revision: 5, phase: 'approach', risk: 'none' } }
  }));

  const result = await resultPromise;
  assert.equal(result.changed, true);
  assert.equal(result.monitor.revision, 5);
  assert.equal(result.monitor.phase, 'approach');
  assert.equal(session.status().waitingInstructorReads, 0);
});

test('game session instructor wait returns current state on timeout', async () => {
  const session = new GameSession();
  const socket = new FakeSocket();
  session.attach(socket);
  socket.emit('message', JSON.stringify({
    type: 'state',
    state: { instructorMonitor: { revision: 2, phase: 'ground', risk: 'none' } }
  }));

  const result = await session.waitForInstructorChange(2, 5);
  assert.equal(result.changed, false);
  assert.equal(result.monitor.revision, 2);
});
