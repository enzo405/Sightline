// Web MIDI input: attaches every connected MIDI input to the note-event bus,
// plays the piano synth for incoming notes, and handles the sustain pedal.
// Works in any browser that implements the Web MIDI API (Chrome, Edge, and
// Firefox 108+ behind its MIDI permission prompt).

import { input } from './events';
import { pianoOff, pianoOn, setSustain, unlockAudio } from './synth';

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'denied' }
  | { state: 'ready'; devices: string[] };

type StatusListener = (s: MidiStatus) => void;
const listeners = new Set<StatusListener>();
let current: MidiStatus = { state: 'unsupported' };
let initializing = false;

/** True when the browser exposes the Web MIDI API at all. */
export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
}

export function onMidiStatus(fn: StatusListener): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

function setStatus(s: MidiStatus) {
  current = s;
  for (const fn of listeners) fn(s);
}

export async function initMidi(): Promise<void> {
  if (!navigator.requestMIDIAccess) {
    setStatus({ state: 'unsupported' });
    return;
  }
  if (initializing) return;
  initializing = true;
  let access: MIDIAccess;
  try {
    // sysex:false keeps the Firefox permission prompt to the minimal scope.
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    setStatus({ state: 'denied' });
    initializing = false;
    return;
  }

  const attach = () => {
    const devices: string[] = [];
    access.inputs.forEach((port) => {
      devices.push(port.name ?? 'MIDI device');
      port.onmidimessage = (msg) => {
        const data = msg.data;
        if (!data || data.length < 2) return;
        const cmd = data[0] & 0xf0;
        if (cmd === 0x90 && data[2] > 0) {
          unlockAudio();
          pianoOn(data[1], data[2]);
          input.noteOn(data[1], data[2]);
        } else if (cmd === 0x80 || (cmd === 0x90 && data[2] === 0)) {
          pianoOff(data[1]);
          input.noteOff(data[1]);
        } else if (cmd === 0xb0 && data[1] === 64) {
          // Sustain pedal (CC64): >=64 is down.
          const down = data[2] >= 64;
          setSustain(down);
          input.sustain(down);
        }
      };
    });
    setStatus({ state: 'ready', devices });
  };

  access.onstatechange = attach;
  attach();
  initializing = false;
}
