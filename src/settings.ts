// Persisted user settings (localStorage) with change subscriptions.
// Keep this tiny and serializable — one JSON blob under a single key.

import type { PianoTone } from './synth';
import type { Difficulty } from './curriculum';

export interface Settings {
  pianoSound: boolean;     // play the app's synth for incoming/played notes
  volume: number;          // master volume, 0..1
  tone: PianoTone;         // piano timbre (grand / dark / lofi)
  difficulty: Difficulty;  // 30-day journey intensity (beginner / standard / advanced)
  viewWidth: number;       // main view width as % of the screen (50..100); 0 = default (capped at 1260px)
}

const STORE_KEY = 'sightline.settings';
const TONES: PianoTone[] = ['grand', 'dark', 'lofi'];
const DIFFICULTIES: Difficulty[] = ['beginner', 'standard', 'advanced'];
const DEFAULTS: Settings = { pianoSound: true, volume: 0.9, tone: 'grand', difficulty: 'standard', viewWidth: 0 };

function clampViewWidth(v: number): number {
  return v === 0 ? 0 : Math.max(50, Math.min(100, Math.round(v)));
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        pianoSound: typeof parsed.pianoSound === 'boolean' ? parsed.pianoSound : DEFAULTS.pianoSound,
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
        tone: parsed.tone && TONES.includes(parsed.tone) ? parsed.tone : DEFAULTS.tone,
        difficulty: parsed.difficulty && DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : DEFAULTS.difficulty,
        viewWidth: typeof parsed.viewWidth === 'number' ? clampViewWidth(parsed.viewWidth) : DEFAULTS.viewWidth,
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
