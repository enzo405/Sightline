// Randomly generated finger études for Fading Score training.
// Each étude strings together one-measure figures whose fingering is correct
// by construction (no awkward crossings), so the generated material always
// trains real right-hand technique: five-finger patterns, broken chords,
// Alberti figures, weak-finger independence, trills, and — in hard mode —
// octave scale runs with the thumb-under crossing.

import { Dur, Measure, Score, ScoreNote } from './notation';
import { nameToMidi } from './theory';

// White-key (C major) ladder, C4 -> C6. A figure at ladder index i uses the
// finger given by its pattern; indices never leave this range.
const LADDER = [
  'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
  'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6',
];

interface Figure {
  offs: number[];     // diatonic offsets from the position base
  fingers: number[];  // finger per note (1..5), matched to offs
  dur: Dur;           // note value (eighths fill 8, quarters fill 4)
}

// --- five-finger figures (within a fixed hand position, no crossing) ---
const WAVE: Figure = { offs: [0, 1, 2, 3, 4, 3, 2, 1], fingers: [1, 2, 3, 4, 5, 4, 3, 2], dur: '8' };
const THIRDS: Figure = { offs: [0, 2, 1, 3, 2, 4, 3, 4], fingers: [1, 3, 2, 4, 3, 5, 4, 5], dur: '8' };
const WEAK: Figure = { offs: [0, 3, 2, 4, 3, 1, 2, 0], fingers: [1, 4, 3, 5, 4, 2, 3, 1], dur: '8' };
const QUARTERS_UP: Figure = { offs: [0, 1, 2, 3], fingers: [1, 2, 3, 4], dur: 'q' };
const QUARTERS_ARP: Figure = { offs: [0, 2, 4, 2], fingers: [1, 3, 5, 3], dur: 'q' };

// --- chordal figures (span a fifth or an octave) ---
const ALBERTI: Figure = { offs: [0, 4, 2, 4, 0, 4, 2, 4], fingers: [1, 5, 3, 5, 1, 5, 3, 5], dur: '8' };
const BROKEN_TRIAD: Figure = { offs: [0, 2, 4, 7, 7, 4, 2, 0], fingers: [1, 2, 3, 5, 5, 3, 2, 1], dur: '8' };

// --- technique figures (thumb-under scale, weak-finger trills) ---
const SCALE_UP: Figure = { offs: [0, 1, 2, 3, 4, 5, 6, 7], fingers: [1, 2, 3, 1, 2, 3, 4, 5], dur: '8' };
const SCALE_DOWN: Figure = { offs: [7, 6, 5, 4, 3, 2, 1, 0], fingers: [5, 4, 3, 2, 1, 3, 2, 1], dur: '8' };
const TRILL_34: Figure = { offs: [2, 3, 2, 3, 2, 3, 2, 3], fingers: [3, 4, 3, 4, 3, 4, 3, 4], dur: '8' };
const TRILL_45: Figure = { offs: [3, 4, 3, 4, 3, 4, 3, 4], fingers: [4, 5, 4, 5, 4, 5, 4, 5], dur: '8' };

const EASY_POOL: Figure[] = [WAVE, THIRDS, ALBERTI, BROKEN_TRIAD, QUARTERS_UP, QUARTERS_ARP];
const HARD_POOL: Figure[] = [SCALE_UP, SCALE_DOWN, WAVE, THIRDS, WEAK, ALBERTI, BROKEN_TRIAD, TRILL_34, TRILL_45];

export const ETUDE_IDS = ['etude-easy', 'etude-hard'] as const;

export function isEtude(id: string): boolean {
  return id === 'etude-easy' || id === 'etude-hard';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function figureMeasure(base: number, fig: Figure): Measure {
  const treble: ScoreNote[] = fig.offs.map((o, i) => ({
    midis: [nameToMidi(LADDER[base + o])],
    dur: fig.dur,
    finger: String(fig.fingers[i]),
  }));
  return { treble };
}

/** A fresh 8-measure étude. Same key/measure count every time so the Fading
 *  Score fade stages (which hide measures by index) stay consistent. */
export function generateEtude(id: string): Score {
  const hard = id === 'etude-hard';
  // Pick one hand position for the whole étude so it stays physically playable;
  // the chosen base keeps every figure within the C4..C6 ladder.
  const base = hard ? pick([0, 7]) : 0;
  const pool = hard ? HARD_POOL : EASY_POOL;
  const fits = (f: Figure) => base + Math.max(...f.offs) <= LADDER.length - 1;
  const usable = pool.filter(fits);

  const measures: Measure[] = [];
  let prev: Figure | null = null;
  for (let m = 0; m < 7; m++) {
    const choices = usable.filter((f) => f !== prev);
    const fig = pick(choices.length ? choices : usable);
    measures.push(figureMeasure(base, fig));
    prev = fig;
  }
  // Resolve on a held tonic.
  measures.push({ treble: [{ midis: [nameToMidi(LADDER[base])], dur: 'w', finger: '1' }] });
  return { measures, key: 'C' };
}
