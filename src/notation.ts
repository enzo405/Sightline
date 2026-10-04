// Score model + VexFlow rendering. All features share this renderer:
// single stave or grand staff, note statuses (cursor/correct/error), name and
// fingering hints, hidden measures (Fading Score), ties, beams, multi-line.

import {
  Accidental, Annotation, AnnotationVerticalJustify, Beam, Dot, Formatter,
  Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice,
} from 'vexflow';
import { KEYS, midiToVexKey } from './theory';
import { noteName } from './i18n';

export type Dur = 'w' | 'h' | 'q' | '8' | '16' | 'hd' | 'qd' | '8d';

export const DUR_BEATS: Record<Dur, number> = {
  w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, hd: 3, qd: 1.5, '8d': 0.75,
};

export interface ScoreNote {
  midis: number[];      // empty + rest=true => rest
  dur: Dur;
  rest?: boolean;
  tieToNext?: boolean;  // tied to the next note in the same stream
  finger?: string;      // fingering hint, e.g. "1" or "1,5"
}

export interface Measure {
  treble: ScoreNote[];
  bass?: ScoreNote[];
}

export interface Score {
  measures: Measure[];
  key: string;                 // 'C' | 'G' | ...
  grand?: boolean;
  clef?: 'treble' | 'bass';    // for single-stave scores
}

export type NoteStatus = 'current' | 'correct' | 'error';

export interface RenderOptions {
  statuses?: Map<number, NoteStatus>;  // flat index over main-stream notes
  showNames?: boolean;
  showFingering?: boolean;
  hiddenMeasures?: Set<number>;
  measuresPerLine?: number;
  flags?: Map<number, string>;         // e.g. index -> 'rushed'
}

const COLORS: Record<NoteStatus, string> = {
  current: '#0284c7',
  correct: '#16a34a',
  error: '#dc2626',
};

function durToVex(dur: Dur, rest: boolean): { duration: string; dots: number } {
  const dots = dur.endsWith('d') ? 1 : 0;
  const base = dots ? dur.slice(0, -1) : dur;
  return { duration: base + (rest ? 'r' : ''), dots };
}

/** One playable item of the main stream (treble/single stave, rests skipped,
 *  tie chains merged into a single expected note). */
export interface StreamItem {
  midis: number[];
  durBeats: number;
  drawIndices: number[]; // flat indices of the drawn notes in this chain
  measureIndex: number;
}

/** Extract the main-stream playable items; flat index counts ALL main-stave
 *  notes (rests included) in order, matching the renderer's numbering. */
export function mainStream(score: Score): StreamItem[] {
  const items: StreamItem[] = [];
  let flat = 0;
  let open: StreamItem | null = null; // tie chain in progress
  score.measures.forEach((m, mi) => {
    const notes = m.treble;
    for (const n of notes) {
      if (n.rest) {
        flat++;
        open = null;
        continue;
      }
      if (open) {
        open.durBeats += DUR_BEATS[n.dur];
        open.drawIndices.push(flat);
        if (!n.tieToNext) open = null;
      } else {
        const item: StreamItem = {
          midis: [...n.midis],
          durBeats: DUR_BEATS[n.dur],
          drawIndices: [flat],
          measureIndex: mi,
        };
        items.push(item);
        if (n.tieToNext) open = item;
      }
      flat++;
    }
  });
  return items;
}

interface DrawnNote {
  vex: StaveNote;
  tieToNext: boolean;
  system: number;
  hidden: boolean;
}

export function renderScore(container: HTMLElement, score: Score, opts: RenderOptions = {}): void {
  // Re-rendering wipes the container and reads its layout, which momentarily
  // collapses its height. For a tall/wide score that lets the browser clamp the
  // scroll position of the container and its scrollable ancestors (e.g. the
  // scrolling <main>) to the smaller size — so the view jumps to the top/left on
  // every played note. Snapshot the scroll offsets now and restore them after
  // the rebuild, when the full height is back.
  const scrollSnapshot: { el: Element; left: number; top: number }[] = [];
  for (let node: Element | null = container; node; node = node.parentElement) {
    if (node.scrollLeft || node.scrollTop) {
      scrollSnapshot.push({ el: node, left: node.scrollLeft, top: node.scrollTop });
    }
  }

  container.innerHTML = '';
  const keyInfo = KEYS[score.key] ?? KEYS.C;
  const mpl = opts.measuresPerLine ?? 4;
  const width = Math.max(560, container.clientWidth || 860);
  const measures = score.measures;
  const systems = Math.ceil(measures.length / mpl);
  const leftPad = 16;
  const systemGap = score.grand ? 190 : 110;
  const height = systems * systemGap + 60;

  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const drawnMain: DrawnNote[] = [];
  const beams: Beam[] = [];
  let flat = 0;

  for (let sys = 0; sys < systems; sys++) {
    const rowMeasures = measures.slice(sys * mpl, (sys + 1) * mpl);
    const y = 20 + sys * systemGap;
    const firstWidthExtra = 60;
    const mw = Math.floor((width - leftPad * 2 - firstWidthExtra) / mpl);
    let x = leftPad;

    rowMeasures.forEach((measure, i) => {
      const mi = sys * mpl + i;
      const isFirstInRow = i === 0;
      const w = mw + (isFirstInRow ? firstWidthExtra : 0);
      const hidden = opts.hiddenMeasures?.has(mi) ?? false;

      const mainClef = score.clef ?? 'treble';
      const stave = new Stave(x, y, w);
      if (isFirstInRow) {
        stave.addClef(score.grand ? 'treble' : mainClef);
        stave.addKeySignature(keyInfo.name);
      }
      if (mi === 0) stave.addTimeSignature('4/4');
      stave.setContext(ctx).draw();

      let bassStave: Stave | null = null;
      if (score.grand) {
        bassStave = new Stave(x, y + 85, w);
        if (isFirstInRow) {
          bassStave.addClef('bass');
          bassStave.addKeySignature(keyInfo.name);
        }
        if (mi === 0) bassStave.addTimeSignature('4/4');
        bassStave.setContext(ctx).draw();
        new StaveConnector(stave, bassStave).setType('brace').setContext(ctx).draw();
        new StaveConnector(stave, bassStave).setType('singleLeft').setContext(ctx).draw();
      }

      const buildNotes = (src: ScoreNote[], clef: string, isMain: boolean): StaveNote[] =>
        src.map((n) => {
          const { duration, dots } = durToVex(n.dur, !!n.rest);
          const keys = n.rest
            ? [clef === 'bass' ? 'd/3' : 'b/4']
            : n.midis.map((mm) => midiToVexKey(mm, keyInfo.preferFlats));
          const sn = new StaveNote({ clef, keys, duration });
          for (let d = 0; d < dots; d++) Dot.buildAndAttach([sn], { all: true });

          if (isMain) {
            const status = opts.statuses?.get(flat);
            const flag = opts.flags?.get(flat);
            if (hidden && !status) {
              sn.setStyle({ fillStyle: 'transparent', strokeStyle: 'transparent' });
            } else if (status) {
              sn.setStyle({ fillStyle: COLORS[status], strokeStyle: COLORS[status] });
            }
            if (!n.rest && !hidden) {
              if (opts.showNames) {
                const name = n.midis.map((mm) => noteName(mm, keyInfo.preferFlats).replace(/-?\d+$/, '')).join(' ');
                sn.addModifier(new Annotation(name).setFont('Arial', 10)
                  .setVerticalJustification(AnnotationVerticalJustify.TOP));
              }
              if (opts.showFingering && n.finger) {
                sn.addModifier(new Annotation(n.finger).setFont('Arial', 9)
                  .setVerticalJustification(AnnotationVerticalJustify.BOTTOM));
              }
            }
            if (flag && !n.rest) {
              const a = new Annotation(flag).setFont('Arial', 9, 'italic')
                .setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
              sn.addModifier(a);
            }
            drawnMain.push({ vex: sn, tieToNext: !!n.tieToNext && !n.rest, system: sys, hidden });
            flat++;
          }
          return sn;
        });

      const mainNotes = buildNotes(measure.treble, score.grand ? 'treble' : (score.clef ?? 'treble'), true);
      const voices: Voice[] = [];
      const mainVoice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false).addTickables(mainNotes);
      voices.push(mainVoice);

      let bassNotes: StaveNote[] = [];
      if (score.grand && bassStave) {
        bassNotes = buildNotes(measure.bass ?? [{ midis: [], dur: 'w', rest: true }], 'bass', false);
        voices.push(new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false).addTickables(bassNotes));
      }

      for (const v of voices) Accidental.applyAccidentals([v], keyInfo.name);

      const fmt = new Formatter();
      for (const v of voices) fmt.joinVoices([v]);
      const noteArea = w - (stave.getNoteStartX() - stave.getX()) - 14;
      fmt.format(voices, Math.max(60, noteArea));

      mainVoice.draw(ctx, stave);
      if (score.grand && bassStave && voices[1]) voices[1].draw(ctx, bassStave);

      if (!hidden) {
        beams.push(...Beam.generateBeams(mainNotes.filter((n) => !n.isRest())));
        if (bassNotes.length) beams.push(...Beam.generateBeams(bassNotes.filter((n) => !n.isRest())));
      }

      if (hidden) {
        (ctx as any).save?.();
        ctx.setFont('Georgia', 22, 'bold');
        ctx.setFillStyle('#b8b2a7');
        ctx.fillText('?', x + w / 2 - 5, y + 14);
        (ctx as any).restore?.();
      }

      x += w;
    });
  }

  for (const b of beams) b.setContext(ctx).draw();

  // Ties between consecutive main-stream notes.
  for (let i = 0; i < drawnMain.length - 1; i++) {
    const a = drawnMain[i];
    if (!a.tieToNext || a.hidden) continue;
    const b = drawnMain[i + 1];
    if (a.system === b.system) {
      new StaveTie({
        first_note: a.vex, last_note: b.vex,
        first_indices: [0], last_indices: [0],
      }).setContext(ctx).draw();
    } else {
      new StaveTie({ first_note: a.vex, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      new StaveTie({ last_note: b.vex, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
    }
  }

  // Full height is back — put the scroll offsets where they were.
  for (const s of scrollSnapshot) {
    s.el.scrollLeft = s.left;
    s.el.scrollTop = s.top;
  }
}
