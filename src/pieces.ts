// Bundled public-domain / traditional melodies for Fading Score training.
// Compact form: each measure is a list of [note, duration, fingering] or
// ['rest', duration]. All 4/4, right hand.

import { Dur, Measure, Score, ScoreNote } from './notation';
import { t } from './i18n';
import { nameToMidi } from './theory';

type Cell = [string, Dur, string?];

export interface Piece {
  id: string;
  title: string;
  key: string;
  measures: Cell[][];
}

function toScore(p: Piece): Score {
  const measures: Measure[] = p.measures.map((cells) => ({
    treble: cells.map((c): ScoreNote => {
      if (c[0] === 'rest') return { midis: [], dur: c[1], rest: true };
      return { midis: [nameToMidi(c[0])], dur: c[1], finger: c[2] };
    }),
  }));
  return { measures, key: p.key };
}

export const PIECES: Piece[] = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy (Beethoven)',
    key: 'C',
    measures: [
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['F4', 'q', '4'], ['G4', 'q', '5']],
      [['G4', 'q', '5'], ['F4', 'q', '4'], ['E4', 'q', '3'], ['D4', 'q', '2']],
      [['C4', 'q', '1'], ['C4', 'q', '1'], ['D4', 'q', '2'], ['E4', 'q', '3']],
      [['E4', 'qd', '3'], ['D4', '8', '2'], ['D4', 'h', '2']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['F4', 'q', '4'], ['G4', 'q', '5']],
      [['G4', 'q', '5'], ['F4', 'q', '4'], ['E4', 'q', '3'], ['D4', 'q', '2']],
      [['C4', 'q', '1'], ['C4', 'q', '1'], ['D4', 'q', '2'], ['E4', 'q', '3']],
      [['D4', 'qd', '2'], ['C4', '8', '1'], ['C4', 'h', '1']],
    ],
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    key: 'C',
    measures: [
      [['C4', 'q', '1'], ['C4', 'q', '1'], ['G4', 'q', '5'], ['G4', 'q', '5']],
      [['A4', 'q', '5'], ['A4', 'q', '5'], ['G4', 'h', '5']],
      [['F4', 'q', '4'], ['F4', 'q', '4'], ['E4', 'q', '3'], ['E4', 'q', '3']],
      [['D4', 'q', '2'], ['D4', 'q', '2'], ['C4', 'h', '1']],
      [['G4', 'q', '5'], ['G4', 'q', '5'], ['F4', 'q', '4'], ['F4', 'q', '4']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['D4', 'h', '2']],
      [['G4', 'q', '5'], ['G4', 'q', '5'], ['F4', 'q', '4'], ['F4', 'q', '4']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['D4', 'h', '2']],
      [['C4', 'q', '1'], ['C4', 'q', '1'], ['G4', 'q', '5'], ['G4', 'q', '5']],
      [['A4', 'q', '5'], ['A4', 'q', '5'], ['G4', 'h', '5']],
      [['F4', 'q', '4'], ['F4', 'q', '4'], ['E4', 'q', '3'], ['E4', 'q', '3']],
      [['D4', 'q', '2'], ['D4', 'q', '2'], ['C4', 'h', '1']],
    ],
  },
  {
    id: 'saints',
    title: 'When the Saints Go Marching In',
    key: 'C',
    measures: [
      [['rest', 'q'], ['C4', 'q', '1'], ['E4', 'q', '3'], ['F4', 'q', '4']],
      [['G4', 'w', '5']],
      [['rest', 'q'], ['C4', 'q', '1'], ['E4', 'q', '3'], ['F4', 'q', '4']],
      [['G4', 'w', '5']],
      [['rest', 'q'], ['C4', 'q', '1'], ['E4', 'q', '3'], ['F4', 'q', '4']],
      [['G4', 'h', '5'], ['E4', 'h', '3']],
      [['C4', 'h', '1'], ['E4', 'h', '3']],
      [['D4', 'w', '2']],
      [['rest', 'q'], ['E4', 'q', '3'], ['E4', 'q', '3'], ['D4', 'q', '2']],
      [['C4', 'hd', '1'], ['C4', 'q', '1']],
      [['E4', 'h', '3'], ['G4', 'h', '5']],
      [['G4', 'q', '5'], ['F4', 'hd', '4']],
      [['rest', 'q'], ['E4', 'q', '3'], ['F4', 'q', '4'], ['G4', 'q', '5']],
      [['E4', 'h', '3'], ['C4', 'h', '1']],
      [['E4', 'q', '3'], ['D4', 'hd', '2']],
      [['C4', 'w', '1']],
    ],
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (chorus)',
    key: 'C',
    measures: [
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'h', '3']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'h', '3']],
      [['E4', 'q', '3'], ['G4', 'q', '5'], ['C4', 'q', '1'], ['D4', 'q', '2']],
      [['E4', 'w', '3']],
      [['F4', 'q', '4'], ['F4', 'q', '4'], ['F4', 'q', '4'], ['F4', 'q', '4']],
      [['F4', 'q', '4'], ['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'q', '3']],
      [['E4', 'q', '3'], ['D4', 'q', '2'], ['D4', 'q', '2'], ['E4', 'q', '3']],
      [['D4', 'h', '2'], ['G4', 'h', '5']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'h', '3']],
      [['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'h', '3']],
      [['E4', 'q', '3'], ['G4', 'q', '5'], ['C4', 'q', '1'], ['D4', 'q', '2']],
      [['E4', 'w', '3']],
      [['F4', 'q', '4'], ['F4', 'q', '4'], ['F4', 'q', '4'], ['F4', 'q', '4']],
      [['F4', 'q', '4'], ['E4', 'q', '3'], ['E4', 'q', '3'], ['E4', 'q', '3']],
      [['G4', 'q', '5'], ['G4', 'q', '5'], ['F4', 'q', '4'], ['D4', 'q', '2']],
      [['C4', 'w', '1']],
    ],
  },
];

export function pieceScore(id: string): Score {
  const p = PIECES.find((x) => x.id === id)!;
  return toScore(p);
}

/** Language-aware display title for a piece. */
export function pieceTitle(id: string): string {
  return t(`piece.${id}`);
}
