// Central note-event bus. MIDI, the on-screen keyboard, and the computer
// keyboard all feed into this; features subscribe here so they don't care
// where notes come from.

export interface NoteEvent {
  midi: number;
  velocity: number; // 0..127
  time: number;     // performance.now() ms
}

type NoteHandler = (e: NoteEvent) => void;

const noteOnHandlers = new Set<NoteHandler>();
const noteOffHandlers = new Set<NoteHandler>();

export const input = {
  onNoteOn(fn: NoteHandler): () => void {
    noteOnHandlers.add(fn);
    return () => noteOnHandlers.delete(fn);
  },
  onNoteOff(fn: NoteHandler): () => void {
    noteOffHandlers.add(fn);
    return () => noteOffHandlers.delete(fn);
  },
  noteOn(midi: number, velocity = 90): void {
    const e = { midi, velocity, time: performance.now() };
    for (const fn of [...noteOnHandlers]) fn(e);
  },
  noteOff(midi: number): void {
    const e = { midi, velocity: 0, time: performance.now() };
    for (const fn of [...noteOffHandlers]) fn(e);
  },
};
