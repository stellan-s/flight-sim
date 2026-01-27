/**
 * Filename: vor.js
 * Purpose: VOR (VHF Omnidirectional Range) navigation system
 *
 * VOR Navigation Concepts:
 * - VOR stations broadcast radials (360 magnetic directions from the station)
 * - Aircraft receive radial information to determine bearing FROM station
 * - OBS (Omni-Bearing Selector): Pilot-selectable course to fly
 * - CDI (Course Deviation Indicator): Shows deviation from selected course
 * - TO/FROM: Indicates if flying towards or away from station
 *
 * This implementation provides:
 * - VOR tuning (right-click on chart)
 * - Radial calculation (bearing FROM station)
 * - Course deviation (±10° max)
 * - TO/FROM indication
 * - DME (Distance Measuring Equipment)
 * - Morse code station identification
 *
 * Navigation Data Structure:
 * - vorId: Selected VOR identifier (e.g., "ABC")
 * - frequency: VOR frequency (e.g., "113.5")
 * - radial: Current radial FROM station (0-359°)
 * - distance: DME distance in nautical miles
 * - obs: Selected course (OBS setting)
 * - cdi: { deflection: -10 to +10, toFrom: 'TO'|'FROM'|'OFF' }
 */

import { MorseCodePlayer } from '../audio/morse.js';

export class VORNavigation {
  constructor(chartFeatures) {
    this.chartFeatures = chartFeatures;
    this.selectedVOR = null;
    this.selectedCourse = 0; // Desired course (radial inbound)
    this.obs = 0; // OBS setting (0-359 degrees)
    this.morsePlayer = new MorseCodePlayer();
  }

  // Select VOR station by ID
  selectVOR(vorId) {
    if (!this.chartFeatures || !this.chartFeatures.vors) return false;

    const vor = this.chartFeatures.vors.find(v => v.id === vorId);
    if (vor) {
      this.selectedVOR = vor;
      console.log(`VOR tuned: ${vor.id} (${vor.name}) ${vor.frequency}`);

      // Play morse code identifier
      this.morsePlayer.playMorse(vor.id);

      return true;
    }
    return false;
  }

  // Select VOR by clicking on chart
  selectVORByPosition(lat, lon, tolerance = 0.005) {
    if (!this.chartFeatures || !this.chartFeatures.vors) return false;

    for (const vor of this.chartFeatures.vors) {
      const dlat = Math.abs(vor.lat - lat);
      const dlon = Math.abs(vor.lon - lon);
      if (dlat < tolerance && dlon < tolerance) {
        this.selectVOR(vor.id);
        return true;
      }
    }
    return false;
  }

  // Set OBS (Omni-Bearing Selector) - the course you want to track
  setOBS(course) {
    this.obs = ((course % 360) + 360) % 360;
  }

  // Calculate bearing from aircraft to VOR (degrees)
  getBearingToVOR(aircraftLat, aircraftLon) {
    if (!this.selectedVOR) return null;

    const lat1 = aircraftLat * Math.PI / 180;
    const lat2 = this.selectedVOR.lat * Math.PI / 180;
    const dLon = (this.selectedVOR.lon - aircraftLon) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  }

  // Calculate distance to VOR (nautical miles)
  getDistanceToVOR(aircraftLat, aircraftLon) {
    if (!this.selectedVOR) return null;

    const lat1 = aircraftLat * Math.PI / 180;
    const lat2 = this.selectedVOR.lat * Math.PI / 180;
    const dLat = lat2 - lat1;
    const dLon = (this.selectedVOR.lon - aircraftLon) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const R = 3440.065; // Earth radius in nautical miles
    return R * c;
  }

  // Calculate radial FROM VOR (reciprocal of bearing TO VOR)
  getRadialFromVOR(aircraftLat, aircraftLon) {
    const bearingTo = this.getBearingToVOR(aircraftLat, aircraftLon);
    if (bearingTo === null) return null;

    return (bearingTo + 180) % 360;
  }

  // Calculate CDI deflection in degrees (±10° full scale)
  // Returns: { deflection: number, toFrom: 'TO'|'FROM'|'OFF' }
  getCDIDeflection(aircraftLat, aircraftLon) {
    if (!this.selectedVOR) return { deflection: 0, toFrom: 'OFF' };

    const bearingTo = this.getBearingToVOR(aircraftLat, aircraftLon);
    if (bearingTo === null) return { deflection: 0, toFrom: 'OFF' };

    // Calculate angular difference between OBS and bearing to VOR
    let courseDiff = this.obs - bearingTo;

    // Normalize to -180 to +180
    while (courseDiff > 180) courseDiff -= 360;
    while (courseDiff < -180) courseDiff += 360;

    // Determine TO/FROM flag
    let toFrom;
    if (Math.abs(courseDiff) < 90) {
      toFrom = 'TO';
    } else {
      toFrom = 'FROM';
      courseDiff = courseDiff > 0 ? courseDiff - 180 : courseDiff + 180;
    }

    // CDI deflection (positive = right of course, negative = left of course)
    // Full scale deflection at ±10°
    const deflection = Math.max(-10, Math.min(10, -courseDiff));

    return { deflection, toFrom };
  }

  // Get navigation data for display
  getNavigationData(aircraftLat, aircraftLon) {
    if (!this.selectedVOR) {
      return {
        vorId: null,
        vorName: null,
        frequency: null,
        bearing: null,
        radial: null,
        distance: null,
        obs: this.obs,
        cdi: { deflection: 0, toFrom: 'OFF' }
      };
    }

    return {
      vorId: this.selectedVOR.id,
      vorName: this.selectedVOR.name,
      frequency: this.selectedVOR.frequency,
      bearing: this.getBearingToVOR(aircraftLat, aircraftLon),
      radial: this.getRadialFromVOR(aircraftLat, aircraftLon),
      distance: this.getDistanceToVOR(aircraftLat, aircraftLon),
      obs: this.obs,
      cdi: this.getCDIDeflection(aircraftLat, aircraftLon)
    };
  }
}
