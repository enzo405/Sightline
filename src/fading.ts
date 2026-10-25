// Feature 3 — Fading Score training.
// A familiar piece starts with note names + fingering; each level strips a
// layer of support until whole measures go blank and you play from reading
// flow + memory. In hidden bars, notes materialize as you play them.

import { t } from './i18n';
import { tutorialHTML } from './tutorial';
import { followNote, mainStream, renderScore, NoteStatus, Score } from './notation';
import { pieceScore, PIECES, pieceTitle } from './pieces';
import { importBookmarksJSON, loadBookmarks } from './bookmarks';
import { ETUDE_IDS, generateEtude, isEtude } from './etudes';
import { countNotes, progress, save } from './progress';
import { PlayThrough } from './playthrough';

interface FadeLevel {
  labelKey: string;
  showNames: boolean;
  showFingering: boolean;
  hide: (measureCount: number) => Set<number>;
}

export const FADE_LEVELS: FadeLevel[] = [
  { labelKey: 'fade.level1', showNames: true, showFingering: true, hide: () => new Set() },
  { labelKey: 'fade.level2', showNames: false, showFingering: true, hide: () => new Set() },
  { labelKey: 'fade.level3', showNames: false, showFingering: false, hide: () => new Set() },
  {
    labelKey: 'fade.level4',
    showNames: false, showFingering: false,
    hide: (n) => new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % 4 === 2)),
  },
  {
    labelKey: 'fade.level5',
    showNames: false, showFingering: false,
    hide: (n) => new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1)),
  },
];

// Imported / saved Mirror pieces show up here too, keyed "bm:<bookmark id>".
const BM_PREFIX = 'bm:';

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function pieceOptions(): string {
  const bms = loadBookmarks();
  return `
    ${PIECES.map((p) => `<option value="${p.id}">${pieceTitle(p.id)}</option>`).join('')}
    <optgroup label="${t('fade.etudeGroup')}">
      ${ETUDE_IDS.map((id) => `<option value="${id}">${t(`piece.${id}`)}</option>`).join('')}
    </optgroup>
    ${bms.length ? `<optgroup label="${t('fade.myPieces')}">
      ${bms.map((b) => `<option value="${BM_PREFIX}${b.id}">${escapeHtml(b.name)}</option>`).join('')}
    </optgroup>` : ''}
  `;
}

function scoreFor(id: string): Score | null {
  if (id.startsWith(BM_PREFIX)) {
    const bm = loadBookmarks().find((b) => b.id === id.slice(BM_PREFIX.length));
    return bm ? bm.result.score : null;
  }
  return isEtude(id) ? generateEtude(id) : pieceScore(id);
}

export function mountFading(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('fade.title')}</h2>
      <p>${t('fade.intro')}</p>
      ${tutorialHTML('fading')}
    </div>
    <div class="toolbar">
      <label>${t('fade.piece')}
        <select id="fd-piece">${pieceOptions()}</select>
      </label>
      <button id="fd-import" class="btn ghost" title="${t('fade.importHint')}">${t('mirror.import')}</button>
      <input type="file" id="fd-import-file" accept="application/json,.json" hidden>
      <span class="level-badge">${t('fade.stage')} <b id="fd-level"></b>/5</span>
      <button id="fd-restart" class="btn primary">${t('fade.restart')}</button>
      <span id="fd-live" class="status-text"></span>
    </div>
    <p class="fade-desc" id="fd-desc"></p>
    <div id="fd-score" class="score-paper"></div>
    <div id="fd-results" class="results hidden"></div>
  `;

  const pieceEl = root.querySelector('#fd-piece') as HTMLSelectElement;
  const levelEl = root.querySelector('#fd-level') as HTMLElement;
  const descEl = root.querySelector('#fd-desc') as HTMLElement;
  const liveEl = root.querySelector('#fd-live') as HTMLElement;
  const scoreEl = root.querySelector('#fd-score') as HTMLElement;
  const resultsEl = root.querySelector('#fd-results') as HTMLElement;
  const restartBtn = root.querySelector('#fd-restart') as HTMLButtonElement;

  let engine: PlayThrough | null = null;

  function pieceLevel(id: string): number {
    return progress().fading[id]?.level ?? 0; // 0-based index into FADE_LEVELS
  }

  function start() {
    engine?.dispose();
    resultsEl.classList.add('hidden');
    let id = pieceEl.value;
    let score = scoreFor(id);
    if (!score) { // bookmark deleted since — fall back to the first piece
      pieceEl.selectedIndex = 0;
      id = pieceEl.value;
      score = scoreFor(id)!;
    }
    const lvlIdx = pieceLevel(id);
    const fade = FADE_LEVELS[lvlIdx];
    const hidden = fade.hide(score.measures.length);
    levelEl.textContent = String(lvlIdx + 1);
    descEl.textContent = t(fade.labelKey);

    const stream = mainStream(score);
    liveEl.textContent = t('read.noteCount', { n: 1, total: stream.length });

    const rerender = (statuses: Map<number, NoteStatus>, pos: number) => {
      const drawn = renderScore(scoreEl, score!, {
        statuses,
        showNames: fade.showNames,
        showFingering: fade.showFingering,
        hiddenMeasures: hidden,
        measuresPerLine: 4,
      });
      // long pieces: keep the cursor note on screen
      const cur = stream[pos] && drawn.main[stream[pos].drawIndices[0]];
      if (cur) followNote(scoreEl, cur);
    };

    engine = new PlayThrough(stream, {
      onUpdate: (statuses, pos) => {
        rerender(statuses, pos);
        if (pos < stream.length) liveEl.textContent = t('read.noteCount', { n: pos + 1, total: stream.length });
      },
      onComplete: (res) => {
        const pct = Math.round(res.accuracy * 100);
        const p = progress();
        const entry = p.fading[id] ?? { level: 0, completions: 0 };
        entry.completions++;
        let msg: string;
        if (res.accuracy >= 0.9 && entry.level < FADE_LEVELS.length - 1) {
          entry.level++;
          msg = t('fade.faded', { pct, next: t(FADE_LEVELS[entry.level].labelKey) });
        } else if (res.accuracy >= 0.9) {
          msg = t('fade.mastered', { pct });
        } else {
          msg = t('fade.retry', { pct });
        }
        p.fading[id] = entry;
        save();
        countNotes(stream.length);
        liveEl.textContent = t('read.done');
        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = `
          <p class="result-note">${msg}</p>
          <button class="btn primary" id="fd-again">${t('fade.again')}</button>
        `;
        (resultsEl.querySelector('#fd-again') as HTMLButtonElement).addEventListener('click', start);
      },
    });
    engine.start();
  }

  pieceEl.addEventListener('change', start);
  restartBtn.addEventListener('click', start);

  // Import a bookmarks/score JSON (same format as the Mirror) and select it.
  const importBtn = root.querySelector('#fd-import') as HTMLButtonElement;
  const importFile = root.querySelector('#fd-import-file') as HTMLInputElement;
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const before = new Set(loadBookmarks().map((b) => b.id));
        const res = importBookmarksJSON(String(reader.result));
        const added = loadBookmarks().find((b) => !before.has(b.id));
        pieceEl.innerHTML = pieceOptions();
        if (added) {
          pieceEl.value = BM_PREFIX + added.id;
          start();
        }
        liveEl.textContent = t('mirror.imported', { added: res.added, skipped: res.skipped });
      } catch {
        liveEl.textContent = t('mirror.importError');
      }
      importFile.value = '';
    };
    reader.readAsText(file);
  });
  start();

  return () => engine?.dispose();
}
