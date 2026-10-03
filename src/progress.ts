// Progress persistence (localStorage) + derived stats for the skill map.

export interface SightreadRecord {
  date: string;      // ISO
  level: number;
  key: string;
  clef: string;
  accuracy: number;  // 0..1
  notesPerMin: number;
  rhythmIssues: number;
  total: number;
}

export interface ImprovSession {
  date: string;
  progression: string;
  notes: number;
  chordTonePct: number;
  scalePct: number;
}

export interface CallResponseRecord {
  date: string;
  score: number;
  rounds: number;
}

export interface ProgressData {
  sightread: {
    level: number;
    history: SightreadRecord[];
    byKey: Record<string, { correct: number; total: number }>;
  };
  fading: Record<string, { level: number; completions: number }>;
  improv: { sessions: ImprovSession[]; callResponse: CallResponseRecord[] };
  totals: { notesPlayed: number; days: Record<string, number> };
}

const KEY = 'sightline-progress-v1';

function blank(): ProgressData {
  return {
    sightread: { level: 1, history: [], byKey: {} },
    fading: {},
    improv: { sessions: [], callResponse: [] },
    totals: { notesPlayed: 0, days: {} },
  };
}

let data: ProgressData | null = null;

export function progress(): ProgressData {
  if (!data) {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? { ...blank(), ...JSON.parse(raw) } : blank();
    } catch {
      data = blank();
    }
  }
  return data!;
}

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(progress())); } catch { /* storage full/blocked */ }
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function countNotes(n: number): void {
  const p = progress();
  p.totals.notesPlayed += n;
  p.totals.days[today()] = (p.totals.days[today()] ?? 0) + n;
  save();
}

export function recordSightread(rec: SightreadRecord, correct: number, total: number): void {
  const p = progress();
  p.sightread.history.push(rec);
  if (p.sightread.history.length > 500) p.sightread.history.shift();
  const bk = p.sightread.byKey[rec.key] ?? { correct: 0, total: 0 };
  bk.correct += correct;
  bk.total += total;
  p.sightread.byKey[rec.key] = bk;
  save();
}

export function streakDays(): number {
  const days = progress().totals.days;
  let streak = 0;
  const d = new Date();
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (days[k]) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0 && k === today()) { d.setDate(d.getDate() - 1); } // today not practiced yet
    else break;
    if (streak > 3650) break;
  }
  return streak;
}
