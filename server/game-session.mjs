import { randomUUID } from 'node:crypto';

export class GameSession {
  constructor({ commandTimeoutMs = 5000 } = {}) {
    this.socket = null;
    this.state = null;
    this.connectedAt = null;
    this.lastStateAt = null;
    this.commandTimeoutMs = commandTimeoutMs;
    this.pending = new Map();
  }

  get connected() {
    return this.socket?.readyState === 1;
  }

  attach(socket) {
    if (this.socket && this.socket !== socket) this.socket.close(1012, 'Replaced by a new game session');
    this.rejectPending(new Error('Game session replaced'));
    this.socket = socket;
    this.state = null;
    this.connectedAt = new Date().toISOString();
    this.lastStateAt = null;

    socket.on('message', data => this.handleMessage(data));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.rejectPending(new Error('Game session disconnected'));
    });
    socket.on('error', error => {
      if (this.socket === socket) this.rejectPending(error);
    });
  }

  handleMessage(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    if (message.type === 'state' && message.state && typeof message.state === 'object') {
      this.state = message.state;
      this.lastStateAt = new Date().toISOString();
      return;
    }

    if (message.type !== 'result' || !message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || 'Game command failed'));
  }

  requireState() {
    if (!this.connected) {
      throw new Error('No game is connected. Open http://127.0.0.1:3005/ in a browser.');
    }
    if (!this.state) throw new Error('The game is connected but has not published state yet.');
    return this.state;
  }

  command(name, args = {}) {
    if (!this.connected) {
      return Promise.reject(new Error(
        'No game is connected. Open http://127.0.0.1:3005/ in a browser.'
      ));
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Game command timed out: ${name}`));
      }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type: 'command', id, name, args }), error => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  status() {
    return {
      connected: this.connected,
      connectedAt: this.connectedAt,
      lastStateAt: this.lastStateAt,
      pendingCommands: this.pending.size
    };
  }
}
