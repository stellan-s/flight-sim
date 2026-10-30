import { FlightSimulatorMcpAdapter } from './mcp-adapter.js';

const STATE_INTERVAL_MS = 250;
const MAX_RECONNECT_DELAY_MS = 10000;

export class McpGameBridge {
  constructor(simulator) {
    this.adapter = new FlightSimulatorMcpAdapter(simulator);
    this.socket = null;
    this.stateTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 500;
    this.status = 'connecting';
  }

  get url() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/mcp-game`;
  }

  connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.status = 'connecting';
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.status = 'connected';
      this.reconnectDelay = 500;
      this.send({ type: 'hello', app: 'flight-sim', apiVersion: 2 });
      this.publishState();
      clearInterval(this.stateTimer);
      this.stateTimer = setInterval(() => this.publishState(), STATE_INTERVAL_MS);
    });

    this.socket.addEventListener('message', event => this.handleMessage(event.data));
    this.socket.addEventListener('close', () => this.scheduleReconnect());
    this.socket.addEventListener('error', () => {
      this.status = 'disconnected';
    });
  }

  scheduleReconnect() {
    this.status = 'disconnected';
    clearInterval(this.stateTimer);
    this.stateTimer = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  send(payload) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  publishState() {
    try {
      this.send({ type: 'state', state: this.adapter.getSnapshot() });
    } catch (error) {
      this.send({ type: 'bridge_error', error: error.message });
    }
  }

  async handleMessage(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }
    if (message.type !== 'command' || !message.id || !message.name) return;

    try {
      const result = await this.adapter.execute(message.name, message.args ?? {});
      this.send({ type: 'result', id: message.id, ok: true, result });
      this.publishState();
    } catch (error) {
      this.send({
        type: 'result',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  disconnect() {
    clearInterval(this.stateTimer);
    clearTimeout(this.reconnectTimer);
    this.stateTimer = null;
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.status = 'disconnected';
  }
}
