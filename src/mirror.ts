// Feature 1 — Play-to-Notation Mirror.
// Record from any input (MIDI piano, on-screen keys, computer keys), quantize
// to a grid anchored on your first note, and see it engraved instantly.
// Then play it back.

import { input } from './events';
import { t } from './i18n';
import { Metronome } from './metronome';
import { renderScore } from './notation';
import { countNotes } from './progress';
import { QuantizeResult, RawNote, quantize } from './quantize';
import { now, pianoOn, unlockAudio } from './synth';

export function mountMirror(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('mirror.title')}</h2>
      <p>${t('mirror.intro')}</p>
    </div>
    <div class="toolbar">
      <label>${t('mirror.tempo')} <input type="number" id="mir-bpm" min="40" max="200" value="90" class="num"> ${t('mirror.bpm')}</label>
      <label>${t('mirror.grid')}
        <select id="mir-grid">
          <option value="8" selected>${t('mirror.grid8')}</option>
          <option value="16">${t('mirror.grid16')}</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="mir-click" checked> ${t('mirror.metronome')}</label>
      <button id="mir-rec" class="btn primary">${t('mirror.record')}</button>
      <button id="mir-play" class="btn" disabled>${t('mirror.play')}</button>
      <span id="mir-status" class="status-text">${t('mirror.ready')}</span>
    </div>
    <div id="mir-score" class="score-paper empty">${t('mirror.placeholder')}</div>
  `;

  const bpmEl = root.querySelector('#mir-bpm') as HTMLInputElement;
  const gridEl = root.querySelector('#mir-grid') as HTMLSelectElement;
  const clickEl = root.querySelector('#mir-click') as HTMLInputElement;
  const recBtn = root.querySelector('#mir-rec') as HTMLButtonElement;
  const playBtn = root.querySelector('#mir-play') as HTMLButtonElement;
  const statusEl = root.querySelector('#mir-status') as HTMLElement;
  const scoreEl = root.querySelector('#mir-score') as HTMLElement;

  const metro = new Metronome();
  let recording = false;
  let raw: RawNote[] = [];
  const open = new Map<number, RawNote>();
  let result: QuantizeResult | null = null;
  let playTimers: number[] = [];

  const unsubOn = input.onNoteOn((e) => {
    if (!recording) return;
    const n: RawNote = { midi: e.midi, tOn: e.time, tOff: e.time + 200 };
    raw.push(n);
    open.set(e.midi, n);
    statusEl.textContent = t('mirror.recording', { n: raw.length, noteWord: raw.length === 1 ? t('mirror.note') : t('mirror.notes') });
  });
  const unsubOff = input.onNoteOff((e) => {
    const n = open.get(e.midi);
    if (n) { n.tOff = e.time; open.delete(e.midi); }
  });

  function clampBpm(): number {
    const v = Number(bpmEl.value);
    const bpm = Number.isFinite(v) ? Math.min(200, Math.max(40, Math.round(v))) : 90;
    bpmEl.value = String(bpm);
    return bpm;
  }

  function stopPlayback() {
    for (const t of playTimers) clearTimeout(t);
    playTimers = [];
    playBtn.textContent = t('mirror.play');
  }

  function startRecording() {
    unlockAudio();
    stopPlayback();
    recording = true;
    raw = [];
    open.clear();
    recBtn.textContent = t('mirror.stop');
    recBtn.classList.add('recording');
    playBtn.disabled = true;
    statusEl.textContent = t('mirror.recordingStart');
    if (clickEl.checked) metro.start(clampBpm());
  }

  function stopRecording() {
    recording = false;
    metro.stop();
    recBtn.textContent = t('mirror.record');
    recBtn.classList.remove('recording');
    const tEnd = performance.now();
    for (const n of open.values()) n.tOff = tEnd;
    open.clear();

    result = quantize(raw, clampBpm(), gridEl.value as '8' | '16');
    if (!result) {
      statusEl.textContent = t('mirror.nothing');
      return;
    }
    scoreEl.classList.remove('empty');
    renderScore(scoreEl, result.score, { measuresPerLine: 4 });
    const bars = result.score.measures.length;
    statusEl.textContent = t('mirror.captured', { n: raw.length, bars, barWord: bars === 1 ? t('mirror.bar') : t('mirror.bars') });
    playBtn.disabled = false;
    countNotes(raw.length);
  }

  recBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));

  playBtn.addEventListener('click', () => {
    if (!result) return;
    if (playTimers.length) { stopPlayback(); return; }
    unlockAudio();
    const t0 = now() + 0.2;
    const slotSec = result.slotMs / 1000;
    let endSlot = 0;
    for (const chords of [result.treble, result.bass]) {
      for (const c of chords) {
        for (const m of c.midis) pianoOn(m, 95, t0 + c.slot * slotSec, c.durSlots * slotSec);
        endSlot = Math.max(endSlot, c.slot + c.durSlots);
      }
    }
    playBtn.textContent = t('mirror.stopPlay');
    playTimers.push(window.setTimeout(stopPlayback, (endSlot * slotSec + 0.6) * 1000));
  });

  return () => {
    recording = false;
    metro.stop();
    stopPlayback();
    unsubOn();
    unsubOff();
  };
}
