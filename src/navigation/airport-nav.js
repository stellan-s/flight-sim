/**
 * Airport Navigation System
 *
 * Manages airport selection, active runway determination, and approach guidance.
 * Provides direct-to navigation with distance, bearing, and ETA calculations.
 *
 * Features:
 * - Haversine distance calculation (accurate for distances < 1000 NM)
 * - Forward azimuth bearing calculation
 * - Wind-aware runway selection (selects runway most aligned into wind)
 * - Standard traffic pattern entry recommendations based on approach angle
 *
 * Navigation formulas:
 * - Distance: Haversine formula using Earth radius of 3440.065 NM
 * - Bearing: Forward azimuth from aircraft to airport [0-360°)
 * - Active runway: Minimizes angular difference between runway heading and wind direction
 *
 * @class AirportNavigation
 * @example
 * const airportNav = new AirportNavigation(chartFeatures);
 * airportNav.selectAirport('KJFK');
 * const navData = airportNav.getNavigationData(lat, lon, hdg, gs, windDir);
 */
export class AirportNavigation {
  /**
   * Creates an AirportNavigation instance
   * @param {Object} chartFeatures - Chart features object containing airports array
   * @param {Array} chartFeatures.airports - Array of airport objects
   */
  constructor(chartFeatures) {
    this.chartFeatures = chartFeatures;
    this.selectedAirport = null;
    this.selectedRunway = null; // Active runway based on wind
  }

  /**
   * Select an airport by ID
   * @param {string} airportId - Airport identifier (e.g., 'KJFK', 'KORD')
   * @returns {Object|null} Airport object if found, null otherwise
   */
  selectAirport(airportId) {
    if (!this.chartFeatures || !this.chartFeatures.airports) {
      return null;
    }

    const airport = this.chartFeatures.airports.find(a => a.id === airportId);
    if (airport) {
      this.selectedAirport = airport;
      this.selectedRunway = null;
      console.log(`Airport selected: ${airport.id} - ${airport.name}`);
      return airport;
    }

    return null;
  }

  /**
   * Clear selected airport and runway
   */
  clearSelection() {
    this.selectedAirport = null;
    this.selectedRunway = null;
    console.log('Airport selection cleared');
  }

  /**
   * Get nearest airport to current position
   * @param {number} lat - Current latitude in degrees
   * @param {number} lon - Current longitude in degrees
   * @param {number} [maxDistance=50] - Maximum search radius in nautical miles
   * @returns {Object|null} Nearest airport object within maxDistance, or null if none found
   */
  getNearestAirport(lat, lon, maxDistance = 50) {
    if (!this.chartFeatures || !this.chartFeatures.airports) {
      return null;
    }

    let nearest = null;
    let minDistance = maxDistance;

    this.chartFeatures.airports.forEach(airport => {
      const distance = this.calculateDistance(lat, lon, airport.lat, airport.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = airport;
      }
    });

    return nearest;
  }

  /**
   * Get airports sorted by distance from current position
   * @param {number} lat - Current latitude in degrees
   * @param {number} lon - Current longitude in degrees
   * @param {number} [maxDistance=100] - Maximum search radius in nautical miles
   * @returns {Array<{airport: Object, distance: number}>} Array of objects containing airport and distance, sorted by distance (nearest first)
   */
  getAirportsByDistance(lat, lon, maxDistance = 100) {
    if (!this.chartFeatures || !this.chartFeatures.airports) {
      return [];
    }

    const airportsWithDistance = this.chartFeatures.airports.map(airport => ({
      airport,
      distance: this.calculateDistance(lat, lon, airport.lat, airport.lon)
    }));

    return airportsWithDistance
      .filter(a => a.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Cycle to next nearest airport
   *
   * If no airport is selected, selects the nearest.
   * If an airport is selected, selects the next nearest in the list.
   * Wraps around to nearest when reaching the end of list.
   *
   * @param {number} currentLat - Current latitude in degrees
   * @param {number} currentLon - Current longitude in degrees
   * @returns {Object|null} Newly selected airport object, or null if no airports within 100 NM
   */
  cycleToNextAirport(currentLat, currentLon) {
    const nearby = this.getAirportsByDistance(currentLat, currentLon, 100);
    if (nearby.length === 0) return null;

    if (!this.selectedAirport) {
      // Select nearest
      this.selectedAirport = nearby[0].airport;
      this.selectedRunway = null;
      return this.selectedAirport;
    }

    // Find current in list and select next
    const currentIndex = nearby.findIndex(a => a.airport.id === this.selectedAirport.id);
    if (currentIndex === -1) {
      // Current not in list, select nearest
      this.selectedAirport = nearby[0].airport;
    } else {
      // Select next (wrap around)
      const nextIndex = (currentIndex + 1) % nearby.length;
      this.selectedAirport = nearby[nextIndex].airport;
    }
    this.selectedRunway = null;

    // Safely get distance for logging
    const found = nearby.find(a => a.airport.id === this.selectedAirport.id);
    const distStr = found ? found.distance.toFixed(1) : 'N/A';
    console.log(`Switched to: ${this.selectedAirport.id} (${distStr} NM)`);
    return this.selectedAirport;
  }

  /**
   * Calculate distance in nautical miles using Haversine formula
   *
   * Haversine formula: a = sin²(Δφ/2) + cos(φ1)⋅cos(φ2)⋅sin²(Δλ/2)
   *                    c = 2⋅atan2(√a, √(1−a))
   *                    d = R⋅c
   *
   * Accurate for distances < 1000 NM. Uses Earth radius of 3440.065 NM.
   *
   * @param {number} lat1 - Starting latitude in degrees
   * @param {number} lon1 - Starting longitude in degrees
   * @param {number} lat2 - Ending latitude in degrees
   * @param {number} lon2 - Ending longitude in degrees
   * @returns {number} Distance in nautical miles
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // Earth radius in NM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate forward azimuth bearing in degrees
   *
   * Returns the initial bearing from point 1 to point 2 (forward azimuth).
   * Result is normalized to [0-360°) where 0°=North, 90°=East, 180°=South, 270°=West.
   *
   * Formula: θ = atan2(sin(Δλ)⋅cos(φ2), cos(φ1)⋅sin(φ2) − sin(φ1)⋅cos(φ2)⋅cos(Δλ))
   *
   * @param {number} lat1 - Starting latitude in degrees
   * @param {number} lon1 - Starting longitude in degrees
   * @param {number} lat2 - Ending latitude in degrees
   * @param {number} lon2 - Ending longitude in degrees
   * @returns {number} Bearing in degrees [0-360°)
   */
  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;

    return (bearing + 360) % 360;
  }

  /**
   * Determine active runway based on wind direction
   *
   * Selects the runway most aligned with landing INTO the wind.
   * Considers both runway directions (e.g., 27 and 09 for same physical runway).
   *
   * Algorithm:
   * 1. For each runway, calculate angular difference between runway heading and wind direction
   * 2. Also calculate difference for reciprocal heading (opposite end)
   * 3. Select runway with minimum angular difference
   *
   * Updates this.selectedRunway with the result.
   *
   * @param {Object} airport - Airport object containing runways array
   * @param {Array} airport.runways - Array of runway objects with heading property
   * @param {number} windDirection - Wind direction in degrees [0-360°)
   * @returns {Object|null} Active runway object, or null if airport has no runways
   */
  determineActiveRunway(airport, windDirection) {
    if (!airport.runways || airport.runways.length === 0) {
      return null;
    }

    // Find the specific runway end most aligned with the wind.
    let bestSelection = null;
    let bestScore = Infinity;

    airport.runways.forEach(runway => {
      const primaryHeading = this.normalizeHeading(runway.heading);
      const reciprocalHeading = this.normalizeHeading(primaryHeading + 180);
      const candidates = [
        { heading: primaryHeading, reciprocal: false },
        { heading: reciprocalHeading, reciprocal: true }
      ];

      candidates.forEach(candidate => {
        const score = this.angularDifference(candidate.heading, windDirection);
        if (score < bestScore) {
          bestScore = score;
          bestSelection = { runway, ...candidate };
        }
      });
    });

    const { runway, heading, reciprocal } = bestSelection;
    const runwayEnds = runway.id.split('/');
    const runwayEndId = runwayEnds[reciprocal ? 1 : 0] ||
      this.headingToRunwayNumber(heading);
    const trafficPattern = runway.trafficPattern
      ? {
          ...runway.trafficPattern,
          side: reciprocal
            ? this.oppositePatternSide(runway.trafficPattern.side)
            : runway.trafficPattern.side
        }
      : undefined;

    this.selectedRunway = {
      ...runway,
      id: runwayEndId,
      physicalRunwayId: runway.id,
      heading,
      reciprocal,
      trafficPattern
    };
    return this.selectedRunway;
  }

  normalizeHeading(heading) {
    return ((heading % 360) + 360) % 360;
  }

  angularDifference(firstHeading, secondHeading) {
    const first = this.normalizeHeading(firstHeading);
    const second = this.normalizeHeading(secondHeading);
    return Math.abs(((first - second + 540) % 360) - 180);
  }

  headingToRunwayNumber(heading) {
    const runwayNumber = Math.round(this.normalizeHeading(heading) / 10) || 36;
    return runwayNumber.toString().padStart(2, '0');
  }

  oppositePatternSide(side) {
    if (side === 'left') return 'right';
    if (side === 'right') return 'left';
    return side;
  }

  /**
   * Recommend pattern entry based on aircraft position
   *
   * Determines the recommended traffic pattern entry type based on:
   * - Aircraft position relative to airport
   * - Runway heading
   * - Traffic pattern side (left or right)
   *
   * Entry types:
   * - 'STRAIGHT-IN': Approaching aligned with final approach course (±45°)
   * - 'UPWIND ENTRY': Approaching from departure end (135-225° relative)
   * - '45° TO DOWNWIND': Approaching from non-pattern side
   * - 'CROSSWIND ENTRY': Approaching from pattern side
   *
   * @param {number} aircraftLat - Aircraft latitude in degrees
   * @param {number} aircraftLon - Aircraft longitude in degrees
   * @param {number} aircraftHeading - Aircraft heading in degrees [0-360°)
   * @param {Object} airport - Airport object with lat/lon properties
   * @param {Object} runway - Runway object with heading and trafficPattern properties
   * @returns {string} Recommended entry type
   */
  getRecommendedEntry(aircraftLat, aircraftLon, aircraftHeading, airport, runway) {
    if (!runway) return 'STRAIGHT-IN';

    // Calculate bearing from aircraft to airport
    const bearing = this.calculateBearing(aircraftLat, aircraftLon, airport.lat, airport.lon);

    // Calculate relative angle to runway heading
    const relativeAngle = ((bearing - runway.heading + 360) % 360);
    const headingDifference = this.angularDifference(aircraftHeading, runway.heading);

    // Determine recommended entry
    // Standard entries:
    // - 45° to downwind (if approaching from non-pattern side)
    // - Straight-in (if aligned with final)
    // - Upwind (if approaching from departure end)
    // - Crosswind (if approaching from pattern side)

    const patternSide = runway.trafficPattern?.side || 'left';

    if (relativeAngle >= 135 && relativeAngle <= 225) {
      // Approaching from departure end
      return 'UPWIND ENTRY';
    } else if ((relativeAngle >= 315 || relativeAngle <= 45) &&
               headingDifference <= 45) {
      // Approaching from the approach end and aligned with final
      return 'STRAIGHT-IN';
    } else if (patternSide === 'left' && relativeAngle >= 45 && relativeAngle < 135) {
      // Approaching from right side (45° to downwind for left pattern)
      return '45° TO DOWNWIND';
    } else if (patternSide === 'right' && relativeAngle >= 225 && relativeAngle < 315) {
      // Approaching from left side (45° to downwind for right pattern)
      return '45° TO DOWNWIND';
    } else {
      // Approaching from pattern side
      return 'CROSSWIND ENTRY';
    }
  }

  /**
   * Get comprehensive navigation data for selected airport
   *
   * Computes all navigation information needed for direct-to navigation and approach:
   * - Distance and bearing to airport
   * - ETA based on ground speed
   * - Active runway based on wind
   * - Recommended pattern entry
   * - Pattern altitude
   *
   * Returns null if no airport is selected.
   *
   * @param {number} aircraftLat - Aircraft latitude in degrees
   * @param {number} aircraftLon - Aircraft longitude in degrees
   * @param {number} aircraftHeading - Aircraft heading in degrees [0-360°)
   * @param {number} aircraftGroundSpeed - Ground speed in knots (validated, defaults to 0 if invalid)
   * @param {number} windDirection - Wind direction in degrees [0-360°) (validated, defaults to 0 if invalid)
   * @returns {Object|null} Navigation data object or null if no airport selected
   * @returns {Object} returns.airport - Selected airport object
   * @returns {number} returns.distance - Distance to airport in nautical miles
   * @returns {number} returns.bearing - Bearing to airport in degrees [0-360°)
   * @returns {Object} returns.eta - Estimated time of arrival
   * @returns {number} returns.eta.minutes - ETA minutes component
   * @returns {number} returns.eta.seconds - ETA seconds component
   * @returns {Object|null} returns.activeRunway - Active runway object (null if none)
   * @returns {string|null} returns.recommendedEntry - Recommended entry type (null if no runway)
   * @returns {number} returns.patternAltitude - Traffic pattern altitude in feet (default 1000)
   */
  getNavigationData(aircraftLat, aircraftLon, aircraftHeading, aircraftGroundSpeed, windDirection) {
    if (!this.selectedAirport) {
      return null;
    }

    // Validate inputs
    if (typeof aircraftGroundSpeed !== 'number' || aircraftGroundSpeed < 0) {
      aircraftGroundSpeed = 0; // Safe default
    }
    if (typeof windDirection !== 'number') {
      windDirection = 0; // Safe default
    }

    const distance = this.calculateDistance(aircraftLat, aircraftLon,
                                           this.selectedAirport.lat, this.selectedAirport.lon);
    const bearing = this.calculateBearing(aircraftLat, aircraftLon,
                                         this.selectedAirport.lat, this.selectedAirport.lon);

    // Determine active runway based on wind
    const activeRunway = this.determineActiveRunway(this.selectedAirport, windDirection);

    // Calculate ETA (hours)
    const eta = aircraftGroundSpeed > 10 ? distance / aircraftGroundSpeed : 0;
    const etaMinutes = Math.floor(eta * 60);
    const etaSeconds = Math.floor((eta * 3600) % 60);

    // Get recommended entry
    const recommendedEntry = activeRunway
      ? this.getRecommendedEntry(aircraftLat, aircraftLon, aircraftHeading, this.selectedAirport, activeRunway)
      : null;

    return {
      airport: this.selectedAirport,
      distance,
      bearing,
      eta: { minutes: etaMinutes, seconds: etaSeconds },
      activeRunway,
      recommendedEntry,
      patternAltitude: activeRunway?.trafficPattern?.altitude || 1000
    };
  }
}
