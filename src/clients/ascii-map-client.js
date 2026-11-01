export class AsciiMapClient {
  constructor(simulator) {
    this.id = 'ascii';
    this.label = 'ASCII MAP';
    this.simulator = simulator;
  }

  render() {
    this.simulator.renderAsciiClient();
  }

  getPalette() {
    return this.simulator.chart.palette;
  }
}
