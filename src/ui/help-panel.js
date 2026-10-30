const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toAscii = value => String(value)
  .replace(/[—–]/g, '-')
  .replace(/±/g, '+/-')
  .replace(/°/g, 'deg')
  .replace(/[↑↓]/g, match => match === '↑' ? 'UP' : 'DN')
  .replace(/[←→]/g, match => match === '←' ? 'LT' : 'RT')
  .replace(/[^ -~]/g, '?');

function wrapText(value, width) {
  const text = toAscii(value).trim();
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class HelpPanel {
  constructor(simulator) {
    this.simulator = simulator;
    this.activeSection = 'FLIGHT CONTROLS';
  }

  getSections() {
    return [
      {
        label: 'FLIGHT CONTROLS',
        entries: [
          ['UP / DOWN', 'Pitch down / pitch up'],
          ['LEFT / RIGHT', 'Bank left / right'],
          ['A / D', 'Rudder left / right'],
          ['W / S', 'Throttle up / down'],
          ['B', 'Hold wheel brakes'],
          ['F', 'Cycle flaps 0 / 10 / 20 / 30 deg'],
          ['PGUP / PGDN', 'Elevator trim nose down / nose up'],
          ['HOME', 'Reset elevator trim']
        ]
      },
      {
        label: 'NAVIGATION',
        entries: [
          ['RIGHT CLICK', 'Tune the VOR under the pointer'],
          ['Q / E', 'Adjust OBS course by 10 deg'],
          ['L', 'Cycle direct-to airports'],
          ['SHIFT + L', 'Clear direct-to airport'],
          ['I', 'Show or hide ILS localizer / glideslope'],
          ['N / T', 'North-up / track-up chart'],
          ['MOUSE WHEEL', 'Zoom chart'],
          ['1 / 2 / 3 / 4', 'Zoom presets']
        ]
      },
      {
        label: 'ILS APPROACH',
        paragraphs: [
          'ILS means Instrument Landing System. Select an airport with L. The active runway is chosen from the wind and its threshold drives both needles.',
          'The dashed vertical localizer line gives lateral steering: fly toward the line. The dotted horizontal glideslope line gives vertical steering: fly toward the line.',
          'The center ticks show half-scale and full-scale deflection. Green guidance means captured; I toggles the full-screen layer.'
        ]
      },
      {
        label: 'DISPLAY / SYSTEM',
        entries: [
          ['P / SPACE', 'Pause or resume simulation'],
          ['H / ?', 'Open or close this manual'],
          ['C / ENTER', 'Open the full configuration terminal'],
          ['V', 'Cycle vector display modes'],
          ['SCROLL', 'Mouse wheel, arrows, PgUp/PgDn, Home/End']
        ]
      },
      {
        label: 'STALL / SPIN',
        paragraphs: [
          'The stall warning uses angle of attack, not airspeed. Buffet and wing drop increase as the stall deepens.',
          'For spin recovery: throttle idle, elevator forward to reduce angle of attack, then hold rudder opposite the indicated spin direction. Level the wings after rotation stops.',
          'The audible horn unlocks after the first keyboard or pointer input and mutes while paused or inside settings.'
        ]
      },
      {
        label: 'VOR BASICS',
        paragraphs: [
          'VOR means VHF Omnidirectional Range. A station transmits 360 radials extending outward from the beacon.',
          'OBS means Omni-Bearing Selector. Set it to the course you want to fly. DME reports slant-range distance in nautical miles.'
        ]
      },
      {
        label: 'VOR SETUP',
        steps: [
          ['TUNE', 'Right-click a VOR on the chart. Its identifier, frequency, bearing and CDI appear.'],
          ['SET OBS', 'Use Q/E to select the desired inbound course or outbound radial.'],
          ['INTERCEPT', 'Turn 30-45 deg toward the selected course for a controlled capture.']
        ]
      },
      {
        label: 'CDI / TRACKING',
        paragraphs: [
          'The CDI needle shows left/right course deviation. Each dot is 2 deg and full scale is 10 deg.',
          'Needle left: correct left. Needle right: correct right. Centered needle means the selected course is captured.',
          'TO means the selected course leads toward the station. FROM means it leads away. Apply a small wind correction to keep the needle centered.'
        ]
      },
      {
        label: 'VOR PROCEDURES',
        entries: [
          ['INBOUND', 'Set the course to the station, confirm TO, then center the CDI'],
          ['OUTBOUND', 'Set the desired radial, confirm FROM, then center the CDI'],
          ['CROSS RADIAL', 'Use two station radials to estimate position'],
          ['DME ARC', 'Fly a curved track while holding constant DME']
        ]
      }
    ];
  }

  buildRows(sections, width) {
    const rows = [];
    const starts = [];
    const innerWidth = Math.max(12, width - 4);
    const keyWidth = clamp(Math.floor(innerWidth * 0.25), 10, 20);

    for (const section of sections) {
      starts.push(rows.length);
      const token = `--[ ${section.label} ]`;
      rows.push({
        text: `${token}${'-'.repeat(Math.max(0, width - token.length - 1))}`,
        kind: 'heading'
      });

      for (const [key, description] of section.entries ?? []) {
        const descriptionWidth = Math.max(8, innerWidth - keyWidth - 1);
        const wrapped = wrapText(description, descriptionWidth);
        wrapped.forEach((line, index) => {
          const keyText = index === 0 ? `[${toAscii(key)}]` : '';
          rows.push({
            text: `  ${keyText.padEnd(keyWidth, '.')} ${line}`,
            kind: index === 0 ? 'key' : 'text'
          });
        });
      }

      for (const paragraph of section.paragraphs ?? []) {
        for (const line of wrapText(paragraph, innerWidth - 2)) {
          rows.push({ text: `  ${line}`, kind: 'text' });
        }
        rows.push({ text: '', kind: 'blank' });
      }

      for (const [step, description] of section.steps ?? []) {
        const prefix = `[${toAscii(step)}] `;
        const wrapped = wrapText(description, innerWidth - prefix.length);
        wrapped.forEach((line, index) => {
          rows.push({
            text: `  ${index === 0 ? prefix : ' '.repeat(prefix.length)}${line}`,
            kind: index === 0 ? 'key' : 'text'
          });
        });
        rows.push({ text: '', kind: 'blank' });
      }

      rows.push({ text: '', kind: 'blank' });
    }

    return { rows, starts };
  }

  draw(ctx, canvas) {
    if (!this.simulator.showHelp) return;

    const width = canvas.width;
    const height = canvas.height;
    const fontSize = width < 760 ? 10 : 12;
    const lineHeight = width < 760 ? 18 : 22;
    const fontFamily = '"Courier New", Courier, monospace';
    const palette = this.simulator.chart.palette;
    const colors = {
      background: palette.background,
      text: palette.foreground,
      bright: palette.heading,
      dim: palette.muted,
      faint: palette.gridLabel,
      accent: palette.accent
    };

    ctx.save();
    ctx.font = `400 ${fontSize}px ${fontFamily}`;
    const charWidth = ctx.measureText('M').width;
    const totalColumns = Math.max(44, Math.floor((width - 32) / charWidth));
    const topicColumns = clamp(Math.floor(totalColumns * 0.25), 21, 32);
    const contentColumns = totalColumns - topicColumns - 3;
    const totalRows = Math.max(18, Math.floor((height - 18) / lineHeight));
    const bodyStartRow = 6;
    const footerRow = totalRows - 4;
    const visibleRows = Math.max(3, footerRow - bodyStartRow);
    const left = Math.round((width - totalColumns * charWidth) / 2);
    const top = Math.round((height - totalRows * lineHeight) / 2);
    const entrance = clamp((performance.now() - (this.simulator.helpOpenedAt ?? 0)) / 150, 0, 1);

    const fit = (value, columns) => {
      const text = toAscii(value);
      if (text.length <= columns) return text;
      return columns <= 3 ? text.slice(0, columns) : `${text.slice(0, columns - 3)}...`;
    };
    const pad = (value, columns) => fit(value, columns).padEnd(columns, ' ');
    const drawAt = (row, column, value, color = colors.text, bold = false, alpha = entrance) => {
      ctx.globalAlpha = alpha;
      ctx.font = `${bold ? 700 : 400} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(fit(value, totalColumns - column), left + column * charWidth, top + (row + 0.78) * lineHeight);
    };
    const fullBorder = label => {
      const prefix = label ? `+-- ${toAscii(label)} ` : '+';
      return `${prefix}${'-'.repeat(Math.max(0, totalColumns - prefix.length - 1))}+`;
    };
    const splitBorder = () => `+${'-'.repeat(topicColumns)}+${'-'.repeat(contentColumns)}+`;
    const splitRow = (topic = '', content = '') =>
      `|${pad(topic, topicColumns)}|${pad(content, contentColumns)}|`;
    const terminalRow = value => `|${pad(value, totalColumns - 2)}|`;

    const sections = this.getSections();
    const { rows, starts } = this.buildRows(sections, contentColumns);
    const contentHeight = rows.length * lineHeight;
    const viewportHeight = visibleRows * lineHeight;
    const maxScroll = Math.max(0, contentHeight - viewportHeight);
    this.simulator.helpScrollOffset = clamp(this.simulator.helpScrollOffset, 0, maxScroll);
    const currentRow = Math.floor(
      (this.simulator.helpScrollOffset + viewportHeight * 0.45) / lineHeight
    );
    let activeIndex = 0;
    starts.forEach((start, index) => {
      if (start <= currentRow) activeIndex = index;
    });
    if (maxScroll > 0 && this.simulator.helpScrollOffset >= maxScroll - 1) {
      activeIndex = sections.length - 1;
    }
    this.activeSection = sections[activeIndex].label;

    ctx.globalAlpha = entrance;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    drawAt(0, 0, fullBorder('C172 OPERATIONS MANUAL / HELP'), colors.accent, true);
    drawAt(1, 0, terminalRow(
      `HELP BUS: ONLINE  |  MODE: REFERENCE  |  SIM: ${this.simulator.paused ? 'PAUSED' : 'RUNNING'}  |  TOPIC ${String(activeIndex + 1).padStart(2, '0')}/${String(sections.length).padStart(2, '0')}`
    ), colors.bright);
    drawAt(2, 0, splitBorder(), colors.dim);
    drawAt(3, 0, splitRow('MANUAL TOPICS', `${this.activeSection}  [SCROLL ${Math.round(this.simulator.helpScrollOffset)}]`), colors.bright, true);
    drawAt(4, 0, splitRow(
      `SHOWING 1-${sections.length}`,
      'Aircraft controls, flight-envelope recovery and radio navigation.'
    ), colors.dim);
    drawAt(5, 0, splitBorder(), colors.dim);

    for (let row = 0; row < visibleRows; row++) {
      drawAt(bodyStartRow + row, 0, splitRow('', ''), colors.faint);
    }

    sections.forEach((section, index) => {
      if (index >= visibleRows) return;
      const selected = index === activeIndex;
      const label = `${selected ? '>' : ' '}[${String(index + 1).padStart(2, '0')}] ${section.label}`;
      drawAt(bodyStartRow + index, 1, pad(label, topicColumns),
        selected ? colors.accent : colors.text, selected);
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      left + (topicColumns + 1) * charWidth,
      top + bodyStartRow * lineHeight,
      contentColumns * charWidth,
      viewportHeight
    );
    ctx.clip();
    rows.forEach((row, index) => {
      const displayRow = bodyStartRow + index - this.simulator.helpScrollOffset / lineHeight;
      if (displayRow < bodyStartRow - 1 || displayRow > footerRow) return;
      const sectionIndex = starts.reduce((result, start, candidate) =>
        start <= index ? candidate : result, 0);
      const color = row.kind === 'heading'
        ? (sectionIndex === activeIndex ? colors.accent : colors.dim)
        : row.kind === 'key' ? colors.bright : colors.text;
      drawAt(displayRow, topicColumns + 2, pad(row.text, contentColumns),
        color, row.kind === 'heading' || row.kind === 'key');
    });
    ctx.restore();

    if (maxScroll > 0) {
      const thumbRows = Math.max(2, Math.round(visibleRows * viewportHeight / contentHeight));
      const thumbStart = Math.round(
        (this.simulator.helpScrollOffset / maxScroll) * (visibleRows - thumbRows)
      );
      for (let row = 0; row < visibleRows; row++) {
        const inThumb = row >= thumbStart && row < thumbStart + thumbRows;
        drawAt(bodyStartRow + row, totalColumns - 2, inThumb ? '#' : ':',
          inThumb ? colors.accent : colors.faint, inThumb);
      }
    }

    const scrollPercent = maxScroll > 0
      ? Math.round(this.simulator.helpScrollOffset / maxScroll * 100)
      : 100;
    drawAt(footerRow, 0, splitBorder(), colors.dim);
    drawAt(footerRow + 1, 0, terminalRow(
      `STATUS> ${this.activeSection}  |  SCROLL ${String(scrollPercent).padStart(3, '0')}%`
    ), colors.accent, true);
    drawAt(footerRow + 2, 0, terminalRow(
      'KEYS>   [UP/DN] SCROLL  [PGUP/PGDN] PAGE  [HOME/END] JUMP  [H/?] CLOSE'
    ), colors.text);
    drawAt(footerRow + 3, 0, fullBorder(''), colors.dim);
    ctx.restore();
  }
}
