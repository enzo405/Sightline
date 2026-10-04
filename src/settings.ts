// Persisted user settings (localStorage) with change subscriptions.
// Keep this tiny and serializable — one JSON blob under a single key.

export interface Settings {
  pianoSound: boolean; // play the app's synth for incoming/played notes
  volume: number;      // master volume, 0..1
}

const STORE_KEY = 'sightline.settings';
const DEFAULTS: Settings = { pianoSound: true, volume: 0.9 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        pianoSound: typeof parsed.pianoSound === 'boolean' ? parsed.pianoSound : DEFAULTS.pianoSound,
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { ...DEFAULTS };
}

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable (private mode) — keep running in-memory */
  }
  for (const fn of [...listeners]) fn(current);
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Restore all preferences to defaults and forget stored settings. */
export function resetSettings(): void {
  current = { ...DEFAULTS };
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage blocked */ }
  for (const fn of [...listeners]) fn(current);
}
