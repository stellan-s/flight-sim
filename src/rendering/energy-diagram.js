// Energy trend diagram - shows potential, kinetic, and total energy over time

export class EnergyDiagram {
  constructor(chartRenderer) {
    this.chart = chartRenderer;

    // Energy history (arrays of values over time)
    this.maxSamples = 120; // 120 samples at ~0.5s intervals = 60 seconds
    this.sampleInterval = 0.5; // seconds
    this.timeSinceLastSample = 0;

    // Energy data arrays
    this.potentialEnergy = []; // Altitude-based (normalized)
    this.kineticEnergy = []; // Speed-based (normalized)
    this.totalEnergy = []; // Sum of both
    this.timestamps = []; // Time in seconds

    // Reference mass and constants
    this.referenceMass = 1000; // kg (for energy calculations)
    this.g = 9.81; // m/s^2

    // Display settings
    this.height = 150; // pixels
    this.margin = { top: 10, right: 60, bottom: 35, left: 80 };
    this.yAxisScale = 'auto'; // Auto-scaling
  }

  // Update energy history with current state
  update(state, dt) {
    // Validate inputs
    if (!state || !state.position || typeof state.position.altitude !== 'number') {
      console.warn('EnergyDiagram: Invalid state object');
      return;
    }
    if (typeof state.getVelocityMagnitude !== 'function') {
      console.warn('EnergyDiagram: state missing getVelocityMagnitude method');
      return;
    }

    this.timeSinceLastSample += dt;

    // Sample at regular intervals
    if (this.timeSinceLastSample >= this.sampleInterval) {
      this.timeSinceLastSample = 0;

      // Calculate energies (normalized per unit mass)
      const altitude = state.position.altitude; // meters
      const velocity = state.getVelocityMagnitude(); // m/s

      // Potential energy per kg: mgh/m = gh
      const pe = this.g * altitude;

      // Kinetic energy per kg: (1/2)mv^2/m = (1/2)v^2
      const ke = 0.5 * velocity * velocity;

      // Total specific energy
      const te = pe + ke;

      // Store values
      const currentTime = this.timestamps.length > 0
        ? this.timestamps[this.timestamps.length - 1] + this.sampleInterval
        : 0;

      this.potentialEnergy.push(pe);
      this.kineticEnergy.push(ke);
      this.totalEnergy.push(te);
      this.timestamps.push(currentTime);

      // Limit array size
      if (this.potentialEnergy.length > this.maxSamples) {
        this.potentialEnergy.shift();
        this.kineticEnergy.shift();
        this.totalEnergy.shift();
        this.timestamps.shift();
      }
    }
  }

  // Draw the energy diagram
  draw(state) {
    if (this.potentialEnergy.length < 2) {
      // Not enough data yet
      return;
    }

    const ctx = this.chart.ctx;
    const canvasWidth = this.chart.canvas.width;
    const canvasHeight = this.chart.canvas.height;

    // Position at bottom of screen
    const diagramY = canvasHeight - this.height - 10;
    const diagramX = this.margin.left;
    const diagramWidth = canvasWidth - this.margin.left - this.margin.right;
    const plotHeight = this.height - this.margin.top - this.margin.bottom;

    ctx.save();

    // Calculate Y-axis scale (auto-scaling based on visible range)
    const allValues = [...this.totalEnergy, ...this.potentialEnergy, ...this.kineticEnergy];
    const minEnergy = Math.min(...allValues);
    const maxEnergy = Math.max(...allValues);
    const energyRange = maxEnergy - minEnergy;
    const padding = energyRange * 0.1; // 10% padding

    const yMin = minEnergy - padding;
    const yMax = maxEnergy + padding;
    let yRange = yMax - yMin;

    // Prevent division by zero when all values are identical
    if (yRange < 0.1) {
      yRange = 0.1; // Minimum range to prevent NaN
    }

    // Helper function to convert energy value to Y coordinate
    const energyToY = (energy) => {
      const normalized = (energy - yMin) / yRange;
      return diagramY + this.margin.top + plotHeight - (normalized * plotHeight);
    };

    // Helper function to convert sample index to X coordinate
    const indexToX = (index) => {
      const normalized = index / (this.maxSamples - 1);
      return diagramX + (normalized * diagramWidth);
    };

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 0.5;
    const numGridLines = 5;
    for (let i = 0; i <= numGridLines; i++) {
      const y = diagramY + this.margin.top + (i / numGridLines) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(diagramX, y);
      ctx.lineTo(diagramX + diagramWidth, y);
      ctx.stroke();
    }

    // Draw zero reference line if in range
    if (yMin <= 0 && yMax >= 0) {
      const zeroY = energyToY(0);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(diagramX, zeroY);
      ctx.lineTo(diagramX + diagramWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw energy lines
    const drawLine = (dataArray, color, lineWidth = 1) => {
      if (dataArray.length < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      dataArray.forEach((value, i) => {
        const x = indexToX(i);
        const y = energyToY(value);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    };

    // Draw lines (back to front)
    drawLine(this.totalEnergy, '#000000', 1); // Total - black
    drawLine(this.potentialEnergy, '#4488dd', 1); // Potential - blue
    drawLine(this.kineticEnergy, '#dd4444', 1); // Kinetic - red

    // Draw Y-axis labels
    ctx.fillStyle = '#000000';
    ctx.font = '8px "B612 Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numGridLines; i++) {
      const y = diagramY + this.margin.top + (i / numGridLines) * plotHeight;
      const energyValue = yMin + ((numGridLines - i) / numGridLines) * yRange;
      const label = (energyValue / 1000).toFixed(1) + 'k'; // Show in kJ/kg
      ctx.fillText(label, diagramX - 5, y);
    }

    // Draw legend
    const legendX = diagramX + diagramWidth - 250;
    const legendY = diagramY + this.margin.top + 5;
    const legendSpacing = 80;

    ctx.font = '8px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Total energy
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 5);
    ctx.lineTo(legendX + 20, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.fillText('TOTAL', legendX + 25, legendY);

    // Potential energy
    ctx.strokeStyle = '#4488dd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(legendX + legendSpacing, legendY + 5);
    ctx.lineTo(legendX + legendSpacing + 20, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = '#4488dd';
    ctx.fillText('PE', legendX + legendSpacing + 25, legendY);

    // Kinetic energy
    ctx.strokeStyle = '#dd4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(legendX + legendSpacing * 2, legendY + 5);
    ctx.lineTo(legendX + legendSpacing * 2 + 20, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = '#dd4444';
    ctx.fillText('KE', legendX + legendSpacing * 2 + 25, legendY);

    // Title
    ctx.fillStyle = '#000000';
    ctx.font = '9px "B612 Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENERGY TREND (J/kg)', diagramX, diagramY + this.margin.top + 5);

    // Current values (bottom right)
    const currentPE = this.potentialEnergy[this.potentialEnergy.length - 1];
    const currentKE = this.kineticEnergy[this.kineticEnergy.length - 1];
    const currentTE = this.totalEnergy[this.totalEnergy.length - 1];

    ctx.font = '8px "B612 Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#000000';
    const valueX = diagramX + diagramWidth;
    const valueY = diagramY + this.height - 8;
    ctx.fillText(
      `PE: ${(currentPE/1000).toFixed(1)}k  KE: ${(currentKE/1000).toFixed(1)}k  TOT: ${(currentTE/1000).toFixed(1)}k`,
      valueX,
      valueY
    );

    ctx.restore();
  }

  // Reset energy history
  reset() {
    this.potentialEnergy = [];
    this.kineticEnergy = [];
    this.totalEnergy = [];
    this.timestamps = [];
    this.timeSinceLastSample = 0;
  }
}
