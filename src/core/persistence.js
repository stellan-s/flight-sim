const AUTOSAVE_KEY = 'flight-sim:autosave:v1';
const PRESETS_KEY = 'flight-sim:presets:v1';
const HISTORY_KEY = 'flight-sim:landing-history:v1';
const EXPORT_FORMAT = 'flight-sim-configuration';
const VERSION = 1;

const INPUT_KEYS = [
  'pitchRate', 'rollRate', 'rudderRate', 'throttleRate', 'trimRate',
  'elevatorReturnRate', 'aileronReturnRate', 'rudderReturnRate',
  'elevatorAirborneReturnRate',
  'trimMin', 'trimMax', 'elevatorTrim'
];

const WIND_KEYS = [
  'baseDirection', 'baseSpeed', 'directionVariation', 'speedVariation',
  'changeRate', 'verticalWind'
];

const ENERGY_KEYS = [
  'maxSamples', 'sampleInterval', 'referenceMass', 'g', 'height'
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function primitiveProperties(source) {
  return Object.fromEntries(Object.entries(source ?? {}).filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value) &&
    (typeof value !== 'number' || Number.isFinite(value))
  ));
}

function selectedProperties(source, keys) {
  return Object.fromEntries(keys
    .filter(key => ['string', 'number', 'boolean'].includes(typeof source?.[key]))
    .map(key => [key, source[key]]));
}

function applyKnownProperties(target, values) {
  if (!target || !values) return;
  for (const [key, value] of Object.entries(values)) {
    if (!(key in target)) continue;
    const expectedType = typeof target[key];
    if (typeof value !== expectedType) continue;
    if (expectedType === 'number' && !Number.isFinite(value)) continue;
    target[key] = value;
  }
}

export class PersistenceManager {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.autoSave = true;
    this.profileName = 'default';
    this.elapsed = 0;
    this.interval = 1;
    this.lastSerialized = '';
    this.lastError = '';
  }

  read(key, fallback) {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      this.lastError = error.message;
      return fallback;
    }
  }

  write(key, value) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
      this.lastError = '';
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  capture(simulator) {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      config: primitiveProperties(simulator.config),
      specs: primitiveProperties(simulator.specs),
      input: selectedProperties(simulator.input, INPUT_KEYS),
      wind: selectedProperties(simulator.wind, WIND_KEYS),
      display: {
        theme: simulator.chart?.theme,
        zoom: simulator.chart?.zoom,
        rotationMode: simulator.chart?.rotationMode,
        vectorMode: simulator.vectors?.vectorMode
      },
      energy: {
        ...selectedProperties(simulator.energyDiagram, ENERGY_KEYS),
        margin: clone(simulator.energyDiagram?.margin)
      },
      features: clone(simulator.chartFeatures),
      persistence: {
        autoSave: this.autoSave,
        profileName: this.profileName
      }
    };
  }

  apply(simulator, snapshot, { features = true } = {}) {
    if (!snapshot || snapshot.version !== VERSION) return false;

    applyKnownProperties(simulator.config, snapshot.config);
    applyKnownProperties(simulator.specs, snapshot.specs);
    applyKnownProperties(simulator.input, snapshot.input);
    applyKnownProperties(simulator.wind, snapshot.wind);

    if (snapshot.wind) {
      simulator.wind.setBaseWind(
        simulator.wind.baseDirection,
        simulator.wind.baseSpeed
      );
      simulator.wind.windDown = simulator.wind.verticalWind;
    }

    if (snapshot.display) {
      if (typeof snapshot.display.theme === 'string') {
        simulator.chart?.setTheme(snapshot.display.theme);
      }
      if (Number.isFinite(snapshot.display.zoom)) {
        simulator.chart?.setZoom(snapshot.display.zoom);
      }
      if (['north-up', 'track-up'].includes(snapshot.display.rotationMode)) {
        simulator.chart?.setRotationMode(snapshot.display.rotationMode);
      }
      if (['all', 'energy', 'nav'].includes(snapshot.display.vectorMode)) {
        simulator.vectors.vectorMode = snapshot.display.vectorMode;
      }
    }

    applyKnownProperties(simulator.energyDiagram, snapshot.energy);
    applyKnownProperties(simulator.energyDiagram?.margin, snapshot.energy?.margin);

    if (features && snapshot.features) {
      simulator.chartFeatures = clone(snapshot.features);
    }

    if (snapshot.persistence) {
      if (typeof snapshot.persistence.autoSave === 'boolean') {
        this.autoSave = snapshot.persistence.autoSave;
      }
      if (typeof snapshot.persistence.profileName === 'string') {
        this.profileName = snapshot.persistence.profileName;
      }
    }
    return true;
  }

  loadAutosave() {
    return this.read(AUTOSAVE_KEY, null);
  }

  saveAutosave(simulator, { force = false } = {}) {
    if (!this.autoSave && !force) return false;
    const snapshot = this.capture(simulator);
    const signature = JSON.stringify({ ...snapshot, savedAt: null });
    if (!force && signature === this.lastSerialized) return true;
    const saved = this.write(AUTOSAVE_KEY, snapshot);
    if (saved) this.lastSerialized = signature;
    return saved;
  }

  update(simulator, dt) {
    if (!this.autoSave) return;
    this.elapsed += dt;
    if (this.elapsed < this.interval) return;
    this.elapsed = 0;
    this.saveAutosave(simulator);
  }

  clearAutosave() {
    try {
      this.storage?.removeItem(AUTOSAVE_KEY);
      this.lastSerialized = '';
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }

  getPresets() {
    return this.read(PRESETS_KEY, {});
  }

  getPresetNames() {
    return Object.keys(this.getPresets()).sort((a, b) => a.localeCompare(b));
  }

  savePreset(name, simulator) {
    const cleanName = String(name ?? '').trim().slice(0, 48);
    if (!cleanName) throw new Error('Preset name is required');
    const presets = this.getPresets();
    this.profileName = cleanName;
    presets[cleanName] = this.capture(simulator);
    if (!this.write(PRESETS_KEY, presets)) throw new Error(this.lastError || 'Could not save preset');
    return cleanName;
  }

  loadPreset(name) {
    const cleanName = String(name ?? '').trim();
    const snapshot = this.getPresets()[cleanName];
    if (!snapshot) throw new Error(`Preset not found: ${cleanName || '(blank)'}`);
    this.profileName = cleanName;
    return clone(snapshot);
  }

  deletePreset(name) {
    const cleanName = String(name ?? '').trim();
    const presets = this.getPresets();
    if (!presets[cleanName]) return false;
    delete presets[cleanName];
    return this.write(PRESETS_KEY, presets);
  }

  exportJSON(simulator) {
    return JSON.stringify({
      format: EXPORT_FORMAT,
      version: VERSION,
      snapshot: this.capture(simulator)
    }, null, 2);
  }

  importJSON(text) {
    const payload = JSON.parse(text);
    if (payload?.format !== EXPORT_FORMAT || payload?.version !== VERSION || !payload.snapshot) {
      throw new Error('Unsupported flight simulator configuration file');
    }
    return clone(payload.snapshot);
  }

  download(simulator, documentRef = globalThis.document) {
    const json = this.exportJSON(simulator);
    if (!documentRef || typeof Blob === 'undefined' || typeof URL === 'undefined') return json;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = `flight-sim-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return json;
  }

  requestImport(documentRef = globalThis.document) {
    if (!documentRef) return Promise.reject(new Error('File picker is unavailable'));
    return new Promise((resolve, reject) => {
      const input = documentRef.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', async () => {
        try {
          const file = input.files?.[0];
          if (!file) return reject(new Error('No file selected'));
          if (file.size > 2_000_000) return reject(new Error('Configuration file is too large'));
          resolve(this.importJSON(await file.text()));
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      input.click();
    });
  }

  getLandingHistory() {
    return this.read(HISTORY_KEY, []);
  }

  recordLanding(report, flightTimeSeconds = 0) {
    const history = this.getLandingHistory();
    history.unshift({
      ...clone(report),
      flightTimeSeconds: Number(flightTimeSeconds.toFixed(1)),
      recordedAt: new Date().toISOString()
    });
    history.length = Math.min(history.length, 50);
    this.write(HISTORY_KEY, history);
    return history[0];
  }

  clearLandingHistory() {
    try {
      this.storage?.removeItem(HISTORY_KEY);
      return true;
    } catch (error) {
      this.lastError = error.message;
      return false;
    }
  }
}

export const PERSISTENCE_KEYS = Object.freeze({
  autosave: AUTOSAVE_KEY,
  presets: PRESETS_KEY,
  history: HISTORY_KEY
});
