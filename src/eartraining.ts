// Ear Training room (roadmap #4): three self-contained drills —
//  • Intervals: hear two notes, name the interval.
//  • Chords: hear a chord, name its quality.
//  • Dictation: hear a short melody, play it back on your instrument.
// Answers for intervals/chords are buttons; dictation listens on the note bus
// so MIDI, on-screen keys, and the computer keyboard all work. Results feed the
// skill map via recordEar().

import { input } from './events';
import { t } from './i18n';
import { recordEar } from './progress';
import { now, pianoOn, unlockAudio } from './synth';
import { midiToName } from './theory';
import { tutorialHTML } from './tutorial';

type Mode = 'intervals' | 'chords' | 'dictation';

const INTERVALS = [
  { semis: 1, key: 'm2' }, { semis: 2, key: 'M2' }, { semis: 3, key: 'm3' },
  { semis: 4, key: 'M3' }, { semis: 5, key: 'P4' }, { semis: 6, key: 'TT' },
  { semis: 7, key: 'P5' }, { semis: 8, key: 'm6' }, { semis: 9, key: 'M6' },
  { semis: 10, key: 'm7' }, { semis: 11, key: 'M7' }, { semis: 12, key: 'P8' },
];

const CHORDS = [
  { key: 'maj', ivs: [0, 4, 7] },
  { key: 'min', ivs: [0, 3, 7] },
  { key: 'dim', ivs: [0, 3, 6] },
  { key: 'aug', ivs: [0, 4, 8] },
  { key: 'dom7', ivs: [0, 4, 7, 10] },
  { key: 'maj7', ivs: [0, 4, 7, 11] },
  { key: 'min7', ivs: [0, 3, 7, 10] },
];

const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

interface Question {
  mode: Mode;
  answer: string;    // interval/chord key; '' for dictation
  notes: number[];   // notes to (re)play
  seq?: number[];    // dictation target
}

export function mountEar(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('ear.title')}</h2>
      <p>${t('ear.intro')}</p>
      ${tutorialHTML('ear')}
    </div>
    <div class="toolbar">
      <label>${t('ear.mode')}
        <select id="ear-mode">
          <option value="intervals">${t('ear.mode.intervals')}</option>
          <option value="chords">${t('ear.mode.chords')}</option>
          <option value="dictation">${t('ear.mode.dictation')}</option>
        </select>
      </label>
      <button id="ear-new" class="btn primary">${t('ear.new')}</button>
      <button id="ear-replay" class="btn">${t('ear.replay')}</button>
    </div>
    <div class="panel ear-panel">
      <p id="ear-status" class="drill-status">${t('ear.ready')}</p>
      <div id="ear-answers" class="ear-answers"></div>
      <p id="ear-feedback" class="ear-feedback"></p>
    </div>
    <div class="result-tiles wide">
      <div class="tile"><div class="tile-num" id="ear-acc">—</div><div class="tile-label">${t('ear.accuracy')}</div></div>
      <div class="tile"><div class="tile-num" id="ear-streak">0</div><div class="tile-label">${t('ear.streak')}</div></div>
      <div class="tile"><div class="tile-num" id="ear-best">0</div><div class="tile-label">${t('ear.best')}</div></div>
    </div>
    <div id="ear-log" class="drill-log"></div>
  `;

  const modeEl = root.querySelector('#ear-mode') as HTMLSelectElement;
  const newBtn = root.querySelector('#ear-new') as HTMLButtonElement;
  const replayBtn = root.querySelector('#ear-replay') as HTMLButtonElement;
  const statusEl = root.querySelector('#ear-status') as HTMLElement;
  const answersEl = root.querySelector('#ear-answers') as HTMLElement;
  const feedbackEl = root.querySelector('#ear-feedback') as HTMLElement;
  const accEl = root.querySelector('#ear-acc') as HTMLElement;
  const streakEl = root.querySelector('#ear-streak') as HTMLElement;
  const bestEl = root.querySelector('#ear-best') as HTMLElement;
  const logEl = root.querySelector('#ear-log') as HTMLElement;

  let mode: Mode = 'intervals';
  let q: Question | null = null;
  let answered = false;
  let listening = false;
  let got: number[] = [];
  let streak = 0;
  let bestStreak = 0;
  // per-mode session accuracy
  const session: Record<Mode, { attempts: number; correct: number }> = {
    intervals: { attempts: 0, correct: 0 },
    chords: { attempts: 0, correct: 0 },
    dictation: { attempts: 0, correct: 0 },
  };
  let timers: number[] = [];
  function later(fn: () => void, ms: number) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() { for (const id of timers) clearTimeout(id); timers = []; }

  function play(onDone?: () => void) {
    if (!q) return;
    unlockAudio();
    const t0 = now() + 0.15;
    if (q.mode === 'chords') {
      q.notes.forEach((m) => pianoOn(m, 92, t0, 1.5));
      if (onDone) later(onDone, 1650);
    } else {
      const gap = 0.55;
      q.notes.forEach((m, i) => pianoOn(m, 96, t0 + i * gap, gap * 0.9));
      if (onDone) later(onDone, 150 + q.notes.length * gap * 1000);
    }
  }

  function correctLabel(): string {
    if (!q) return '';
    if (q.mode === 'intervals') return t('ear.int.' + q.answer);
    if (q.mode === 'chords') return t('ear.chord.' + q.answer);
    return (q.seq ?? []).map((m) => midiToName(m)).join(' ');
  }

  function updateStats() {
    const s = session[mode];
    accEl.textContent = s.attempts ? Math.round((s.correct / s.attempts) * 100) + '%' : '—';
    streakEl.textContent = String(streak);
    bestEl.textContent = String(bestStreak);
  }

  function renderAnswers() {
    if (mode === 'dictation') {
      answersEl.innerHTML = `<p class="muted">${t('ear.dictationPrompt')}</p>`;
      return;
    }
    const set = mode === 'intervals' ? INTERVALS.map((i) => i.key) : CHORDS.map((c) => c.key);
    const prefix = mode === 'intervals' ? 'ear.int.' : 'ear.chord.';
    answersEl.innerHTML = set
      .map((k) => `<button class="btn ear-opt" data-k="${k}">${t(prefix + k)}</button>`)
      .join('');
  }

  function logRow(correct: boolean, expected: string, got2?: string) {
    const detail = got2 !== undefined ? t('ear.logGot', { expected, got: got2 }) : expected;
    logEl.innerHTML =
      `<div class="drill-row ${correct ? 'ok' : 'fail'}">${correct ? '✓' : '✗'} ${detail}</div>` + logEl.innerHTML;
  }

  function grade(correct: boolean, gotText?: string) {
    const s = session[mode];
    s.attempts++;
    if (correct) { s.correct++; streak++; if (streak > bestStreak) bestStreak = streak; }
    else streak = 0;
    recordEar(mode, correct, streak);
    feedbackEl.textContent = correct ? t('ear.correct') : t('ear.wrong', { answer: correctLabel() });
    feedbackEl.className = 'ear-feedback ' + (correct ? 'good' : 'bad');
    logRow(correct, correctLabel(), gotText);
    updateStats();
    later(newQuestion, correct ? 950 : 1700);
  }

  function newQuestion() {
    clearTimers();
    answered = false;
    listening = false;
    got = [];
    feedbackEl.textContent = '';
    feedbackEl.className = 'ear-feedback';
    renderAnswers();

    if (mode === 'intervals') {
      const iv = pick(INTERVALS);
      const base = 55 + Math.floor(Math.random() * 8); // G3..D4
      q = { mode, answer: iv.key, notes: [base, base + iv.semis] };
      statusEl.textContent = t('ear.whichInterval');
      play();
    } else if (mode === 'chords') {
      const ch = pick(CHORDS);
      const base = 52 + Math.floor(Math.random() * 8);
      q = { mode, answer: ch.key, notes: ch.ivs.map((i) => base + i) };
      statusEl.textContent = t('ear.whichChord');
      play();
    } else {
      const scale: number[] = [];
      for (let m = 60; m <= 72; m++) if (C_MAJOR.includes(m % 12)) scale.push(m);
      let i = scale.findIndex((m) => m % 12 === 0);
      if (i < 0) i = 0;
      const seq = [scale[i]];
      for (let k = 0; k < 3; k++) {
        i = Math.min(scale.length - 1, Math.max(0, i + (Math.floor(Math.random() * 5) - 2)));
        seq.push(scale[i]);
      }
      q = { mode, answer: '', notes: seq, seq };
      statusEl.textContent = t('ear.listen');
      play(() => { listening = true; statusEl.textContent = t('ear.yourTurn', { len: seq.length }); });
    }
    updateStats();
  }

  // interval / chord answers
  answersEl.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('.ear-opt') as HTMLButtonElement | null;
    if (!b || !q || answered || mode === 'dictation') return;
    answered = true;
    const chosen = b.dataset.k!;
    const correct = chosen === q.answer;
    // mark the board
    answersEl.querySelectorAll('.ear-opt').forEach((x) => {
      const el = x as HTMLElement;
      if (el.dataset.k === q!.answer) el.classList.add('ans-correct');
      else if (el === b) el.classList.add('ans-wrong');
      (el as HTMLButtonElement).disabled = true;
    });
    grade(correct);
  });

  // dictation playback collection
  const unsub = input.onNoteOn((e) => {
    if (mode !== 'dictation' || !listening || !q?.seq) return;
    got.push(e.midi);
    const remaining = q.seq.length - got.length;
    if (remaining > 0) {
      statusEl.textContent = t('ear.yourTurn', { len: remaining });
      return;
    }
    listening = false;
    const correct = q.seq.every((m, i) => m % 12 === got[i] % 12);
    grade(correct, got.map((m) => midiToName(m)).join(' '));
  });

  newBtn.addEventListener('click', newQuestion);
  replayBtn.addEventListener('click', () => {
    if (q) play(mode === 'dictation' ? () => { listening = true; } : undefined);
  });
  modeEl.addEventListener('change', () => {
    mode = modeEl.value as Mode;
    streak = 0;
    bestStreak = 0;
    logEl.innerHTML = '';
    q = null;
    answered = false;
    listening = false;
    statusEl.textContent = t('ear.ready');
    feedbackEl.textContent = '';
    renderAnswers();
    updateStats();
  });

  renderAnswers();
  updateStats();

  return () => {
    clearTimers();
    unsub();
  };
}
