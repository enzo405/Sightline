// Music theory helpers: note names, keys, scales, chords.

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToName(midi: number, preferFlats = false): string {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

// French solfège note names (Do Ré Mi Fa Sol La Si), for display.
const SOLFEGE_SHARP = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const SOLFEGE_FLAT = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

/** French solfège name with octave, e.g. "Do4", "Si♭3". */
export function midiToNameFr(midi: number, preferFlats = false): string {
  const names = preferFlats ? SOLFEGE_FLAT : SOLFEGE_SHARP;
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** French tonic for a key-signature name, e.g. "Bb" -> "Si♭". */
export function keyNameFr(key: string): string {
  const info = KEYS[key];
  const pc = info ? info.scale[0] : 0;
  const names = info?.preferFlats ? SOLFEGE_FLAT : SOLFEGE_SHARP;
  return names[pc];
}

/** Localize a chord symbol's root to French solfège, keeping the quality
 *  suffix, e.g. "Gm7" -> "Sol m7", "Fmaj7" -> "Fa maj7". */
export function chordSymbolFr(symbol: string): string {
  const m = symbol.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return symbol;
  const names = m[1].includes('b') ? SOLFEGE_FLAT : SOLFEGE_SHARP;
  return names[PC[m[1]]] + m[2];
}

/** VexFlow key string like "c#/4" or "eb/3". */
export function midiToVexKey(midi: number, preferFlats = false): string {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const name = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name.toLowerCase() + '/' + octave;
}

export interface KeyInfo {
  name: string;           // VexFlow key signature name, e.g. "Bb"
  preferFlats: boolean;
  scale: number[];        // pitch classes of the major scale
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

function majorScale(rootPc: number): number[] {
  return MAJOR_STEPS.map((s) => (rootPc + s) % 12);
}

export const KEYS: Record<string, KeyInfo> = {
  C:  { name: 'C',  preferFlats: false, scale: majorScale(0) },
  G:  { name: 'G',  preferFlats: false, scale: majorScale(7) },
  D:  { name: 'D',  preferFlats: false, scale: majorScale(2) },
  A:  { name: 'A',  preferFlats: false, scale: majorScale(9) },
  E:  { name: 'E',  preferFlats: false, scale: majorScale(4) },
  F:  { name: 'F',  preferFlats: true,  scale: majorScale(5) },
  Bb: { name: 'Bb', preferFlats: true,  scale: majorScale(10) },
  Eb: { name: 'Eb', preferFlats: true,  scale: majorScale(3) },
  Ab: { name: 'Ab', preferFlats: true,  scale: majorScale(8) },
};

/** Chord symbol -> pitch classes + a scale that fits, for the Improv Lab. */
export interface ChordInfo {
  symbol: string;
  rootPc: number;
  tones: number[];  // pitch classes of chord tones
  scale: number[];  // pitch classes of a scale that fits
}

const PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6,
  Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const CHORD_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
};

// Scale used over each chord quality (relative to chord root).
const CHORD_SCALES: Record<string, number[]> = {
  '': [0, 2, 4, 5, 7, 9, 11],        // major
  maj7: [0, 2, 4, 5, 7, 9, 11],
  m: [0, 2, 3, 5, 7, 8, 10],         // natural minor
  m7: [0, 2, 3, 5, 7, 9, 10],        // dorian
  '7': [0, 2, 4, 5, 7, 9, 10],       // mixolydian
  dim: [0, 2, 3, 5, 6, 8, 9, 11],
};

export function parseChord(symbol: string): ChordInfo {
  const m = symbol.match(/^([A-G][#b]?)(maj7|m7|dim|m|7)?$/);
  if (!m) throw new Error('Unknown chord symbol: ' + symbol);
  const rootPc = PC[m[1]];
  const quality = m[2] ?? '';
  const tones = CHORD_INTERVALS[quality].map((i) => (rootPc + i) % 12);
  const scale = CHORD_SCALES[quality].map((i) => (rootPc + i) % 12);
  return { symbol, rootPc, tones, scale };
}

export function midiFromPc(pc: number, octave: number): number {
  return (octave + 1) * 12 + pc;
}

/** "E4" / "F#3" / "Bb2" -> midi */
export function nameToMidi(name: string): number {
  const m = name.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!m) throw new Error('Bad note name: ' + name);
  return (Number(m[2]) + 1) * 12 + PC[m[1]];
}
