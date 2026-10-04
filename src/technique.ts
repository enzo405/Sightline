// Feature 6 — Technique Trainer.
// Scales, arpeggios, and five-finger patterns with correct standard fingering,
// graded for accuracy and evenness, tracking your top *clean* tempo per drill.
// Reuses the shared PlayThrough engine and notation renderer.

import { keyName, t } from './i18n';
import { tutorialHTML } from './tutorial';
import { mainStream, renderScore, Measure, NoteStatus, Score, ScoreNote } from './notation';
import { PlayThrough } from './playthrough';
import { countNotes, progress, recordTechnique } from './progress';
import { KEYS, midiFromPc } from './theory';

export type ExType = 'five-major' | 'five-minor' | 'scale-major' | 'arpeggio-major';
export type Hand = 'right' | 'left';

// Roots we have confident, standard one-octave fingering for.
const ROOTS = ['C', 'G', 'D', 'A', 'E', 'F'];

// Semitone offsets from the tonic for each shape (ascending).
const SHAPES: Record<ExType, number[]> = {
  'five-major': [0, 2, 4, 5, 7],
  'five-minor': [0, 2, 3, 5, 7],
  'scale-major': [0, 2, 4, 5, 7, 9, 11, 12],
  'arpeggio-major': [0, 4, 7, 12],
};

// Standard fingerings (ascending). Descending mirrors them.
// Scales: RH thumb-under; F major is the classic RH exception (1234 1234).
const SCALE_RH: Record<string, number[]> = {
  C: [1, 2, 3, 1, 2, 3, 4, 5], G: [1, 2, 3, 1, 2, 3, 4, 5], D: [1, 2, 3, 1, 2, 3, 4, 5],
  A: [1, 2, 3, 1, 2, 3, 4, 5], E: [1, 2, 3, 1, 2, 3, 4, 5], F: [1, 2, 3, 4, 1, 2, 3, 4],
};
const SCALE_LH = [5, 4, 3, 2, 1, 3, 2, 1]; // same for all six roots, one octave

function fingersAscending(type: ExType, root: string, hand: Hand): number[] {
  if (type === 'scale-major') return hand === 'right' ? SCALE_RH[root] : SCALE_LH;
  if (type === 'arpeggio-major') return hand === 'right' ? [1, 2, 3, 5] : [5, 3, 2, 1];
  // five-finger patterns: one finger per note
  return hand === 'right' ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
}

interface Cell { midi: number; finger: string }

/** Build the ascending-then-descending note+finger sequence (top note once). */
function buildSequence(type: ExType, root: string, hand: Hand): Cell[] {
  const tonicPc = KEYS[root].scale[0];
  const octave = hand === 'right' ? 4 : 3;
  const base = midiFromPc(tonicPc, octave);
  const offs = SHAPES[type];
  const fAsc = fingersAscending(type, root, hand);

  const upMidis = offs.map((o) => base + o);
  const upFingers = fAsc;
  // descending: everything except the top note, reversed
  const downMidis = upMidis.slice(0, -1).reverse();
  const downFingers = upFingers.slice(0, -1).reverse();

  const midis = [...upMidis, ...downMidis];
  const fingers = [...upFingers, ...downFingers];
  return midis.map((midi, i) => ({ midi, finger: String(fingers[i]) }));
}

/** Chunk quarter-note cells into 4/4 measures, padding the last with rests. */
function toScore(seq: Cell[], key: string, clef: 'treble' | 'bass'): Score {
  const measures: Measure[] = [];
  for (let i = 0; i < seq.length; i += 4) {
    const slice = seq.slice(i, i + 4);
    const treble: ScoreNote[] = slice.map((c) => ({ midis: [c.midi], dur: 'q', finger: c.finger }));
    while (treble.length < 4) treble.push({ midis: [], dur: 'q', rest: true });
    measures.push({ treble });
  }
  return { measures, key, clef };
}

/** Public: full notated drill (ascending+descending, standard fingering) for
 *  reuse outside the Technique room — e.g. the 30-day daily program. */
export function buildTechniqueScore(type: ExType, root: string, hand: Hand): Score {
  const clef: 'treble' | 'bass' = hand === 'right' ? 'treble' : 'bass';
  return toScore(buildSequence(type, root, hand), root, clef);
}

export function mountTechnique(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('tech.title')}</h2>
      <p>${t('tech.intro')}</p>
      ${tutorialHTML('technique')}
    </div>
    <div class="toolbar">
      <label>${t('tech.type')}
        <select id="tc-type">
          <option value="five-major">${t('tech.fiveMajor')}</option>
          <option value="five-minor">${t('tech.fiveMinor')}</option>
          <option value="scale-major">${t('tech.scaleMajor')}</option>
          <option value="arpeggio-major">${t('tech.arpeggio')}</option>
        </select>
      </label>
      <label>${t('tech.root')}
        <select id="tc-root">${ROOTS.map((r) => `<option value="${r}">${keyName(r)}</option>`).join('')}</select>
      </label>
      <label>${t('tech.hand')}
        <select id="tc-hand">
          <option value="right">${t('tech.right')}</option>
          <option value="left">${t('tech.left')}</option>
        </select>
      </label>
      <button id="tc-new" class="btn primary">${t('tech.new')}</button>
      <span class="level-badge" id="tc-best"></span>
      <span id="tc-live" class="status-text"></span>
    </div>
    <div id="tc-score" class="score-paper"></div>
    <div id="tc-results" class="results hidden"></div>
  `;

  const typeEl = root.querySelector('#tc-type') as HTMLSelectElement;
  const rootEl = root.querySelector('#tc-root') as HTMLSelectElement;
  const handEl = root.querySelector('#tc-hand') as HTMLSelectElement;
  const newBtn = root.querySelector('#tc-new') as HTMLButtonElement;
  const bestEl = root.querySelector('#tc-best') as HTMLElement;
  const liveEl = root.querySelector('#tc-live') as HTMLElement;
  const scoreEl = root.querySelector('#tc-score') as HTMLElement;
  const resultsEl = root.querySelector('#tc-results') as HTMLElement;

  let engine: PlayThrough | null = null;

  function drillId(): string {
    return `${typeEl.value}:${rootEl.value}:${handEl.value}`;
  }

  function renderBest() {
    const entry = progress().technique[drillId()];
    bestEl.textContent = entry && entry.bestNpm
      ? t('tech.best', { npm: entry.bestNpm })
      : t('tech.noBest');
  }

  function start() {
    engine?.dispose();
    resultsEl.classList.add('hidden');
    renderBest();

    const type = typeEl.value as ExType;
    const rootKey = rootEl.value;
    const hand = handEl.value as Hand;
    const score = buildTechniqueScore(type, rootKey, hand);
    const stream = mainStream(score);
    liveEl.textContent = t('read.noteCount', { n: 1, total: stream.length });

    const rerender = (statuses: Map<number, NoteStatus>) => {
      renderScore(scoreEl, score, { statuses, showFingering: true, measuresPerLine: 4 });
    };

    engine = new PlayThrough(stream, {
      onUpdate: (statuses, pos) => {
        rerender(statuses);
        if (pos < stream.length) liveEl.textContent = t('read.noteCount', { n: pos + 1, total: stream.length });
      },
      onComplete: (res) => {
        const pct = Math.round(res.accuracy * 100);
        const even = Math.round(res.evenness * 100);
        const clean = res.accuracy >= 0.95;
        const newBest = recordTechnique(drillId(), res.notesPerMin, clean);
        countNotes(stream.length);
        renderBest();

        let note: string;
        if (newBest) note = t('tech.newBest', { npm: res.notesPerMin });
        else if (clean) note = t('tech.clean');
        else note = t('tech.notClean', { pct });

        liveEl.textContent = t('read.done');
        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = `
          <div class="result-tiles">
            <div class="tile"><div class="tile-num ${pct >= 95 ? 'good' : pct >= 80 ? 'mid' : 'bad'}">${pct}%</div><div class="tile-label">${t('tech.accLabel')}</div></div>
            <div class="tile"><div class="tile-num">${res.notesPerMin}</div><div class="tile-label">${t('tech.npmLabel')}</div></div>
            <div class="tile"><div class="tile-num ${even >= 85 ? 'good' : even >= 65 ? 'mid' : 'bad'}">${even}%</div><div class="tile-label">${t('tech.evenLabel')}</div></div>
          </div>
          <p class="result-note">${note}</p>
          <button class="btn primary" id="tc-again">${t('tech.again')}</button>
        `;
        (resultsEl.querySelector('#tc-again') as HTMLButtonElement).addEventListener('click', start);
      },
    });
    engine.start();
  }

  typeEl.addEventListener('change', start);
  rootEl.addEventListener('change', start);
  handEl.addEventListener('change', start);
  newBtn.addEventListener('click', start);
  start();

  return () => engine?.dispose();
}
