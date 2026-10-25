// Feature 1 — Play-to-Notation Mirror.
// Record from any input (MIDI piano, on-screen keys, computer keys), quantize
// to a grid anchored on your first note, and see it engraved instantly.
// Then play it back.

import { input } from './events';
import { t } from './i18n';
import { tutorialHTML } from './tutorial';
import { Metronome } from './metronome';
import { RenderedNotes, ScoreNote, followNote, renderScore } from './notation';
import { countNotes } from './progress';
import { QuantizeResult, RawNote, TimedChord, quantize } from './quantize';
import { now, pianoOn, unlockAudio } from './synth';
import {
  Bookmark,
  addBookmark,
  deleteBookmark,
  exportBookmarksJSON,
  importBookmarksJSON,
  loadBookmarks,
  renameBookmark,
} from './bookmarks';

const SPEEDS = [1, 0.9, 0.75, 0.6, 0.5, 0.4, 0.25];
const LOOKAHEAD_SEC = 0.25; // how far ahead playback schedules notes

/** Group a stave's flat notes into tie chains: one entry per sounded chord,
 *  holding the flat indices of every drawn note in that chain. */
function chordChains(notes: ScoreNote[]): number[][] {
  const chains: number[][] = [];
  let open: number[] | null = null;
  notes.forEach((n, i) => {
    if (n.rest) { open = null; return; }
    if (open) open.push(i);
    else { open = [i]; chains.push(open); }
    if (!n.tieToNext) open = null;
  });
  return chains;
}

export function mountMirror(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('mirror.title')}</h2>
      <p>${t('mirror.intro')}</p>
      ${tutorialHTML('mirror')}
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
      <label>${t('mirror.speed')}
        <select id="mir-speed">
          ${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${Math.round(s * 100)}%</option>`).join('')}
        </select>
      </label>
      <button id="mir-save" class="btn" disabled>${t('mirror.save')}</button>
      <span id="mir-status" class="status-text">${t('mirror.ready')}</span>
    </div>
    <div id="mir-score" class="score-paper empty">${t('mirror.placeholder')}</div>
    <section class="panel mir-bookmarks">
      <div class="mir-bm-head">
        <h3>${t('mirror.bookmarks')}</h3>
        <div class="mir-bm-io">
          <button id="mir-export" class="btn ghost">${t('mirror.export')}</button>
          <button id="mir-import" class="btn ghost">${t('mirror.import')}</button>
          <input type="file" id="mir-import-file" accept="application/json,.json" hidden>
        </div>
      </div>
      <ul id="mir-bm-list" class="mir-bm-list"></ul>
    </section>
  `;

  const bpmEl = root.querySelector('#mir-bpm') as HTMLInputElement;
  const gridEl = root.querySelector('#mir-grid') as HTMLSelectElement;
  const clickEl = root.querySelector('#mir-click') as HTMLInputElement;
  const recBtn = root.querySelector('#mir-rec') as HTMLButtonElement;
  const playBtn = root.querySelector('#mir-play') as HTMLButtonElement;
  const speedEl = root.querySelector('#mir-speed') as HTMLSelectElement;
  const saveBtn = root.querySelector('#mir-save') as HTMLButtonElement;
  const statusEl = root.querySelector('#mir-status') as HTMLElement;
  const scoreEl = root.querySelector('#mir-score') as HTMLElement;
  const bmListEl = root.querySelector('#mir-bm-list') as HTMLElement;
  const exportBtn = root.querySelector('#mir-export') as HTMLButtonElement;
  const importBtn = root.querySelector('#mir-import') as HTMLButtonElement;
  const importFile = root.querySelector('#mir-import-file') as HTMLInputElement;

  const metro = new Metronome();
  let recording = false;
  let raw: RawNote[] = [];
  const open = new Map<number, RawNote>();
  let result: QuantizeResult | null = null;
  let resultBpm = 90;
  let resultGrid: '8' | '16' = '8';
  let rendered: RenderedNotes | null = null;

  // Playback: a lookahead scheduler keyed to the audio clock. The anchor maps
  // audio time <-> score slot, so a speed change re-anchors at the playhead and
  // takes effect immediately; stopping simply stops scheduling.
  let playing = false;
  let speed = 1;
  let events: TimedChord[] = [];
  let nextEvent = 0;
  let endSlot = 0;
  let anchorTime = 0;
  let anchorSlot = 0;
  let schedTimer = 0;
  let rafId = 0;
  let lit: SVGElement[] = [];

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

  function showScore(r: QuantizeResult) {
    scoreEl.classList.remove('empty');
    rendered = renderScore(scoreEl, r.score, { measuresPerLine: 4 });
  }

  const secPerSlot = () => (result ? result.slotMs / 1000 / speed : 0);
  const slotAt = (time: number) => anchorSlot + (time - anchorTime) / secPerSlot();
  const timeOf = (slot: number) => anchorTime + (slot - anchorSlot) * secPerSlot();

  function schedule() {
    if (!playing) return;
    const horizon = now() + LOOKAHEAD_SEC;
    while (nextEvent < events.length && timeOf(events[nextEvent].slot) < horizon) {
      const ev = events[nextEvent++];
      const when = Math.max(now(), timeOf(ev.slot));
      for (const m of ev.midis) pianoOn(m, 95, when, ev.durSlots * secPerSlot());
    }
    if (nextEvent >= events.length && slotAt(now()) >= endSlot) stopPlayback();
  }

  // Per hand: its chords' draw-index groups and the stave they are drawn on.
  // A single-stave score draws whichever hand it has on the main stave.
  let tracks: { chords: TimedChord[]; chains: number[][]; els: (SVGElement | undefined)[] }[] = [];
  function buildTracks(r: QuantizeResult, notes: RenderedNotes) {
    const ms = r.score.measures;
    const mainChains = chordChains(ms.flatMap((m) => m.treble));
    if (r.score.grand) {
      tracks = [
        { chords: r.treble, chains: mainChains, els: notes.main },
        { chords: r.bass, chains: chordChains(ms.flatMap((m) => m.bass ?? [])), els: notes.bass },
      ];
    } else {
      tracks = [{ chords: r.treble.length ? r.treble : r.bass, chains: mainChains, els: notes.main }];
    }
  }

  function setLit(next: SVGElement[]) {
    for (const el of lit) if (!next.includes(el)) el.classList.remove('playing');
    for (const el of next) el.classList.add('playing');
    lit = next;
  }

  function trackPlayhead() {
    if (!playing) return;
    const cur = slotAt(now());
    const next: SVGElement[] = [];
    for (const tr of tracks) {
      tr.chords.forEach((c, i) => {
        if (cur < c.slot || cur >= c.slot + c.durSlots) return;
        for (const di of tr.chains[i] ?? []) { const el = tr.els[di]; if (el) next.push(el); }
      });
    }
    const first = next[0];
    if (first && first !== lit[0]) followNote(scoreEl, first);
    setLit(next);
    rafId = requestAnimationFrame(trackPlayhead);
  }

  function startPlayback() {
    if (!result || !rendered) return;
    unlockAudio();
    events = [...result.treble, ...result.bass].sort((a, b) => a.slot - b.slot);
    endSlot = Math.max(0, ...events.map((e) => e.slot + e.durSlots));
    buildTracks(result, rendered);
    nextEvent = 0;
    anchorSlot = 0;
    anchorTime = now() + 0.2;
    playing = true;
    playBtn.textContent = t('mirror.stopPlay');
    schedule();
    schedTimer = window.setInterval(schedule, 50);
    rafId = requestAnimationFrame(trackPlayhead);
  }

  function stopPlayback() {
    playing = false;
    clearInterval(schedTimer);
    cancelAnimationFrame(rafId);
    setLit([]);
    playBtn.textContent = t('mirror.play');
  }

  speedEl.addEventListener('change', () => {
    const next = Number(speedEl.value) || 1;
    if (playing) {
      // re-anchor at the playhead so the tempo changes without a jump
      const tNow = Math.max(now(), anchorTime);
      anchorSlot = slotAt(tNow);
      anchorTime = tNow;
    }
    speed = next;
  });

  function startRecording() {
    unlockAudio();
    stopPlayback();
    recording = true;
    raw = [];
    open.clear();
    recBtn.textContent = t('mirror.stop');
    recBtn.classList.add('recording');
    playBtn.disabled = true;
    saveBtn.disabled = true;
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

    const bpm = clampBpm();
    const grid = gridEl.value as '8' | '16';
    result = quantize(raw, bpm, grid);
    if (!result) {
      statusEl.textContent = t('mirror.nothing');
      return;
    }
    resultBpm = bpm;
    resultGrid = grid;
    showScore(result);
    const bars = result.score.measures.length;
    statusEl.textContent = t('mirror.captured', { n: raw.length, bars, barWord: bars === 1 ? t('mirror.bar') : t('mirror.bars') });
    playBtn.disabled = false;
    saveBtn.disabled = false;
    countNotes(raw.length);
  }

  recBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));

  playBtn.addEventListener('click', () => (playing ? stopPlayback() : startPlayback()));

  // ---------- bookmarks ----------
  function loadIntoMirror(bm: Bookmark) {
    stopPlayback();
    result = bm.result;
    resultBpm = bm.bpm;
    resultGrid = bm.grid;
    bpmEl.value = String(bm.bpm);
    gridEl.value = bm.grid;
    showScore(bm.result);
    playBtn.disabled = false;
    saveBtn.disabled = false;
    statusEl.textContent = t('mirror.loaded', { name: bm.name });
    scoreEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderBookmarks() {
    const list = loadBookmarks();
    if (!list.length) {
      bmListEl.innerHTML = `<li class="mir-bm-empty muted">${t('mirror.noBookmarks')}</li>`;
      return;
    }
    bmListEl.innerHTML = list.map((bm) => {
      const bars = bm.result.score.measures.length;
      return `<li class="mir-bm-item" data-id="${bm.id}">
        <div class="mir-bm-info">
          <span class="mir-bm-name">${escapeHtml(bm.name)}</span>
          <small class="muted">${bm.bpm} ${t('mirror.bpm')} · ${bars} ${bars === 1 ? t('mirror.bar') : t('mirror.bars')}</small>
        </div>
        <div class="mir-bm-actions">
          <button class="btn ghost" data-act="load">${t('mirror.load')}</button>
          <button class="btn ghost" data-act="rename">${t('mirror.rename')}</button>
          <button class="btn ghost" data-act="delete">${t('mirror.delete')}</button>
        </div>
      </li>`;
    }).join('');
  }

  function escapeHtml(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  saveBtn.addEventListener('click', () => {
    if (!result) return;
    const fallback = t('mirror.saveDefault', { n: loadBookmarks().length + 1 });
    const name = prompt(t('mirror.savePrompt'), fallback);
    if (name === null) return;
    const bm = addBookmark(name, resultBpm, resultGrid, result);
    renderBookmarks();
    statusEl.textContent = t('mirror.saved', { name: bm.name });
  });

  bmListEl.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
    if (!btn) return;
    const li = btn.closest('.mir-bm-item') as HTMLElement | null;
    const id = li?.dataset.id;
    if (!id) return;
    const bm = loadBookmarks().find((b) => b.id === id);
    if (!bm) return;
    const act = btn.dataset.act;
    if (act === 'load') {
      unlockAudio();
      loadIntoMirror(bm);
    } else if (act === 'rename') {
      const name = prompt(t('mirror.renamePrompt'), bm.name);
      if (name === null) return;
      renameBookmark(id, name);
      renderBookmarks();
    } else if (act === 'delete') {
      if (!confirm(t('mirror.deleteConfirm', { name: bm.name }))) return;
      deleteBookmark(id);
      renderBookmarks();
    }
  });

  exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportBookmarksJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sightline-bookmarks.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = importBookmarksJSON(String(reader.result));
        renderBookmarks();
        statusEl.textContent = t('mirror.imported', { added: res.added, skipped: res.skipped });
      } catch {
        statusEl.textContent = t('mirror.importError');
      }
      importFile.value = '';
    };
    reader.readAsText(file);
  });

  renderBookmarks();

  return () => {
    recording = false;
    metro.stop();
    stopPlayback();
    unsubOn();
    unsubOff();
  };
}
