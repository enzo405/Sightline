// Feature 2 — Adaptive sight-reading with real-time feedback.
// A generated score with a live cursor: correct notes turn green, wrong ones
// flash red, rhythm is graded against your own pulse afterwards, and the
// difficulty level adapts to hold you near 85% accuracy.

import { generateExercise, Exercise } from './generator';
import { mainStream, renderScore, NoteStatus } from './notation';
import { PlayResult, PlayThrough } from './playthrough';
import { countNotes, progress, recordSightread, save, today } from './progress';

export function mountSightread(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>Adaptive Sight-Reading</h2>
      <p>Play the highlighted note (blue) at your own steady pulse. Correct notes turn
      <span class="tag-green">green</span>, misses flash <span class="tag-red">red</span> — the exercise
      targets ~85% accuracy: score above 92% and you level up, below 75% and it eases off.
      Rhythm is judged against your own tempo after you finish.</p>
    </div>
    <div class="toolbar">
      <span class="level-badge">Level <b id="sr-level"></b>/10</span>
      <span class="status-text" id="sr-key"></span>
      <label>Clef
        <select id="sr-clef">
          <option value="treble" selected>Treble</option>
          <option value="bass">Bass</option>
        </select>
      </label>
      <button id="sr-new" class="btn primary">New exercise</button>
      <span id="sr-live" class="status-text"></span>
    </div>
    <div id="sr-score" class="score-paper"></div>
    <div id="sr-results" class="results hidden"></div>
  `;

  const levelEl = root.querySelector('#sr-level') as HTMLElement;
  const keyEl = root.querySelector('#sr-key') as HTMLElement;
  const clefEl = root.querySelector('#sr-clef') as HTMLSelectElement;
  const newBtn = root.querySelector('#sr-new') as HTMLButtonElement;
  const liveEl = root.querySelector('#sr-live') as HTMLElement;
  const scoreEl = root.querySelector('#sr-score') as HTMLElement;
  const resultsEl = root.querySelector('#sr-results') as HTMLElement;

  let exercise: Exercise | null = null;
  let engine: PlayThrough | null = null;
  let misses = 0;

  function startExercise() {
    engine?.dispose();
    misses = 0;
    resultsEl.classList.add('hidden');
    const level = progress().sightread.level;
    exercise = generateExercise(level, clefEl.value as 'treble' | 'bass');
    levelEl.textContent = String(level);
    keyEl.textContent = `Key: ${exercise.key} major`;
    const stream = mainStream(exercise.score);
    liveEl.textContent = `Note 1/${stream.length}`;
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
          liveEl.textContent = `Note ${pos + 1}/${stream.length}${misses ? ` · ${misses} miss${misses === 1 ? '' : 'es'}` : ''}`;
        }
      },
      onWrongNote: () => {
        misses++;
      },
      onComplete: (res) => finish(res, stream.length, () => rerender(lastStatuses, res.rhythmFlags)),
    });
    engine.start();
  }

  function finish(res: PlayResult, totalNotes: number, rerenderWithFlags: () => void) {
    const p = progress();
    const oldLevel = p.sightread.level;
    let change = '';
    if (res.accuracy >= 0.92 && oldLevel < 10) {
      p.sightread.level = oldLevel + 1;
      change = `⬆ Level up! Now level ${p.sightread.level}.`;
    } else if (res.accuracy < 0.75 && oldLevel > 1) {
      p.sightread.level = oldLevel - 1;
      change = `⬇ Easing off — level ${p.sightread.level}.`;
    } else {
      change = 'Holding level — right in the challenge zone.';
    }
    save();
    recordSightread({
      date: new Date().toISOString(),
      level: oldLevel,
      key: exercise!.key,
      clef: exercise!.clef,
      accuracy: res.accuracy,
      notesPerMin: res.notesPerMin,
      rhythmIssues: res.rhythmIssues,
      total: res.total,
    }, res.correctFirstTry, res.total);
    countNotes(totalNotes);

    const pct = Math.round(res.accuracy * 100);
    liveEl.textContent = 'Done!';
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = `
      <div class="result-tiles">
        <div class="tile"><div class="tile-num ${pct >= 85 ? 'good' : pct >= 70 ? 'mid' : 'bad'}">${pct}%</div><div class="tile-label">pitch accuracy (${res.correctFirstTry}/${res.total} first try)</div></div>
        <div class="tile"><div class="tile-num">${res.notesPerMin}</div><div class="tile-label">notes per minute</div></div>
        <div class="tile"><div class="tile-num ${res.rhythmIssues === 0 ? 'good' : 'mid'}">${res.rhythmIssues}</div><div class="tile-label">rhythm flags (rushed/held, vs your own pulse)</div></div>
      </div>
      <p class="result-note">${change}</p>
      <button class="btn primary" id="sr-next">Next exercise →</button>
    `;
    (resultsEl.querySelector('#sr-next') as HTMLButtonElement).addEventListener('click', startExercise);
    // re-render with rhythm annotations under the offending notes
    rerenderWithFlags();
  }

  clefEl.addEventListener('change', startExercise);
  newBtn.addEventListener('click', startExercise);
  startExercise();

  return () => engine?.dispose();
}
