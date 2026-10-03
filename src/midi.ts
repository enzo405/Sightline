// Web MIDI input: attaches every connected MIDI input to the note-event bus.

import { input } from './events';

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'denied' }
  | { state: 'ready'; devices: string[] };

type StatusListener = (s: MidiStatus) => void;
const listeners = new Set<StatusListener>();
let current: MidiStatus = { state: 'unsupported' };

export function onMidiStatus(fn: StatusListener): void {
  listeners.add(fn);
  fn(current);
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
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    setStatus({ state: 'denied' });
    return;
  }

  const attach = () => {
    const devices: string[] = [];
    access.inputs.forEach((port) => {
      devices.push(port.name ?? 'MIDI device');
      port.onmidimessage = (msg) => {
        const data = msg.data;
        if (!data || data.length < 3) return;
        const cmd = data[0] & 0xf0;
        if (cmd === 0x90 && data[2] > 0) input.noteOn(data[1], data[2]);
        else if (cmd === 0x80 || (cmd === 0x90 && data[2] === 0)) input.noteOff(data[1]);
      };
    });
    setStatus({ state: 'ready', devices });
  };

  access.onstatechange = attach;
  attach();
}
