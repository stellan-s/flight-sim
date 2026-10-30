# MCP setup

The simulator includes a local Model Context Protocol (MCP) server. It serves
the game, exposes a Streamable HTTP MCP endpoint, and relays commands to the
visible browser tab. The browser owns the physics state; the MCP process does
not run a separate hidden simulation.

## Requirements

- Node.js 20 or newer
- npm 10 or newer (included with current Node.js installers)
- Git
- A modern Chromium, Firefox, or Safari browser
- An AI client that supports MCP over Streamable HTTP

## Install

```bash
git clone https://github.com/stellan-s/flight-sim.git
cd flight-sim
npm ci
```

`npm ci` installs the exact dependency versions in `package-lock.json`.

## Start the complete simulator

```bash
npm start
```

Open <http://127.0.0.1:3005>. Keep both the terminal process and browser tab
open while using MCP. The endpoints are:

| Purpose | URL |
| --- | --- |
| Simulator | `http://127.0.0.1:3005/` |
| MCP | `http://127.0.0.1:3005/mcp` |
| Health check | `http://127.0.0.1:3005/health` |

The server binds only to `127.0.0.1`; it is not exposed to the local network.

## Connect an AI client

The repository contains two ready-made project configurations:

- `.mcp.json` is the portable configuration used by Claude Code and compatible
  GitHub Copilot clients.
- `.cursor/mcp.json` is Cursor's project configuration.

Both point to the local endpoint at `http://127.0.0.1:3005/mcp`. Start the
simulator before opening or refreshing the AI client. Review and approve the
server when the client asks; an MCP server can read and control the running
simulation.

### Codex

Register the running HTTP endpoint once:

```bash
codex mcp add flight-sim --url http://127.0.0.1:3005/mcp
```

Verify the registration:

```bash
codex mcp list
```

Start a new Codex chat after adding the server if the tools do not appear in an
already-open chat. The simulator browser tab must be open before live tools can
read or change the aircraft.

Official reference: [Codex MCP documentation](https://developers.openai.com/codex/mcp/).

### Claude Code

Claude Code discovers the checked-in `.mcp.json` when it is opened in this
repository. Run `claude`, trust the workspace, and approve `flight-sim` when
prompted. Check the connection from inside Claude Code with `/mcp`, or from a
terminal with:

```bash
claude mcp get flight-sim
```

To register the same endpoint manually instead of using the project file:

```bash
claude mcp add --transport http flight-sim http://127.0.0.1:3005/mcp
```

Official reference: [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Cursor

Cursor discovers `.cursor/mcp.json` when the repository is open. Restart Cursor
after the first `npm start`, open **Customize > MCPs**, and enable `flight-sim`.
The same server can be made available in every project by copying the entry to
`~/.cursor/mcp.json`.

Official reference: [Cursor MCP documentation](https://cursor.com/docs/mcp).

### VS Code with GitHub Copilot

Use the graphical setup so the configuration is stored in the scope supported
by the installed VS Code version:

1. Open the Command Palette and run **MCP: Add Server**.
2. Choose **HTTP (HTTP or Server-Sent Events)**.
3. Enter `http://127.0.0.1:3005/mcp`.
4. Name the server `flight-sim` and choose a workspace or personal scope.
5. Open Copilot Chat, enable the `flight-sim` tools, and approve the server.

Recent Copilot clients can also discover the checked-in portable `.mcp.json`.
If it is not listed, use the guided flow above.

Official reference: [VS Code MCP setup](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

### Any other MCP client

Create a Streamable HTTP server entry named `flight-sim` with this URL:

```text
http://127.0.0.1:3005/mcp
```

No command, API key, environment variable, or authentication header is needed.
The equivalent portable JSON is:

```json
{
  "mcpServers": {
    "flight-sim": {
      "type": "http",
      "url": "http://127.0.0.1:3005/mcp"
    }
  }
}
```

Some clients infer the transport from `url` and reject the `type` property. In
that case, remove only `"type": "http"`; do not change the URL.

## Typical instructor workflow

1. Start the server with `npm start`.
2. Open <http://127.0.0.1:3005> and leave the tab running.
3. Ask the AI client to call `get_flight_state` with the flight-sim tools.
4. Use `show_instruction` for a short instruction inside the simulator.
5. Use high-level commands such as `hold_heading`, `hold_altitude`, or
   `fly_to_waypoint`; their control loops run continuously inside the game.
6. Return control with `set_control_owner` set to `human`. Moving a human flight
   control also disconnects the instructor or autopilot automatically.
7. Use `flight_recorder` to inspect or export the timestamped flight record.

## Available MCP capabilities

The server exposes 26 tools, five JSON resources, and two reusable prompts.
Important groups include:

- State: `get_flight_state`, `get_force_vectors`, `get_navigation_state`
- Configuration: `get_configuration`, `set_simulator_parameter`, `set_display`
- Scenarios: `load_scenario`, `pause_flight`, `resume_flight`, `reset_flight`
- Autopilot: `hold_heading`, `hold_altitude`, `hold_airspeed`,
  `fly_to_waypoint`, `join_pattern`, `fly_approach`
- Instruction: `show_instruction`, `set_control_owner`, `set_controls`
- Recording: `flight_recorder`, `get_landing_history`

Use `get_flight_state` before issuing control instructions. Prefer the
high-level autopilot tools over repeatedly sending raw elevator or aileron
values across the network.

## Browser-only mode

MCP is optional. To run only the static simulator on port 8765, Python 3 is
required:

```bash
npm run web
```

Then open <http://127.0.0.1:8765>.

## Change the MCP port

If port 3005 is already occupied:

```bash
FLIGHT_SIM_MCP_PORT=3010 npm start
```

Open `http://127.0.0.1:3010` and register
`http://127.0.0.1:3010/mcp` in the AI client. The checked-in client files still
point to port 3005, so update or override their URL too. On PowerShell:

```powershell
$env:FLIGHT_SIM_MCP_PORT=3010
npm start
```

Only one server process can listen on a port. An `EADDRINUSE` error means
another process is already using the selected port.

## Verify the installation

Run all deterministic flight tests and syntax checks:

```bash
npm run check
```

With the server running, verify its health in a second terminal:

```bash
curl http://127.0.0.1:3005/health
```

A connected game reports `"ok":true` and `"connected":true`.

## Troubleshooting

- **MCP says no game is connected:** open the simulator URL and wait for the
  runway view to appear.
- **The game is connected but tools are missing:** restart the AI client after
  registering the endpoint and confirm that `flight-sim` is enabled.
- **`EADDRINUSE` on port 3005:** stop the older simulator process or choose a
  different port as shown above.
- **The aircraft stops when the tab is hidden:** reload the current version;
  physics uses a Web Worker to continue background timing.
- **A command is immediately disconnected:** keyboard flight input intentionally
  hands control back to the human pilot.
