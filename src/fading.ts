// Feature 3 — Fading Score training.
// A familiar piece starts with note names + fingering; each level strips a
// layer of support until whole measures go blank and you play from reading
// flow + memory. In hidden bars, notes materialize as you play them.

import { mainStream, renderScore, NoteStatus } from './notation';
import { pieceScore, PIECES } from './pieces';
import { countNotes, progress, save } from './progress';
import { PlayThrough } from './playthrough';

interface FadeLevel {
  label: string;
  showNames: boolean;
  showFingering: boolean;
  hide: (measureCount: number) => Set<number>;
}

export const FADE_LEVELS: FadeLevel[] = [
  { label: 'Full hints — note names + fingering', showNames: true, showFingering: true, hide: () => new Set() },
  { label: 'Fingering only — note names are gone', showNames: false, showFingering: true, hide: () => new Set() },
  { label: 'Notation only — no hints left', showNames: false, showFingering: false, hide: () => new Set() },
  {
    label: 'Reading ahead — every 4th bar is blank',
    showNames: false, showFingering: false,
    hide: (n) => new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % 4 === 2)),
  },
  {
    label: 'From memory — every other bar is blank',
    showNames: false, showFingering: false,
    hide: (n) => new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1)),
  },
];

export function mountFading(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>Fading Score</h2>
      <p>Pick a piece you know by ear. Level 1 shows every hint; each pass at
      <b>≥90% accuracy</b> fades one layer — first note names, then fingering, then whole bars go blank
      (play them from memory: the notes reappear as you get them right). This trains reading ahead
      and playing through instead of stopping at every bar.</p>
    </div>
    <div class="toolbar">
      <label>Piece
        <select id="fd-piece">${PIECES.map((p) => `<option value="${p.id}">${p.title}</option>`).join('')}</select>
      </label>
      <span class="level-badge">Stage <b id="fd-level"></b>/5</span>
      <button id="fd-restart" class="btn primary">Restart piece</button>
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
    const id = pieceEl.value;
    const lvlIdx = pieceLevel(id);
    const fade = FADE_LEVELS[lvlIdx];
    const score = pieceScore(id);
    const hidden = fade.hide(score.measures.length);
    levelEl.textContent = String(lvlIdx + 1);
    descEl.textContent = fade.label;

    const stream = mainStream(score);
    liveEl.textContent = `Note 1/${stream.length}`;

    const rerender = (statuses: Map<number, NoteStatus>) => {
      renderScore(scoreEl, score, {
        statuses,
        showNames: fade.showNames,
        showFingering: fade.showFingering,
        hiddenMeasures: hidden,
        measuresPerLine: 4,
      });
    };

    engine = new PlayThrough(stream, {
      onUpdate: (statuses, pos) => {
        rerender(statuses);
        if (pos < stream.length) liveEl.textContent = `Note ${pos + 1}/${stream.length}`;
      },
      onComplete: (res) => {
        const pct = Math.round(res.accuracy * 100);
        const p = progress();
        const entry = p.fading[id] ?? { level: 0, completions: 0 };
        entry.completions++;
        let msg: string;
        if (res.accuracy >= 0.9 && entry.level < FADE_LEVELS.length - 1) {
          entry.level++;
          msg = `🎉 ${pct}% — layer faded! Next: <b>${FADE_LEVELS[entry.level].label}</b>`;
        } else if (res.accuracy >= 0.9) {
          msg = `🏆 ${pct}% — you own this piece from memory. Mastered!`;
        } else {
          msg = `${pct}% — you need ≥90% to fade the next layer. Run it again.`;
        }
        p.fading[id] = entry;
        save();
        countNotes(stream.length);
        liveEl.textContent = 'Done!';
        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = `
          <p class="result-note">${msg}</p>
          <button class="btn primary" id="fd-again">Play again →</button>
        `;
        (resultsEl.querySelector('#fd-again') as HTMLButtonElement).addEventListener('click', start);
      },
    });
    engine.start();
  }

  pieceEl.addEventListener('change', start);
  restartBtn.addEventListener('click', start);
  start();

  return () => engine?.dispose();
}
