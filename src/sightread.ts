// Feature 2 — Adaptive sight-reading with real-time feedback.
// A generated score with a live cursor: correct notes turn green, wrong ones
// flash red, rhythm is graded against your own pulse afterwards, and the
// difficulty level adapts to hold you near 85% accuracy.

import { generateExercise, Exercise } from './generator';
import { keyName, t } from './i18n';
import { tutorialHTML } from './tutorial';
import { mainStream, renderScore, NoteStatus } from './notation';
import { PlayResult, PlayThrough } from './playthrough';
import { countNotes, progress, recordSightread, save, today } from './progress';

export function mountSightread(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('read.title')}</h2>
      <p>${t('read.intro')}</p>
      ${tutorialHTML('read')}
    </div>
    <div class="toolbar">
      <span class="level-badge">${t('read.level')} <b id="sr-level"></b>/10</span>
      <label>${t('read.levelPick')}
        <select id="sr-levelsel"></select>
      </label>
      <span class="status-text" id="sr-key"></span>
      <label>${t('read.clef')}
        <select id="sr-clef">
          <option value="treble" selected>${t('read.treble')}</option>
          <option value="bass">${t('read.bass')}</option>
        </select>
      </label>
      <button id="sr-new" class="btn primary">${t('read.new')}</button>
      <span id="sr-live" class="status-text"></span>
    </div>
    <div id="sr-score" class="score-paper"></div>
    <div id="sr-results" class="results hidden"></div>
  `;

  const levelEl = root.querySelector('#sr-level') as HTMLElement;
  const levelSelEl = root.querySelector('#sr-levelsel') as HTMLSelectElement;
  const keyEl = root.querySelector('#sr-key') as HTMLElement;
  const clefEl = root.querySelector('#sr-clef') as HTMLSelectElement;
  const newBtn = root.querySelector('#sr-new') as HTMLButtonElement;
  const liveEl = root.querySelector('#sr-live') as HTMLElement;
  const scoreEl = root.querySelector('#sr-score') as HTMLElement;
  const resultsEl = root.querySelector('#sr-results') as HTMLElement;

  let exercise: Exercise | null = null;
  let engine: PlayThrough | null = null;
  let misses = 0;

  // Normally the level adapts automatically (the "Auto" option). Picking a
  // specific level is a free practice run: it plays that level without touching
  // — or being changed by — your real adaptive progression.
  let manual = false;
  let practiceLevel = progress().sightread.level;

  /** Highest level ever unlocked — the ceiling for manual practice so you can
   *  revisit anything you've reached but not skip ahead of the adaptive climb. */
  function maxReached(): number {
    const p = progress();
    let m = p.sightread.level;
    for (const r of p.sightread.history) if (r.level > m) m = r.level;
    return Math.min(10, Math.max(1, m));
  }
  function currentLevel(): number {
    return manual ? practiceLevel : progress().sightread.level;
  }
  function populateLevelSel() {
    const max = maxReached();
    if (manual && practiceLevel > max) practiceLevel = max;
    let html = `<option value="auto">${t('read.levelAuto')}</option>`;
    for (let l = 1; l <= max; l++) html += `<option value="${l}">${l}</option>`;
    levelSelEl.innerHTML = html;
    levelSelEl.value = manual ? String(practiceLevel) : 'auto';
  }

  const translateFlags = (flags: Map<number, string>): Map<number, string> => {
    const out = new Map<number, string>();
    for (const [i, f] of flags) out.set(i, t(`flag.${f}`));
    return out;
  };

  function startExercise() {
    engine?.dispose();
    misses = 0;
    resultsEl.classList.add('hidden');
    const level = currentLevel();
    exercise = generateExercise(level, clefEl.value as 'treble' | 'bass');
    levelEl.textContent = String(level);
    keyEl.textContent = t('read.key', { key: keyName(exercise.key) });
    const stream = mainStream(exercise.score);
    liveEl.textContent = t('read.noteCount', { n: 1, total: stream.length });
    let lastStatuses = new Map<number, NoteStatus>();

    const rerender = (statuses: Map<number, NoteStatus>, flags?: Map<number, string>) => {
      lastStatuses = statuses;
      renderScore(scoreEl, exercise!.score, {
        statuses,
        flags,
        measuresPerLine: exercise!.score.measures.length <= 4 ? 4 : Math.ceil(exercise!.score.measures.length / 2),
      });
    };

    engine = new PlayThrough(stream, {
      onUpdate: (statuses, pos) => {
        rerender(statuses);
        if (pos < stream.length) {
          liveEl.textContent = misses
            ? t('read.noteCountMiss', { n: pos + 1, total: stream.length, m: misses, missWord: misses === 1 ? t('read.miss') : t('read.misses') })
            : t('read.noteCount', { n: pos + 1, total: stream.length });
        }
      },
      onWrongNote: () => {
        misses++;
      },
      onComplete: (res) => finish(res, stream.length, () => rerender(lastStatuses, translateFlags(res.rhythmFlags))),
    });
    engine.start();
  }

  function finish(res: PlayResult, totalNotes: number, rerenderWithFlags: () => void) {
    const p = progress();
    const playedLevel = currentLevel();
    let change = '';
    if (manual) {
      // free practice — don't adapt or persist the adaptive level
      change = t('read.practiceMode', { level: playedLevel });
    } else {
      const oldLevel = p.sightread.level;
      if (res.accuracy >= 0.92 && oldLevel < 10) {
        p.sightread.level = oldLevel + 1;
        change = t('read.levelUp', { level: p.sightread.level });
      } else if (res.accuracy < 0.75 && oldLevel > 1) {
        p.sightread.level = oldLevel - 1;
        change = t('read.levelDown', { level: p.sightread.level });
      } else {
        change = t('read.levelHold');
      }
      save();
      populateLevelSel(); // a new top level may have opened up for practice
    }
    recordSightread({
      date: new Date().toISOString(),
      level: playedLevel,
      key: exercise!.key,
      clef: exercise!.clef,
      accuracy: res.accuracy,
      notesPerMin: res.notesPerMin,
      rhythmIssues: res.rhythmIssues,
      total: res.total,
    }, res.correctFirstTry, res.total);
    countNotes(totalNotes);

    const pct = Math.round(res.accuracy * 100);
    liveEl.textContent = t('read.done');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = `
      <div class="result-tiles">
        <div class="tile"><div class="tile-num ${pct >= 85 ? 'good' : pct >= 70 ? 'mid' : 'bad'}">${pct}%</div><div class="tile-label">${t('read.accLabel', { correct: res.correctFirstTry, total: res.total })}</div></div>
        <div class="tile"><div class="tile-num">${res.notesPerMin}</div><div class="tile-label">${t('read.npmLabel')}</div></div>
        <div class="tile"><div class="tile-num ${res.rhythmIssues === 0 ? 'good' : 'mid'}">${res.rhythmIssues}</div><div class="tile-label">${t('read.rhythmLabel')}</div></div>
      </div>
      <p class="result-note">${change}</p>
      <button class="btn primary" id="sr-next">${t('read.next')}</button>
    `;
    (resultsEl.querySelector('#sr-next') as HTMLButtonElement).addEventListener('click', startExercise);
    // re-render with rhythm annotations under the offending notes
    rerenderWithFlags();
  }

  levelSelEl.addEventListener('change', () => {
    const v = levelSelEl.value;
    if (v === 'auto') manual = false;
    else { manual = true; practiceLevel = Number(v); }
    startExercise();
  });
  clefEl.addEventListener('change', startExercise);
  newBtn.addEventListener('click', startExercise);
  populateLevelSel();
  startExercise();

  return () => engine?.dispose();
}
