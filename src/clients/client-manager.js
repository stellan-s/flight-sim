export class ClientManager {
  constructor(clients, initialId = 'ascii') {
    this.clients = new Map(clients.map(client => [client.id, client]));
    this.order = [...this.clients.keys()];
    this.activeId = this.clients.has(initialId) ? initialId : this.order[0];
  }

  get activeClient() {
    return this.clients.get(this.activeId);
  }

  select(id) {
    const normalized = id === '3d' ? 'vector-3d' : String(id);
    if (!this.clients.has(normalized)) {
      throw new Error(`Unknown client: ${id}`);
    }
    this.activeId = normalized;
    return this.activeId;
  }

  toggle() {
    const index = this.order.indexOf(this.activeId);
    this.activeId = this.order[(index + 1) % this.order.length];
    return this.activeId;
  }

  render() {
    this.activeClient?.render();
  }

  resize() {
    this.activeClient?.resize?.();
  }

  setStyle(style) {
    return this.clients.get('vector-3d')?.setStyle(style);
  }

  cycleStyle() {
    return this.clients.get('vector-3d')?.cycleStyle();
  }

  setCamera(camera) {
    return this.clients.get('vector-3d')?.setCamera(camera);
  }

  cycleCamera() {
    return this.clients.get('vector-3d')?.cycleCamera();
  }

  getStyle() {
    return this.clients.get('vector-3d')?.styleId ?? null;
  }

  getCamera() {
    return this.clients.get('vector-3d')?.cameraId ?? null;
  }

  lookByPixels(deltaX, deltaY, sensitivity) {
    return this.clients.get('vector-3d')?.lookByPixels(deltaX, deltaY, sensitivity);
  }

  resetLook() {
    return this.clients.get('vector-3d')?.resetLook();
  }

  getLook() {
    return this.clients.get('vector-3d')?.getLook() ?? { yawDeg: 0, pitchDeg: 0 };
  }

  getPalette() {
    return this.activeClient?.getPalette?.() ?? null;
  }

  getState() {
    return {
      active: this.activeId,
      available: [...this.order],
      threeDStyle: this.getStyle(),
      threeDCamera: this.getCamera()
    };
  }
}
