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

// Difficulty tunes how fast the month ramps and how strict the grading is, so
// the same 30-day frame fits a true beginner or a more advanced player.
export type Difficulty = 'beginner' | 'standard' | 'advanced';

interface DiffCfg {
  levelShift: number;   // added to the reading level
  weekShift: number;    // shifts technique/étude ramp earlier (+) or later (-)
  namesMaxWeek: number; // show note names while week <= this (-1 = never)
  goalRead: number;     // accuracy needed to clear each task kind
  goalTech: number;
  goalEtude: number;
}

const DIFF: Record<Difficulty, DiffCfg> = {
  beginner: { levelShift: -1, weekShift: -1, namesMaxWeek: 1, goalRead: 0.70, goalTech: 0.85, goalEtude: 0.80 },
  standard: { levelShift: 0, weekShift: 0, namesMaxWeek: 0, goalRead: 0.80, goalTech: 0.90, goalEtude: 0.85 },
  advanced: { levelShift: 2, weekShift: 1, namesMaxWeek: -1, goalRead: 0.85, goalTech: 0.95, goalEtude: 0.90 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// --- the three daily tasks, scaled by how far into the month we are ---

function readingTask(day: number, cfg: DiffCfg): DailyTask {
  const w = weekOf(day);
  const level = clamp(1 + w * 2 + (day % 2) + cfg.levelShift, 1, 10);
  // Introduce the bass clef once the left hand enters the ramp.
  const ramp = clamp(w + cfg.weekShift, 0, 4);
  const clef: 'treble' | 'bass' = ramp >= 2 && day % 2 === 0 ? 'bass' : 'treble';
  const withNames = w <= cfg.namesMaxWeek; // spell notes out early (longer for beginners)
  return {
    id: 'read',
    titleKey: withNames ? 'daily.task.readingNames' : 'daily.task.reading',
    params: { level },
    goal: cfg.goalRead,
    showNames: withNames,
    build: () => generateExercise(level, clef).score,
  };
}

function techniqueTask(day: number, cfg: DiffCfg): DailyTask {
  const tw = clamp(weekOf(day) + cfg.weekShift, 0, 3);
  const root = TECH_ROOTS[(day - 1) % TECH_ROOTS.length];
  const hand: Hand = tw >= 2 && day % 2 === 0 ? 'left' : 'right';
  let type: ExType;
  if (tw === 0) type = 'five-major';
  else if (tw === 1) type = day % 2 === 1 ? 'scale-major' : 'arpeggio-major';
  else if (tw === 2) type = day % 3 === 0 ? 'five-minor' : day % 2 === 1 ? 'arpeggio-major' : 'scale-major';
  else type = day % 2 === 1 ? 'scale-major' : 'arpeggio-major';
  return {
    id: 'tech',
    titleKey: TECH_TYPE_LABEL[type],
    params: { root, hand },
    goal: cfg.goalTech,
    showFingering: true,
    build: () => buildTechniqueScore(type, root, hand),
  };
}

function etudeTask(day: number, cfg: DiffCfg): DailyTask {
  const hard = clamp(weekOf(day) + cfg.weekShift, 0, 3) >= 2;
  return {
    id: 'etude',
    titleKey: hard ? 'daily.task.etudeHard' : 'daily.task.etudeEasy',
    params: {},
    goal: cfg.goalEtude,
    showFingering: true,
    build: () => generateEtude(hard ? 'etude-hard' : 'etude-easy'),
  };
}

/** The plan for a given day: a week focus plus its three graded tasks. */
export function dailyDay(day: number, difficulty: Difficulty = 'standard'): DailyDayDef {
  const cfg = DIFF[difficulty];
  const w = Math.min(4, weekOf(day));
  return {
    day,
    focusKey: `daily.focus.w${w}`,
    tasks: [readingTask(day, cfg), techniqueTask(day, cfg), etudeTask(day, cfg)],
  };
}
