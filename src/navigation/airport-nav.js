// Airport navigation and direct-to functionality

export class AirportNavigation {
  constructor(chartFeatures) {
    this.chartFeatures = chartFeatures;
    this.selectedAirport = null;
    this.selectedRunway = null; // Active runway based on wind
  }

  // Select an airport by ID
  selectAirport(airportId) {
    if (!this.chartFeatures || !this.chartFeatures.airports) {
      return null;
    }

    const airport = this.chartFeatures.airports.find(a => a.id === airportId);
    if (airport) {
      this.selectedAirport = airport;
      console.log(`Airport selected: ${airport.id} - ${airport.name}`);
      return airport;
    }

    return null;
  }

  // Clear selected airport
  clearSelection() {
    this.selectedAirport = null;
    this.selectedRunway = null;
    console.log('Airport selection cleared');
  }

  // Get nearest airport to current position
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

  // Get airports sorted by distance
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

  // Cycle to next nearest airport
  cycleToNextAirport(currentLat, currentLon) {
    const nearby = this.getAirportsByDistance(currentLat, currentLon, 100);
    if (nearby.length === 0) return null;

    if (!this.selectedAirport) {
      // Select nearest
      this.selectedAirport = nearby[0].airport;
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

    // Safely get distance for logging
    const found = nearby.find(a => a.airport.id === this.selectedAirport.id);
    const distStr = found ? found.distance.toFixed(1) : 'N/A';
    console.log(`Switched to: ${this.selectedAirport.id} (${distStr} NM)`);
    return this.selectedAirport;
  }

  // Calculate distance in nautical miles
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

  // Calculate bearing in degrees
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

  // Determine active runway based on wind
  determineActiveRunway(airport, windDirection) {
    if (!airport.runways || airport.runways.length === 0) {
      return null;
    }

    // Find runway most aligned with wind (land into the wind)
    let bestRunway = airport.runways[0];
    let bestScore = 999;

    airport.runways.forEach(runway => {
      // Calculate angular difference between runway heading and wind direction
      // We want to land INTO the wind, so runway heading should be close to wind direction
      const diff1 = Math.abs(((runway.heading - windDirection + 180) % 360) - 180);
      const reciprocal = (runway.heading + 180) % 360;
      const diff2 = Math.abs(((reciprocal - windDirection + 180) % 360) - 180);

      const minDiff = Math.min(diff1, diff2);
      if (minDiff < bestScore) {
        bestScore = minDiff;
        bestRunway = runway;
      }
    });

    this.selectedRunway = bestRunway;
    return bestRunway;
  }

  // Recommend pattern entry based on aircraft position
  getRecommendedEntry(aircraftLat, aircraftLon, aircraftHeading, airport, runway) {
    if (!runway) return 'STRAIGHT-IN';

    // Calculate bearing from aircraft to airport
    const bearing = this.calculateBearing(aircraftLat, aircraftLon, airport.lat, airport.lon);

    // Calculate relative angle to runway heading
    const relativeAngle = ((bearing - runway.heading + 360) % 360);

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
    } else if (relativeAngle >= 315 || relativeAngle <= 45) {
      // Approaching from approach end
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

  // Get navigation data for selected airport
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
