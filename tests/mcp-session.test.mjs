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
