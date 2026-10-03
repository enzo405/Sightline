// Mirror quantizer: turn raw timed note events into a notated Score.
// The grid anchors on the first note. Notes split at C4 into treble/bass.

import { Dur, Measure, Score, ScoreNote } from './notation';

export interface RawNote {
  midi: number;
  tOn: number;   // ms
  tOff: number;  // ms
}

export interface TimedChord {
  slot: number;
  midis: number[];
  durSlots: number;
}

export interface QuantizeResult {
  score: Score;
  treble: TimedChord[];
  bass: TimedChord[];
  slotMs: number;
  slotsPerMeasure: number;
}

const MAX_MEASURES = 16;

// slots -> duration symbols, per grid resolution
function durTable(slotsPerBeat: number): [number, Dur][] {
  if (slotsPerBeat === 2) {
    return [[8, 'w'], [6, 'hd'], [4, 'h'], [3, 'qd'], [2, 'q'], [1, '8']];
  }
  return [[16, 'w'], [12, 'hd'], [8, 'h'], [6, 'qd'], [4, 'q'], [3, '8d'], [2, '8'], [1, '16']];
}

function decompose(slots: number, table: [number, Dur][]): Dur[] {
  const out: Dur[] = [];
  let left = slots;
  for (const [n, d] of table) {
    while (left >= n) { out.push(d); left -= n; }
  }
  return out;
}

function groupChords(notes: RawNote[], t0: number, slotMs: number, maxSlots: number): TimedChord[] {
  const bySlot = new Map<number, { midis: Set<number>; durSlots: number }>();
  for (const n of notes) {
    const slot = Math.round((n.tOn - t0) / slotMs);
    if (slot >= maxSlots) continue;
    const durSlots = Math.max(1, Math.round((n.tOff - n.tOn) / slotMs));
    const entry = bySlot.get(slot) ?? { midis: new Set(), durSlots: 1 };
    entry.midis.add(n.midi);
    entry.durSlots = Math.max(entry.durSlots, durSlots);
    bySlot.set(slot, entry);
  }
  const chords = [...bySlot.entries()]
    .map(([slot, e]) => ({ slot, midis: [...e.midis].sort((a, b) => a - b), durSlots: e.durSlots }))
    .sort((a, b) => a.slot - b.slot);
  // truncate durations at the next onset and at the recording cap
  for (let i = 0; i < chords.length; i++) {
    const next = chords[i + 1];
    if (next) chords[i].durSlots = Math.min(chords[i].durSlots, next.slot - chords[i].slot);
    chords[i].durSlots = Math.min(chords[i].durSlots, maxSlots - chords[i].slot);
  }
  return chords;
}

/** Lay chords on the grid: rests for gaps, ties across barlines. */
function buildStave(chords: TimedChord[], spm: number, table: [number, Dur][], totalMeasures: number): ScoreNote[][] {
  const measures: ScoreNote[][] = Array.from({ length: totalMeasures }, () => []);

  const emit = (start: number, len: number, midis: number[] | null) => {
    let pos = start;
    let left = len;
    while (left > 0) {
      const mIdx = Math.floor(pos / spm);
      if (mIdx >= totalMeasures) break;
      const roomInMeasure = spm - (pos % spm);
      const chunk = Math.min(left, roomInMeasure);
      const parts = decompose(chunk, table);
      parts.forEach((dur, pi) => {
        const isLastPart = pi === parts.length - 1;
        const moreToCome = left - chunk > 0;
        if (midis) {
          measures[mIdx].push({ midis: [...midis], dur, tieToNext: !isLastPart || moreToCome });
        } else {
          measures[mIdx].push({ midis: [], dur, rest: true });
        }
      });
      pos += chunk;
      left -= chunk;
    }
  };

  let cursor = 0;
  for (const c of chords) {
    if (c.slot > cursor) emit(cursor, c.slot - cursor, null);
    emit(c.slot, Math.max(1, c.durSlots), c.midis);
    cursor = c.slot + Math.max(1, c.durSlots);
  }
  if (cursor < totalMeasures * spm) emit(cursor, totalMeasures * spm - cursor, null);

  // a fully empty measure becomes a whole rest
  for (let i = 0; i < totalMeasures; i++) {
    if (measures[i].length === 0) measures[i].push({ midis: [], dur: 'w', rest: true });
  }
  return measures;
}

export function quantize(notes: RawNote[], bpm: number, grid: '8' | '16'): QuantizeResult | null {
  if (notes.length === 0) return null;
  const slotsPerBeat = grid === '8' ? 2 : 4;
  const spm = slotsPerBeat * 4;
  const slotMs = 60000 / bpm / slotsPerBeat;
  const t0 = Math.min(...notes.map((n) => n.tOn));
  const maxSlots = MAX_MEASURES * spm;
  const table = durTable(slotsPerBeat);

  const trebleChords = groupChords(notes.filter((n) => n.midi >= 60), t0, slotMs, maxSlots);
  const bassChords = groupChords(notes.filter((n) => n.midi < 60), t0, slotMs, maxSlots);

  const lastSlot = Math.max(
    ...trebleChords.map((c) => c.slot + c.durSlots),
    ...bassChords.map((c) => c.slot + c.durSlots),
    spm,
  );
  const totalMeasures = Math.min(MAX_MEASURES, Math.ceil(lastSlot / spm));

  const grand = bassChords.length > 0 && trebleChords.length > 0;
  const trebleMeasures = buildStave(trebleChords, spm, table, totalMeasures);
  const bassMeasures = buildStave(bassChords, spm, table, totalMeasures);

  let measures: Measure[];
  let clef: 'treble' | 'bass' = 'treble';
  if (grand) {
    measures = trebleMeasures.map((t, i) => ({ treble: t, bass: bassMeasures[i] }));
  } else if (bassChords.length > 0) {
    clef = 'bass';
    measures = bassMeasures.map((b) => ({ treble: b }));
  } else {
    measures = trebleMeasures.map((t) => ({ treble: t }));
  }

  return {
    score: { measures, key: 'C', grand, clef },
    treble: trebleChords,
    bass: bassChords,
    slotMs,
    slotsPerMeasure: spm,
  };
}
