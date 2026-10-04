// 30-day guided program ("Parcours 30 jours").
// A deterministic month of short daily sessions that build note-reading
// (solfège) and fingering technique together. Each day bundles three tasks —
// a reading drill, a technique drill, and a finger étude — that get harder as
// the weeks progress. All content is composed from the existing engines
// (generator, technique, études) so every exercise is playable and graded by
// the shared PlayThrough engine.

import { Score } from './notation';
import { generateExercise } from './generator';
import { generateEtude } from './etudes';
import { buildTechniqueScore, ExType, Hand } from './technique';

export const DAILY_TOTAL = 30;

export interface DailyTask {
  id: string;                               // stable within a day: 'read' | 'tech' | 'etude'
  titleKey: string;                         // i18n key for the task label
  params: Record<string, string | number>; // interpolated into the label (root/hand resolved by the view)
  goal: number;                             // accuracy (0..1) needed to clear the task
  showNames?: boolean;                      // print note names (early reading days)
  showFingering?: boolean;                  // print fingering (technique/étude days)
  build: () => Score;                       // fresh, playable score each time
}

export interface DailyDayDef {
  day: number;        // 1..30
  focusKey: string;   // i18n key describing the week's focus
  tasks: DailyTask[];
}

// Roots cycle so every key gets touched across the month.
const TECH_ROOTS = ['C', 'G', 'F', 'D', 'A', 'E'];

const TECH_TYPE_LABEL: Record<ExType, string> = {
  'five-major': 'daily.task.five',
  'five-minor': 'daily.task.fiveMinor',
  'scale-major': 'daily.task.scale',
  'arpeggio-major': 'daily.task.arpeggio',
};

function weekOf(day: number): number {
  return Math.floor((day - 1) / 7); // 0..4 (days 29-30 fall in week 4)
}

// --- the three daily tasks, scaled by how far into the month we are ---

function readingTask(day: number): DailyTask {
  const w = weekOf(day);
  const level = Math.min(10, 1 + w * 2 + (day % 2));
  // Introduce the bass clef once the left hand enters the program (week 3+).
  const clef: 'treble' | 'bass' = w >= 2 && day % 2 === 0 ? 'bass' : 'treble';
  const withNames = w === 0; // first week spells notes out to learn the staff
  return {
    id: 'read',
    titleKey: withNames ? 'daily.task.readingNames' : 'daily.task.reading',
    params: { level },
    goal: 0.8,
    showNames: withNames,
    build: () => generateExercise(level, clef).score,
  };
}

function techniqueTask(day: number): DailyTask {
  const w = weekOf(day);
  const root = TECH_ROOTS[(day - 1) % TECH_ROOTS.length];
  const hand: Hand = w >= 2 && day % 2 === 0 ? 'left' : 'right';
  let type: ExType;
  if (w === 0) type = 'five-major';
  else if (w === 1) type = day % 2 === 1 ? 'scale-major' : 'arpeggio-major';
  else if (w === 2) type = day % 3 === 0 ? 'five-minor' : day % 2 === 1 ? 'arpeggio-major' : 'scale-major';
  else type = day % 2 === 1 ? 'scale-major' : 'arpeggio-major';
  return {
    id: 'tech',
    titleKey: TECH_TYPE_LABEL[type],
    params: { root, hand },
    goal: 0.9,
    showFingering: true,
    build: () => buildTechniqueScore(type, root, hand),
  };
}

function etudeTask(day: number): DailyTask {
  const hard = weekOf(day) >= 2;
  return {
    id: 'etude',
    titleKey: hard ? 'daily.task.etudeHard' : 'daily.task.etudeEasy',
    params: {},
    goal: 0.85,
    showFingering: true,
    build: () => generateEtude(hard ? 'etude-hard' : 'etude-easy'),
  };
}

/** The plan for a given day: a week focus plus its three graded tasks. */
export function dailyDay(day: number): DailyDayDef {
  const w = Math.min(4, weekOf(day));
  return {
    day,
    focusKey: `daily.focus.w${w}`,
    tasks: [readingTask(day), techniqueTask(day), etudeTask(day)],
  };
}
