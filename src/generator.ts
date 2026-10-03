// Sight-reading exercise generator. Difficulty level 1..10 controls key
// signatures, range, leap size, rhythm vocabulary, rests, accidentals,
// and exercise length.

import { Dur, Measure, Score } from './notation';
import { KEYS } from './theory';

export interface Exercise {
  score: Score;
  level: number;
  key: string;
  clef: 'treble' | 'bass';
}

const KEYS_BY_LEVEL: string[][] = [
  ['C'], ['C'], ['C', 'G', 'F'], ['C', 'G', 'F', 'D', 'Bb'],
  ['G', 'F', 'D', 'Bb', 'A', 'Eb'], ['D', 'Bb', 'A', 'Eb', 'E', 'Ab'],
  ['D', 'A', 'Eb', 'E', 'Ab'], ['A', 'E', 'Eb', 'Ab'], ['A', 'E', 'Eb', 'Ab'], ['E', 'Ab', 'A', 'Eb'],
];

interface RhythmChoice { dur: Dur; weight: number; rest?: boolean }

function rhythmPool(level: number): RhythmChoice[] {
  const pool: RhythmChoice[] = [
    { dur: 'q', weight: 10 },
    { dur: 'h', weight: level <= 3 ? 6 : 3 },
    { dur: 'w', weight: level <= 3 ? 2 : 0.5 },
  ];
  if (level >= 2) pool.push({ dur: '8', weight: level >= 4 ? 10 : 5 });
  if (level >= 4) pool.push({ dur: 'qd', weight: 3 });
  if (level >= 5) pool.push({ dur: 'q', weight: 2, rest: true });
  if (level >= 6) pool.push({ dur: '8', weight: 2, rest: true });
  if (level >= 7) pool.push({ dur: 'hd', weight: 1.5 });
  return pool;
}

function pick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.weight; if (r <= 0) return i; }
  return items[items.length - 1];
}

const DUR_BEATS_LOCAL: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, hd: 3, qd: 1.5 };

export function generateExercise(level: number, clef: 'treble' | 'bass'): Exercise {
  level = Math.min(10, Math.max(1, Math.round(level)));
  const keyName = KEYS_BY_LEVEL[level - 1][Math.floor(Math.random() * KEYS_BY_LEVEL[level - 1].length)];
  const keyInfo = KEYS[keyName];
  const nMeasures = level <= 4 ? 4 : level <= 7 ? 6 : 8;
  const maxLeap = Math.min(7, 1 + Math.ceil(level * 0.8)); // in scale steps
  const accidentalChance = level >= 6 ? 0.05 + (level - 6) * 0.015 : 0;

  // Build the diatonic ladder across the playable range for this clef.
  const [lo, hi] = clef === 'treble'
    ? [60 - Math.min(5, level), 79 + Math.min(5, level)]   // around C4..G5, widening
    : [41 - Math.min(5, level), 60 + Math.min(4, level)];  // around F2..C4, widening
  const ladder: number[] = [];
  for (let m = lo; m <= hi; m++) if (keyInfo.scale.includes(m % 12)) ladder.push(m);

  let idx = Math.floor(ladder.length / 2);
  const pool = rhythmPool(level);

  const measures: Measure[] = [];
  for (let mi = 0; mi < nMeasures; mi++) {
    const notes: Measure['treble'] = [];
    let remaining = 4;
    while (remaining > 0.001) {
      const usable = pool.filter((p) => DUR_BEATS_LOCAL[p.dur] <= remaining + 0.001);
      const choice = pick(usable);
      const beats = DUR_BEATS_LOCAL[choice.dur];
      // Never leave an unfillable sliver: with 8ths in every pool from L2 up,
      // any remainder that is a multiple of the smallest pool unit is fine.
      if (choice.rest && notes.length === 0 && mi === 0) continue; // don't open the exercise with a rest
      if (choice.rest) {
        notes.push({ midis: [], dur: choice.dur, rest: true });
      } else {
        const step = Math.round((Math.random() * 2 - 1) * maxLeap);
        idx = Math.min(ladder.length - 1, Math.max(0, idx + (step === 0 ? (Math.random() < 0.5 ? -1 : 1) : step)));
        let midi = ladder[idx];
        if (Math.random() < accidentalChance) {
          midi += Math.random() < 0.5 ? 1 : -1;
        }
        notes.push({ midis: [midi], dur: choice.dur });
      }
      remaining -= beats;
    }
    measures.push({ treble: notes });
  }

  return { score: { measures, key: keyName, clef }, level, key: keyName, clef };
}
