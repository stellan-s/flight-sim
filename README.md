# Flight Simulator

A 6DOF (Six Degrees of Freedom) flight simulator featuring realistic physics, VOR navigation, and professional aviation chart rendering.

## Features

- **Realistic Flight Dynamics**: Cessna 172 Skyhawk with authentic aerodynamics
  - 6DOF physics simulation with RK4 integration
  - Accurate lift, drag, and thrust calculations
  - Realistic control surfaces (elevator, aileron, rudder)
  - Elevator trim for hands-off flight

- **VOR Navigation**: Complete radio navigation system
  - Multiple VOR stations with realistic placement
  - DME (Distance Measuring Equipment) arcs
  - Radial visualization and course guidance
  - Morse code station identifiers with audio playback

- **Aviation Chart Rendering**: Professional-style navigation charts
  - Black and white Jeppesen-inspired design
  - Airport symbols with runway diagrams
  - Traffic pattern visualization (left/right patterns)
  - Obstacle markers
  - North-up and track-up modes

- **Dynamic Wind Model**: Realistic wind effects
  - Time-varying wind direction and speed
  - Wind velocity vectors displayed on chart
  - Groundspeed and drift calculations

- **Force Vector Visualization**: Educational display of flight forces
  - Lift, drag, thrust, and weight vectors
  - Velocity, wind, and ground track vectors
  - Color-coded indicators (green=climbing, red=descending)

- **Flight Instruments**: Essential flight displays
  - Attitude indicator with horizon line
  - State vector panel with pitch, AOA, roll
  - Flight timer and controls display

## Project Structure

```
flight-sim/
├── index.html           # Main HTML file
├── README.md           # This file
├── data/
│   └── chart-features.json   # VORs, airports, obstacles
└── src/
    ├── main.js                # Entry point and game loop
    ├── config.js              # Configuration constants
    ├── core/                  # Physics simulation
    │   ├── aircraft.js        # Aircraft state and specs
    │   ├── physics.js         # 6DOF physics engine (RK4)
    │   └── forces.js          # Aerodynamic calculations
    ├── navigation/            # Navigation systems
    │   ├── vor.js            # VOR navigation logic
    │   └── wind.js           # Dynamic wind model
    ├── controls/             # User input
    │   └── input.js          # Keyboard/mouse handler
    ├── audio/                # Sound systems
    │   └── morse.js          # Morse code player
    ├── rendering/            # Visualization
    │   ├── chart.js          # Navigation chart rendering
    │   ├── instruments.js    # Flight instruments
    │   └── vectors.js        # Force/velocity vectors
    └── utils/                # Shared utilities
        ├── logger.js         # Debug logging
        ├── constants.js      # Physical constants
        ├── coordinates.js    # Frame transformations
        └── morse-data.js     # Morse code table
```

## Controls

### Flight Controls
- **Arrow Keys**: Pitch and roll control
  - ↑/↓: Elevator (pitch up/down)
  - ←/→: Aileron (roll left/right)
- **A/D**: Rudder (yaw left/right)
- **W/S**: Throttle (increase/decrease)
- **Page Up/Down**: Elevator trim

### Navigation
- **Right-click on VOR**: Tune VOR station (plays morse code)
- **Q/E**: Adjust OBS course ±10°

### View Controls
- **Mouse Wheel**: Zoom in/out
- **N/T**: Toggle map mode (North-up / Track-up)
- **Mouse Drag**: Pan the map

### Simulation
- **P / Space**: Pause/resume simulation
- **H / ?**: Show help panel (if implemented)

## Coordinate Systems

The simulator uses two primary coordinate systems:

### Earth Frame (NED - North-East-Down)
- **North**: Points towards true north
- **East**: Points towards east
- **Down**: Points towards center of earth
- Used for: Wind, navigation, chart display

### Body Frame
- **X**: Points forward (nose)
- **Y**: Points right (starboard wing)
- **Z**: Points down (through aircraft floor)
- Used for: Aerodynamic forces, control surfaces

Transformations between frames are handled in `src/utils/coordinates.js`.

## Configuration

All tunable parameters are in `src/config.js`:

- **Physics**: Timestep, initial conditions
- **Rendering**: Zoom levels, scales, UI positions
- **Visualization**: Force vector scales, colors
- **Debug**: Enable/disable logging

Example modifications:
```javascript
// Change initial conditions
INITIAL_ALTITUDE: 8000,  // Start at 8000 ft
INITIAL_SPEED: 120,      // Start at 120 knots

// Adjust force vector visibility
FORCE_VECTOR_SCALE: 0.03,  // Larger arrows

// Enable debug mode
DEBUG_MODE: true,
```

## Adding New Features

### Adding a New Airport

Edit `data/chart-features.json`:
```json
{
  "id": "KNEW",
  "name": "New Airport",
  "lat": 0.5,
  "lon": 0.5,
  "elevation": 2000,
  "runways": [
    {
      "id": "27/09",
      "heading": 270,
      "length": 5000,
      "width": 100,
      "surfaceType": "asphalt",
      "trafficPattern": {
        "side": "left",
        "altitude": 1000,
        "distance": 0.8
      }
    }
  ]
}
```

### Adding a New VOR Station

Edit `data/chart-features.json`:
```json
{
  "id": "NEW",
  "name": "New VOR",
  "lat": 0.3,
  "lon": -0.3,
  "frequency": "117.5"
}
```

The simulator will automatically:
- Display the VOR on the chart
- Enable right-click tuning
- Play morse code identification

### Modifying Physics

Key files:
- `src/core/forces.js`: Lift, drag, thrust calculations
- `src/core/aircraft.js`: Aircraft specifications (weight, wing area, etc.)
- `src/core/physics.js`: RK4 integration, state updates

### Adding New Instruments

1. Create rendering method in `src/rendering/instruments.js`
2. Call from `main.js` render loop
3. Access aircraft state via `state` parameter

## Development Tips

### Debug Mode

Enable in `src/config.js`:
```javascript
DEBUG_MODE: true,
```

Or toggle at runtime by modifying `main.js` to accept keyboard input.

### Understanding the Physics

The simulator uses:
- **RK4 Integration**: Fourth-order Runge-Kutta for accuracy
- **Body Frame Forces**: All aerodynamic forces calculated in aircraft body frame
- **State Vector**: [u, v, w, p, q, r, lat, lon, alt, φ, θ, ψ]
  - u, v, w: Velocity components (body frame)
  - p, q, r: Angular rates (body frame)
  - φ, θ, ψ: Roll, pitch, yaw (Euler angles)

### Common Modifications

**Change aircraft model**: Edit `src/core/aircraft.js` (mass, wing area, coefficients)

**Adjust wind**: Modify `src/navigation/wind.js` or change initial conditions in `main.js`

**Customize chart appearance**: Edit rendering methods in `src/rendering/chart.js`

**Add new force vectors**: Extend `src/rendering/vectors.js`

## Known Limitations

- No terrain elevation (flat earth approximation)
- Simplified aerodynamic model (no ground effect, wake turbulence)
- No weather beyond wind (no thermals, clouds)
- Limited instrumentation (no full glass cockpit)

## Future Enhancements

Potential additions:
- Real map data (OpenStreetMap, FAA sectional charts)
- Multiple aircraft models
- ILS approach guidance
- ATC communication simulation
- Multiplayer capability
- Weather system (turbulence, icing)
- Engine failures and emergencies

## Technical Details

- **Language**: JavaScript (ES6 modules)
- **Rendering**: HTML5 Canvas 2D
- **Audio**: Web Audio API (morse code)
- **Physics**: Custom 6DOF implementation
- **No external dependencies**: Vanilla JavaScript

## License

This is a personal educational project. Feel free to modify and extend for learning purposes.

## Credits

Created as a flight simulation learning project featuring:
- Realistic Cessna 172 physics
- Professional aviation chart styling
- Educational force visualization
- Complete VOR navigation system

---

For questions or issues, refer to the code comments and JSDoc documentation throughout the source files.
