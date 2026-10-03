// On-screen piano keyboard (C2..C7), always visible at the bottom of the app.
// Feeds the note-event bus, echoes through the synth, mirrors any input
// (MIDI included) as pressed keys, and supports highlight overlays for the
// Improv Lab (chord tones / scale tones).

import { input } from './events';
import { pianoOn, pianoOff } from './synth';
import { midiToName } from './theory';

const LOW = 36;  // C2
const HIGH = 96; // C7

const KBD_MAP: Record<string, number> = {
  // Ableton-style: a = C4 ... ; = E5
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76,
};

function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export interface Keyboard {
  el: HTMLElement;
  setHighlights(map: Map<number, string>): void;
  clearHighlights(): void;
  destroy(): void;
}

export function createKeyboard(): Keyboard {
  const el = document.createElement('div');
  el.className = 'piano-wrap';
  const piano = document.createElement('div');
  piano.className = 'piano';
  el.appendChild(piano);

  const keyEls = new Map<number, HTMLElement>();
  const whiteW = 26;

  let whiteIndex = 0;
  for (let m = LOW; m <= HIGH; m++) {
    const key = document.createElement('div');
    key.dataset.midi = String(m);
    if (isBlack(m)) {
      key.className = 'pkey black';
      key.style.left = `${whiteIndex * whiteW - whiteW * 0.31}px`;
    } else {
      key.className = 'pkey white';
      key.style.left = `${whiteIndex * whiteW}px`;
      if (m % 12 === 0) {
        const lbl = document.createElement('span');
        lbl.className = 'pkey-label';
        lbl.textContent = midiToName(m);
        key.appendChild(lbl);
      }
      whiteIndex++;
    }
    piano.appendChild(key);
    keyEls.set(m, key);
  }
  piano.style.width = `${whiteIndex * whiteW}px`;

  // --- pointer input ---
  const downPointers = new Map<number, number>(); // pointerId -> midi
  const press = (midi: number) => { pianoOn(midi, 95); input.noteOn(midi, 95); };
  const release = (midi: number) => { pianoOff(midi); input.noteOff(midi); };

  piano.addEventListener('pointerdown', (ev) => {
    const t = (ev.target as HTMLElement).closest('.pkey') as HTMLElement | null;
    if (!t) return;
    const midi = Number(t.dataset.midi);
    downPointers.set(ev.pointerId, midi);
    press(midi);
    ev.preventDefault();
  });
  const endPointer = (ev: PointerEvent) => {
    const midi = downPointers.get(ev.pointerId);
    if (midi !== undefined) { release(midi); downPointers.delete(ev.pointerId); }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // --- computer keyboard input ---
  const heldKeys = new Set<string>();
  const onKeyDown = (ev: KeyboardEvent) => {
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || ev.repeat) return;
    const midi = KBD_MAP[ev.key.toLowerCase()];
    if (midi !== undefined && !heldKeys.has(ev.key)) {
      heldKeys.add(ev.key);
      press(midi);
    }
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    const midi = KBD_MAP[ev.key.toLowerCase()];
    if (midi !== undefined) { heldKeys.delete(ev.key); release(midi); }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- mirror all bus input as pressed keys ---
  const offOn = input.onNoteOn((e) => keyEls.get(e.midi)?.classList.add('pressed'));
  const offOff = input.onNoteOff((e) => keyEls.get(e.midi)?.classList.remove('pressed'));

  let highlighted: number[] = [];
  const setHighlights = (map: Map<number, string>) => {
    for (const m of highlighted) {
      const k = keyEls.get(m);
      if (k) k.className = k.className.replace(/\bhl-\w+/g, '').trim();
    }
    highlighted = [];
    for (const [m, cls] of map) {
      const k = keyEls.get(m);
      if (k) { k.classList.add(cls); highlighted.push(m); }
    }
  };

  // center the view on middle C
  requestAnimationFrame(() => {
    el.scrollLeft = (keyEls.get(60)?.offsetLeft ?? 0) - el.clientWidth / 2;
  });

  return {
    el,
    setHighlights,
    clearHighlights: () => setHighlights(new Map()),
    destroy() {
      window.removeEventListener('pointerup', endPointer);
      window.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      offOn(); offOff();
      el.remove();
    },
  };
}
