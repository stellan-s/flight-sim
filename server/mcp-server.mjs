#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { WebSocketServer } from 'ws';
import { GameSession } from './game-session.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.FLIGHT_SIM_MCP_PORT ?? '3005', 10);
const game = new GameSession();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function allowedStaticPath(pathname) {
  return pathname === '/index.html' || pathname.startsWith('/src/') || pathname.startsWith('/data/');
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, game: game.status() }));
    return;
  }

  if (url.pathname === '/' && url.searchParams.get('mcp') !== '1') {
    response.writeHead(302, { location: '/?mcp=1' });
    response.end();
    return;
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!allowedStaticPath(pathname)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = join(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}/`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'content-length': fileStat.size,
      'cache-control': 'no-store'
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const httpServer = createHttpServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
  const handler = url.pathname === '/mcp' ? serveMcp : serveStatic;
  handler(request, response).catch(error => {
    console.error('HTTP server error:', error);
    if (!response.headersSent) response.writeHead(500);
    response.end('Internal server error');
  });
});

const webSocketServer = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
  if (url.pathname !== '/mcp-game') {
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, ws => {
    webSocketServer.emit('connection', ws, request);
  });
});
webSocketServer.on('connection', socket => game.attach(socket));

function subsetState(keys) {
  const state = game.requireState();
  return Object.fromEntries(keys.map(key => [key, state[key]]));
}

function success(result) {
  const structuredContent = { result };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent
  };
}

function failure(error) {
  return {
    content: [{
      type: 'text',
      text: error instanceof Error ? error.message : String(error)
    }],
    isError: true
  };
}

function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async args => {
    try {
      return success(await handler(args));
    } catch (error) {
      return failure(error);
    }
  });
}

function createMcpServer() {
  const mcp = new McpServer({
    name: 'vector-flight-simulator',
    version: '1.1.0'
  }, {
    instructions: [
      'This server observes and operates a live browser-based Cessna 172 vector flight simulator.',
      'Read flight state before giving advice or changing the simulation.',
      'Use MCP actions for human-timescale intent and scenarios, not 60 Hz control loops.',
      `The visible game must be open at http://${HOST}:${PORT}/ before live tools can run.`
    ].join(' ')
  });

registerTool(mcp, 'get_flight_state', {
  title: 'Get flight state',
  description: 'Read the complete current aircraft, controls, wind, navigation, ground, envelope, force, moment, and display state.',
  inputSchema: {}
}, () => game.requireState());

registerTool(mcp, 'get_force_vectors', {
  title: 'Get force vectors',
  description: 'Read current aerodynamic forces, moments, aircraft attitude, speed, and flight-envelope state.',
  inputSchema: {}
}, () => subsetState(['aircraft', 'controls', 'forcesNewtons', 'momentsNewtonMeters', 'envelope']));

registerTool(mcp, 'get_navigation_state', {
  title: 'Get navigation state',
  description: 'Read the current position, wind, VOR/CDI, selected airport, active runway, and ground state.',
  inputSchema: {}
}, () => subsetState(['aircraft', 'wind', 'navigation', 'ground']));

registerTool(mcp, 'get_nearby_airports', {
  title: 'Get nearby airports',
  description: 'List airports and runways sorted by distance from the aircraft.',
  inputSchema: {
    maxDistanceNm: z.number().min(1).max(1000).default(100),
    limit: z.number().int().min(1).max(32).default(8)
  }
}, args => game.command('get_nearby_airports', args));

registerTool(mcp, 'get_configuration', {
  title: 'Get simulator configuration',
  description: 'Read all writable primitive simulator, aircraft, input, wind, energy, display, airport, VOR, and obstacle configuration.',
  inputSchema: {}
}, () => game.command('get_configuration'));

registerTool(mcp, 'get_landing_history', {
  title: 'Get landing history',
  description: 'Read recorded landing and crash reports from the browser profile.',
  inputSchema: {}
}, () => game.command('get_landing_history'));

registerTool(mcp, 'pause_flight', {
  title: 'Pause flight',
  description: 'Pause the live simulation without changing aircraft state.',
  inputSchema: {}
}, () => game.command('pause'));

registerTool(mcp, 'resume_flight', {
  title: 'Resume flight',
  description: 'Resume the live simulation.',
  inputSchema: {}
}, () => game.command('resume'));

registerTool(mcp, 'reset_flight', {
  title: 'Reset flight',
  description: 'Reset the simulator to its configured initial flight or runway state.',
  inputSchema: {}
}, () => game.command('reset'));

registerTool(mcp, 'set_controls', {
  title: 'Set flight controls',
  description: 'Take instructor control and set absolute control positions. The values remain owned by MCP until control is returned to the human.',
  inputSchema: {
    elevator: z.number().min(-1).max(1).optional(),
    aileron: z.number().min(-1).max(1).optional(),
    rudder: z.number().min(-1).max(1).optional(),
    throttle: z.number().min(0).max(1).optional(),
    brake: z.number().min(0).max(1).optional(),
    flaps: z.number().min(0).max(1).optional(),
    elevatorTrim: z.number().min(-1).max(1).optional(),
    owner: z.enum(['instructor', 'autopilot']).default('instructor')
  }
}, args => game.command('set_controls', args));

registerTool(mcp, 'set_control_owner', {
  title: 'Set control owner',
  description: 'Assign flight-control ownership. Human input automatically disconnects instructor or autopilot control.',
  inputSchema: {
    owner: z.enum(['human', 'instructor', 'autopilot'])
  }
}, args => game.command('set_control_owner', args));

registerTool(mcp, 'hold_heading', {
  title: 'Hold heading',
  description: 'Run a continuous in-game heading and bank controller toward a target magnetic-style heading.',
  inputSchema: {
    headingDeg: z.number().min(0).max(360),
    maxBankDeg: z.number().min(5).max(35).default(25),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('hold_heading', args));

registerTool(mcp, 'hold_altitude', {
  title: 'Hold altitude',
  description: 'Run a continuous in-game pitch controller toward an altitude in feet MSL.',
  inputSchema: {
    altitudeMslFt: z.number().min(-1000).max(60000),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('hold_altitude', args));

registerTool(mcp, 'hold_airspeed', {
  title: 'Hold airspeed',
  description: 'Run a continuous in-game throttle controller toward indicated airspeed.',
  inputSchema: {
    airspeedKt: z.number().min(45).max(180),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('hold_airspeed', args));

registerTool(mcp, 'fly_to_waypoint', {
  title: 'Fly to waypoint',
  description: 'Continuously guide the aircraft to a latitude/longitude waypoint with optional altitude and airspeed targets.',
  inputSchema: {
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    altitudeMslFt: z.number().min(-1000).max(60000).optional(),
    airspeedKt: z.number().min(45).max(180).optional(),
    captureRadiusNm: z.number().min(0.03).max(5).default(0.15),
    name: z.string().max(40).default('WAYPOINT'),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('fly_to_waypoint', args));

registerTool(mcp, 'join_pattern', {
  title: 'Join traffic pattern',
  description: 'Build and fly a standard pattern-entry route for the selected or named airport.',
  inputSchema: {
    airportId: z.string().max(12).optional(),
    airspeedKt: z.number().min(60).max(120).default(90),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('join_pattern', args));

registerTool(mcp, 'fly_approach', {
  title: 'Fly approach',
  description: 'Build and fly a three-degree final approach to the active runway at the selected or named airport.',
  inputSchema: {
    airportId: z.string().max(12).optional(),
    finalDistanceNm: z.number().min(1).max(12).default(4),
    airspeedKt: z.number().min(60).max(100).default(75),
    thresholdSpeedKt: z.number().min(55).max(85).default(65),
    owner: z.enum(['instructor', 'autopilot']).default('autopilot')
  }
}, args => game.command('fly_approach', args));

registerTool(mcp, 'show_instruction', {
  title: 'Show instructor instruction',
  description: 'Show one short themed ASCII instruction over the simulator so the pilot does not need to return to chat.',
  inputSchema: {
    message: z.string().min(1).max(180),
    level: z.enum(['instruction', 'warning']).default('instruction'),
    durationSeconds: z.number().min(1).max(60).default(8)
  }
}, args => game.command('show_instruction', args));

registerTool(mcp, 'flight_recorder', {
  title: 'Flight recorder',
  description: 'Start, stop, clear, inspect, or export the timestamped deterministic flight recorder.',
  inputSchema: {
    action: z.enum(['status', 'start', 'stop', 'clear', 'export']).default('status')
  }
}, args => game.command('flight_recorder', args));

registerTool(mcp, 'set_wind', {
  title: 'Set wind',
  description: 'Set meteorological wind direction, speed, and optional vertical component.',
  inputSchema: {
    directionDeg: z.number().min(0).max(360),
    speedKt: z.number().min(0).max(200),
    verticalMps: z.number().min(-30).max(30).optional()
  }
}, args => game.command('set_wind', args));

registerTool(mcp, 'select_airport', {
  title: 'Select airport',
  description: 'Select an airport for direct navigation and determine the active runway from current wind.',
  inputSchema: {
    airportId: z.string().min(1).max(12)
  }
}, args => game.command('select_airport', args));

registerTool(mcp, 'tune_vor', {
  title: 'Tune VOR',
  description: 'Tune a VOR station and optionally set the OBS course in degrees.',
  inputSchema: {
    vorId: z.string().min(1).max(12),
    obsDeg: z.number().min(0).max(360).optional()
  }
}, args => game.command('tune_vor', args));

registerTool(mcp, 'set_display', {
  title: 'Set display',
  description: 'Change theme, vector mode, map rotation, zoom, or the full-screen ILS overlay in the live game.',
  inputSchema: {
    theme: z.string().optional(),
    vectorMode: z.enum(['all', 'energy', 'nav']).optional(),
    rotationMode: z.enum(['north-up', 'track-up']).optional(),
    zoom: z.number().positive().optional(),
    ilsOverlayVisible: z.boolean().optional()
  }
}, args => game.command('set_display', args));

registerTool(mcp, 'set_simulator_parameter', {
  title: 'Set simulator parameter',
  description: 'Change one existing primitive runtime parameter. Read get_configuration first to discover valid scope, key, and value type.',
  inputSchema: {
    scope: z.enum(['config', 'aircraft', 'input', 'wind', 'energy']),
    key: z.string().min(1).max(80),
    value: z.union([z.number(), z.string(), z.boolean()])
  }
}, args => game.command('set_parameter', args));

registerTool(mcp, 'load_scenario', {
  title: 'Load flight scenario',
  description: 'Place the aircraft in a trimmed airborne condition or on a runway and optionally set wind. Scenarios pause by default.',
  inputSchema: {
    startMode: z.enum(['airborne', 'runway']).default('airborne'),
    airportId: z.string().optional(),
    runwayEnd: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    altitudeMslFt: z.number().min(-1000).max(60000).optional(),
    iasKt: z.number().min(1).max(400).optional(),
    headingDeg: z.number().min(0).max(360).optional(),
    pitchDeg: z.number().min(-90).max(90).optional(),
    rollDeg: z.number().min(-180).max(180).optional(),
    throttle: z.number().min(0).max(1).optional(),
    flaps: z.number().min(0).max(1).optional(),
    windDirectionDeg: z.number().min(0).max(360).optional(),
    windSpeedKt: z.number().min(0).max(200).optional(),
    paused: z.boolean().default(true)
  }
}, args => game.command('load_scenario', args));

registerTool(mcp, 'advance_simulation', {
  title: 'Advance simulation',
  description: 'Advance an unpaused simulation deterministically by up to 30 seconds.',
  inputSchema: {
    milliseconds: z.number().int().min(1).max(30000)
  }
}, args => game.command('advance', args));

const resources = [
  ['flight-state', 'flight://state', 'Complete live flight state', () => game.requireState()],
  ['flight-forces', 'flight://forces', 'Current force and moment vectors', () => subsetState(['aircraft', 'controls', 'forcesNewtons', 'momentsNewtonMeters', 'envelope'])],
  ['flight-navigation', 'flight://navigation', 'Current VOR, airport, runway, wind, and position data', () => subsetState(['aircraft', 'wind', 'navigation', 'ground'])],
  ['flight-configuration', 'flight://configuration', 'Runtime simulator configuration', () => game.command('get_configuration')],
  ['flight-landings', 'flight://landings', 'Landing history for the current browser profile', () => game.command('get_landing_history')]
];

for (const [name, uri, description, read] of resources) {
  mcp.registerResource(name, uri, {
    title: name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' '),
    description,
    mimeType: 'application/json'
  }, async () => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await read(), null, 2) }]
  }));
}

mcp.registerPrompt('flight-instructor', {
  title: 'Flight instructor',
  description: 'Observe the live flight and coach the pilot using the simulator state and force vectors.',
  argsSchema: {
    focus: z.string().optional().describe('Optional maneuver or skill to focus on')
  }
}, async ({ focus }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Act as a concise Cessna 172 instructor in the vector flight simulator. Read flight://state before every assessment. Explain corrections using the visible force vectors, attitude, airspeed, vertical speed, AGL, and navigation data. Never claim to see scenery because this simulator intentionally has none.${focus ? ` Focus on: ${focus}.` : ''}`
    }
  }]
}));

mcp.registerPrompt('scenario-director', {
  title: 'Scenario director',
  description: 'Create a training scenario, observe it, and debrief the result.',
  argsSchema: {
    objective: z.string().describe('Training objective for the scenario')
  }
}, async ({ objective }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Create a safe simulator training scenario for this objective: ${objective}. Inspect configuration and nearby airports first, load the scenario paused, explain the initial condition, then resume only when requested. Observe the flight and finish with an evidence-based debrief.`
    }
  }]
}));

  return mcp;
}

async function serveMcp(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, {
      'allow': 'POST',
      'content-type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    }));
    return;
  }

  const mcp = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  response.on('close', () => {
    transport.close().catch(() => {});
    mcp.close().catch(() => {});
  });
  await mcp.connect(transport);
  await transport.handleRequest(request, response);
}

async function main() {
  await new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(PORT, HOST, () => {
      httpServer.off('error', rejectListen);
      resolveListen();
    });
  });
  console.error(`Vector Flight Simulator game bridge: http://${HOST}:${PORT}/`);
  console.error(`Vector Flight Simulator MCP endpoint: http://${HOST}:${PORT}/mcp`);
}

async function shutdown() {
  game.rejectPending(new Error('MCP server shutting down'));
  webSocketServer.close();
  await new Promise(resolveClose => httpServer.close(resolveClose));
}

process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));

main().catch(error => {
  console.error('MCP server failed:', error);
  process.exit(1);
});
