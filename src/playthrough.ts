// Shared play-through engine: given the expected note stream, consume live
// note-on events, track a cursor, first-attempt pitch accuracy, onset times,
// and (afterwards) rhythm flags from the player's own tempo.

import { input, NoteEvent } from './events';
import { StreamItem, NoteStatus } from './notation';

export interface PlayResult {
  total: number;
  correctFirstTry: number;
  accuracy: number;          // 0..1
  elapsedMs: number;
  notesPerMin: number;
  rhythmFlags: Map<number, string>; // drawIndex -> 'rushed' | 'dragged'
  rhythmIssues: number;
  evenness: number;          // 0..1, timing consistency (1 = perfectly even)
}

export interface PlayThroughOpts {
  onUpdate(statuses: Map<number, NoteStatus>, pos: number): void;
  onComplete(result: PlayResult): void;
  onWrongNote?(midi: number): void;
}

export class PlayThrough {
  private pos = 0;
  private firstTry: boolean[] = [];
  private attempted: boolean[] = [];
  private onsets: number[] = [];
  private startTime = 0;
  private statuses = new Map<number, NoteStatus>();
  private collected = new Set<number>();
  private unsub: (() => void) | null = null;
  private errorTimer: number | null = null;
  done = false;

  constructor(private stream: StreamItem[], private opts: PlayThroughOpts) {}

  start(): void {
    this.firstTry = this.stream.map(() => true);
    this.attempted = this.stream.map(() => false);
    this.setCursor();
    this.unsub = input.onNoteOn((e) => this.handle(e));
  }

  private setCursor(): void {
    this.statuses = new Map(this.statuses);
    const item = this.stream[this.pos];
    if (item) for (const di of item.drawIndices) this.statuses.set(di, 'current');
    this.opts.onUpdate(this.statuses, this.pos);
  }

  private handle(e: NoteEvent): void {
    if (this.done || this.pos >= this.stream.length) return;
    const item = this.stream[this.pos];
    if (this.startTime === 0) this.startTime = e.time;

    if (item.midis.includes(e.midi) && !this.collected.has(e.midi)) {
      this.collected.add(e.midi);
      if (this.collected.size >= item.midis.length) {
        // item complete
        if (this.errorTimer) { clearTimeout(this.errorTimer); this.errorTimer = null; }
        const ok = this.firstTry[this.pos];
        for (const di of item.drawIndices) this.statuses.set(di, ok ? 'correct' : 'error');
        this.onsets.push(e.time);
        this.collected.clear();
        this.pos++;
        if (this.pos >= this.stream.length) {
          this.finish(e.time);
        } else {
          this.setCursor();
        }
      }
    } else if (!item.midis.includes(e.midi)) {
      // wrong pitch: flash the expected note red, count the miss once
      this.firstTry[this.pos] = false;
      this.attempted[this.pos] = true;
      this.opts.onWrongNote?.(e.midi);
      for (const di of item.drawIndices) this.statuses.set(di, 'error');
      this.opts.onUpdate(new Map(this.statuses), this.pos);
      if (this.errorTimer) clearTimeout(this.errorTimer);
      this.errorTimer = window.setTimeout(() => {
        if (!this.done && this.pos < this.stream.length) this.setCursor();
      }, 350);
    }
  }

  private finish(endTime: number): void {
    this.done = true;
    this.unsub?.();
    const total = this.stream.length;
    const correctFirstTry = this.firstTry.filter(Boolean).length;
    const elapsedMs = endTime - this.startTime;
    const notesPerMin = elapsedMs > 0 ? Math.round((total / (elapsedMs / 60000)) * 10) / 10 : 0;

    // Rhythm: compare each inter-onset interval with the written duration,
    // scaled by the player's own average beat length.
    const rhythmFlags = new Map<number, string>();
    let rhythmIssues = 0;
    let evenness = 1;
    if (total >= 6) {
      const iois: number[] = [];
      const beatsArr: number[] = [];
      for (let i = 0; i < this.onsets.length - 1; i++) {
        iois.push(this.onsets[i + 1] - this.onsets[i]);
        beatsArr.push(this.stream[i].durBeats);
      }
      const ratios = iois.map((ms, i) => ms / beatsArr[i]).sort((a, b) => a - b);
      const beatMs = ratios[Math.floor(ratios.length / 2)]; // median ms per beat
      if (beatMs > 50) {
        // Timing consistency: lower spread of per-beat ratios = more even.
        const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
        const variance = ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
        evenness = Math.max(0, Math.min(1, 1 - cv));
        for (let i = 0; i < iois.length; i++) {
          const expected = beatsArr[i] * beatMs;
          const r = iois[i] / expected;
          if (r < 0.65) { rhythmFlags.set(this.stream[i].drawIndices[0], 'rushed'); rhythmIssues++; }
          else if (r > 1.6) { rhythmFlags.set(this.stream[i].drawIndices[0], 'held'); rhythmIssues++; }
        }
      }
    }

    this.opts.onUpdate(new Map(this.statuses), this.pos);
    this.opts.onComplete({
      total, correctFirstTry,
      accuracy: total ? correctFirstTry / total : 0,
      elapsedMs, notesPerMin, rhythmFlags, rhythmIssues, evenness,
    });
  }

  dispose(): void {
    this.done = true;
    this.unsub?.();
    if (this.errorTimer) clearTimeout(this.errorTimer);
  }
}
