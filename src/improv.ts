// Feature 4 — The Improvisation Lab.
// Lead-sheet chord timeline + synth backing track; the on-screen keyboard
// lights up chord tones and scale tones for the current chord; live stats on
// how inside/outside your lines are; call-and-response drills; constraint
// cards ("only chord tones", "three notes only", ...).

import { input } from './events';
import { Keyboard } from './keyboard';
import { progress, save, countNotes } from './progress';
import { bassNote, hat, now, padChord, pianoOn, unlockAudio } from './synth';
import { ChordInfo, midiFromPc, midiToName, parseChord } from './theory';

interface Progression { id: string; name: string; chords: string[] }

const PROGRESSIONS: Progression[] = [
  { id: 'blues-c', name: '12-Bar Blues in C', chords: ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'] },
  { id: 'pop-c', name: 'Pop I–V–vi–IV in C', chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'] },
  { id: '251-f', name: 'Jazz ii–V–I in F', chords: ['Gm7', 'C7', 'Fmaj7', 'Fmaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7'] },
  { id: 'vamp-am', name: 'Minor vamp in A minor', chords: ['Am7', 'Dm7', 'Am7', 'E7', 'Am7', 'Dm7', 'Am7', 'E7'] },
];

type ConstraintId = 'free' | 'chord-tones' | 'scale' | 'three-notes' | 'one-octave';

const CONSTRAINTS: { id: ConstraintId; name: string; desc: string }[] = [
  { id: 'free', name: 'Free play', desc: 'No constraint — just watch the chord-tone lights and stats.' },
  { id: 'chord-tones', name: 'Only chord tones', desc: 'Every note must belong to the current chord. Arpeggios are your friend.' },
  { id: 'scale', name: 'Stay in the scale', desc: 'Any note from the scale of the current chord counts.' },
  { id: 'three-notes', name: 'Only 3 notes', desc: 'Your first three distinct notes become your entire palette. Make them sing.' },
  { id: 'one-octave', name: 'One octave', desc: 'Your first note pins a one-octave window. Stay inside it.' },
];

export function mountImprov(root: HTMLElement, keyboard: Keyboard): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>Improvisation Lab</h2>
      <p>Start the backing track and improvise over the changes. On the keyboard below,
      <span class="tag-chord">chord tones</span> and <span class="tag-scale">scale tones</span> light up for
      the current chord. Pick a constraint card to force real choices, or run a
      call-and-response drill: listen, then echo.</p>
    </div>
    <div class="toolbar">
      <label>Progression
        <select id="im-prog">${PROGRESSIONS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </label>
      <label>Tempo <input type="number" id="im-bpm" min="50" max="180" value="100" class="num"> BPM</label>
      <button id="im-start" class="btn primary">▶ Start backing</button>
    </div>
    <div id="im-timeline" class="chord-timeline"></div>
    <div class="improv-grid">
      <div class="panel">
        <h3>Constraint card</h3>
        <select id="im-constraint">${CONSTRAINTS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        <p id="im-constraint-desc" class="muted">${CONSTRAINTS[0].desc}</p>
        <div id="im-palette" class="muted"></div>
        <div class="stat-row">
          <div class="tile"><div class="tile-num" id="im-kept">—</div><div class="tile-label">constraint kept</div></div>
          <div class="tile"><div class="tile-num" id="im-ct">0%</div><div class="tile-label">chord tones</div></div>
          <div class="tile"><div class="tile-num" id="im-notes">0</div><div class="tile-label">notes played</div></div>
        </div>
        <button id="im-reset" class="btn">Reset stats</button>
      </div>
      <div class="panel">
        <h3>Call &amp; response</h3>
        <p class="muted">Sightline plays a short phrase from the current chord's scale — echo it back
        (any octave). Five rounds.</p>
        <button id="im-drill" class="btn primary">Start drill</button>
        <p id="im-drill-status" class="drill-status"></p>
        <div id="im-drill-log" class="drill-log"></div>
      </div>
    </div>
  `;

  const progEl = root.querySelector('#im-prog') as HTMLSelectElement;
  const bpmEl = root.querySelector('#im-bpm') as HTMLInputElement;
  const startBtn = root.querySelector('#im-start') as HTMLButtonElement;
  const timelineEl = root.querySelector('#im-timeline') as HTMLElement;
  const constraintEl = root.querySelector('#im-constraint') as HTMLSelectElement;
  const constraintDescEl = root.querySelector('#im-constraint-desc') as HTMLElement;
  const paletteEl = root.querySelector('#im-palette') as HTMLElement;
  const keptEl = root.querySelector('#im-kept') as HTMLElement;
  const ctEl = root.querySelector('#im-ct') as HTMLElement;
  const notesEl = root.querySelector('#im-notes') as HTMLElement;
  const resetBtn = root.querySelector('#im-reset') as HTMLButtonElement;
  const drillBtn = root.querySelector('#im-drill') as HTMLButtonElement;
  const drillStatusEl = root.querySelector('#im-drill-status') as HTMLElement;
  const drillLogEl = root.querySelector('#im-drill-log') as HTMLElement;

  let prog = PROGRESSIONS[0];
  let chords: ChordInfo[] = prog.chords.map(parseChord);
  let chordIdx = 0;
  let playing = false;
  let schedTimer: number | null = null;
  let uiTimers: number[] = [];
  let nextBarTime = 0;
  let nextBarIdx = 0;

  // live stats
  let stat = { notes: 0, chordTones: 0, scaleTones: 0, kept: 0, judged: 0 };
  let palette: number[] = [];       // pitch classes for 'three-notes'
  let octaveWindow: [number, number] | null = null;

  // drill state
  let drill: { phrase: number[]; got: number[]; round: number; correct: number; listening: boolean } | null = null;
  let drillTimers: number[] = [];

  function renderTimeline() {
    timelineEl.innerHTML = prog.chords
      .map((c, i) => `<div class="chord-chip${i === chordIdx ? ' active' : ''}" data-i="${i}">${c}</div>`)
      .join('');
  }

  function currentChord(): ChordInfo {
    return chords[chordIdx];
  }

  function updateHighlights() {
    const c = currentChord();
    const map = new Map<number, string>();
    for (let m = 36; m <= 96; m++) {
      if (c.tones.includes(m % 12)) map.set(m, 'hl-chord');
      else if (c.scale.includes(m % 12)) map.set(m, 'hl-scale');
    }
    keyboard.setHighlights(map);
  }

  function setChord(i: number) {
    chordIdx = i % chords.length;
    renderTimeline();
    updateHighlights();
  }

  function updateStatsUI() {
    notesEl.textContent = String(stat.notes);
    ctEl.textContent = stat.notes ? Math.round((stat.chordTones / stat.notes) * 100) + '%' : '0%';
    keptEl.textContent = stat.judged ? `${Math.round((stat.kept / stat.judged) * 100)}%` : '—';
    const cId = constraintEl.value as ConstraintId;
    if (cId === 'three-notes') {
      paletteEl.textContent = palette.length
        ? 'Your palette: ' + palette.map((pc) => midiToName(60 + pc).replace(/\d+$/, '')).join(' · ')
        : 'Play your first three notes to set the palette.';
    } else if (cId === 'one-octave' && octaveWindow) {
      paletteEl.textContent = `Window: ${midiToName(octaveWindow[0])} – ${midiToName(octaveWindow[1])}`;
    } else {
      paletteEl.textContent = '';
    }
  }

  function resetStats() {
    stat = { notes: 0, chordTones: 0, scaleTones: 0, kept: 0, judged: 0 };
    palette = [];
    octaveWindow = null;
    updateStatsUI();
  }

  function judgeConstraint(midi: number): boolean | null {
    const pc = midi % 12;
    switch (constraintEl.value as ConstraintId) {
      case 'free': return null;
      case 'chord-tones': return currentChord().tones.includes(pc);
      case 'scale': return currentChord().scale.includes(pc);
      case 'three-notes':
        if (!palette.includes(pc) && palette.length < 3) { palette.push(pc); return true; }
        return palette.includes(pc);
      case 'one-octave':
        if (!octaveWindow) { octaveWindow = [midi, midi + 12]; return true; }
        return midi >= octaveWindow[0] && midi <= octaveWindow[1];
    }
  }

  const unsubNote = input.onNoteOn((e) => {
    if (drill?.listening) {
      drillCollect(e.midi);
      return;
    }
    const pc = e.midi % 12;
    stat.notes++;
    if (currentChord().tones.includes(pc)) stat.chordTones++;
    if (currentChord().scale.includes(pc)) stat.scaleTones++;
    const verdict = judgeConstraint(e.midi);
    if (verdict !== null) {
      stat.judged++;
      if (verdict) stat.kept++;
      else flashBad();
    }
    updateStatsUI();
  });

  let flashTimer: number | null = null;
  function flashBad() {
    root.classList.add('constraint-broken');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => root.classList.remove('constraint-broken'), 220);
  }

  // ---------- backing track ----------
  function scheduleBar(barIdx: number, when: number, barSec: number) {
    const c = chords[barIdx % chords.length];
    const bass = midiFromPc(c.rootPc, 2);
    const fifth = bass + 7;
    const beat = barSec / 4;
    bassNote(bass, when, beat * 1.8);
    bassNote(fifth, when + beat * 2, beat * 1.8);
    const voicing = c.tones.map((pc) => midiFromPc(pc, pc < c.rootPc ? 4 : 3)).sort((a, b) => a - b);
    padChord(voicing, when, barSec * 0.98);
    for (let b = 0; b < 4; b++) hat(when + beat * b);
    const delay = Math.max(0, (when - now()) * 1000);
    uiTimers.push(window.setTimeout(() => { if (playing) setChord(barIdx % chords.length); }, delay));
  }

  function startBacking() {
    unlockAudio();
    stopDrill();
    playing = true;
    startBtn.textContent = '■ Stop backing';
    const bpm = Math.min(180, Math.max(50, Number(bpmEl.value) || 100));
    bpmEl.value = String(bpm);
    const barSec = (60 / bpm) * 4;
    nextBarTime = now() + 0.15;
    nextBarIdx = 0;
    schedTimer = window.setInterval(() => {
      while (nextBarTime < now() + 0.35) {
        scheduleBar(nextBarIdx, nextBarTime, barSec);
        nextBarTime += barSec;
        nextBarIdx++;
      }
    }, 100);
  }

  function stopBacking(recordSession = true) {
    playing = false;
    startBtn.textContent = '▶ Start backing';
    if (schedTimer !== null) { clearInterval(schedTimer); schedTimer = null; }
    for (const t of uiTimers) clearTimeout(t);
    uiTimers = [];
    if (recordSession && stat.notes >= 8) {
      const p = progress();
      p.improv.sessions.push({
        date: new Date().toISOString(),
        progression: prog.name,
        notes: stat.notes,
        chordTonePct: Math.round((stat.chordTones / stat.notes) * 100),
        scalePct: Math.round((stat.scaleTones / stat.notes) * 100),
      });
      if (p.improv.sessions.length > 200) p.improv.sessions.shift();
      save();
      countNotes(stat.notes);
    }
  }

  // ---------- call & response ----------
  function makePhrase(): number[] {
    const c = currentChord();
    const scaleMidis: number[] = [];
    for (let m = 60; m <= 76; m++) if (c.scale.includes(m % 12)) scaleMidis.push(m);
    let i = scaleMidis.findIndex((m) => m % 12 === c.rootPc);
    if (i < 0) i = 0;
    const phrase = [scaleMidis[i]];
    for (let k = 0; k < 3; k++) {
      i = Math.min(scaleMidis.length - 1, Math.max(0, i + (Math.floor(Math.random() * 5) - 2)));
      phrase.push(scaleMidis[i]);
    }
    return phrase;
  }

  function playPhrase(phrase: number[], onDone: () => void) {
    unlockAudio();
    const step = 0.5;
    const t0 = now() + 0.2;
    phrase.forEach((m, i) => pianoOn(m, 100, t0 + i * step, step * 0.9));
    drillTimers.push(window.setTimeout(onDone, (0.2 + phrase.length * step) * 1000 + 150));
  }

  function startRound() {
    if (!drill) return;
    drill.phrase = makePhrase();
    drill.got = [];
    drill.listening = false;
    drillStatusEl.textContent = `Round ${drill.round + 1}/5 — listen…`;
    playPhrase(drill.phrase, () => {
      if (!drill) return;
      drill.listening = true;
      drillStatusEl.textContent = `Round ${drill.round + 1}/5 — your turn! Echo ${drill.phrase.length} notes (any octave).`;
    });
  }

  function drillCollect(midi: number) {
    if (!drill) return;
    drill.got.push(midi);
    if (drill.got.length < drill.phrase.length) return;
    drill.listening = false;
    const ok = drill.phrase.every((m, i) => m % 12 === drill!.got[i] % 12);
    if (ok) drill.correct++;
    const expected = drill.phrase.map((m) => midiToName(m)).join(' ');
    const got = drill.got.map((m) => midiToName(m)).join(' ');
    drillLogEl.innerHTML =
      `<div class="drill-row ${ok ? 'ok' : 'fail'}">${ok ? '✓' : '✗'} heard <b>${expected}</b>, you played <b>${got}</b></div>` +
      drillLogEl.innerHTML;
    drill.round++;
    if (drill.round >= 5) {
      const score = drill.correct;
      drillStatusEl.textContent = `Drill done: ${score}/5 phrases echoed correctly.`;
      const p = progress();
      p.improv.callResponse.push({ date: new Date().toISOString(), score, rounds: 5 });
      if (p.improv.callResponse.length > 200) p.improv.callResponse.shift();
      save();
      drill = null;
      drillBtn.textContent = 'Start drill';
    } else {
      drillTimers.push(window.setTimeout(startRound, 900));
    }
  }

  function stopDrill() {
    for (const t of drillTimers) clearTimeout(t);
    drillTimers = [];
    drill = null;
    drillBtn.textContent = 'Start drill';
    drillStatusEl.textContent = '';
  }

  drillBtn.addEventListener('click', () => {
    if (drill) { stopDrill(); return; }
    drill = { phrase: [], got: [], round: 0, correct: 0, listening: false };
    drillBtn.textContent = '■ Stop drill';
    drillLogEl.innerHTML = '';
    startRound();
  });

  // ---------- wiring ----------
  startBtn.addEventListener('click', () => (playing ? stopBacking() : startBacking()));
  progEl.addEventListener('change', () => {
    const wasPlaying = playing;
    if (playing) stopBacking();
    prog = PROGRESSIONS.find((p) => p.id === progEl.value)!;
    chords = prog.chords.map(parseChord);
    setChord(0);
    resetStats();
    if (wasPlaying) startBacking();
  });
  constraintEl.addEventListener('change', () => {
    constraintDescEl.textContent = CONSTRAINTS.find((c) => c.id === constraintEl.value)!.desc;
    palette = [];
    octaveWindow = null;
    stat.kept = 0; stat.judged = 0;
    updateStatsUI();
  });
  resetBtn.addEventListener('click', resetStats);
  timelineEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chord-chip') as HTMLElement | null;
    if (chip && !playing) setChord(Number(chip.dataset.i));
  });

  setChord(0);
  resetStats();

  return () => {
    stopBacking(true);
    stopDrill();
    unsubNote();
    keyboard.clearHighlights();
  };
}
