// On-screen piano keyboard (C2..C7), always visible at the bottom of the app.
// Feeds the note-event bus, echoes through the synth, mirrors any input
// (MIDI included) as pressed keys, and supports highlight overlays for the
// Improv Lab (chord tones / scale tones).

import { input } from './events';
import { noteName } from './i18n';
import { pianoOn, pianoOff } from './synth';

const LOW = 21;  // A0 — full 88-key piano, 7+ octaves
const HIGH = 108; // C8

const KBD_MAP: Record<string, number> = {
  // Ableton-style: a = C4 ... ; = E5
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76,
};

function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

const reduceMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// A quick burst of glitter above a key when its note is played. Particles are
// fixed-position on <body> so they escape the keyboard's scroll clipping, and
// they remove themselves when their animation ends.
function spawnSparkle(key: HTMLElement): void {
  if (reduceMotion) return;
  const r = key.getBoundingClientRect();
  if (r.width === 0) return; // not laid out / scrolled out of view
  const cx = r.left + r.width / 2;
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    const size = 3 + Math.random() * 4;
    s.style.left = `${cx + (Math.random() - 0.5) * r.width * 1.4}px`;
    s.style.top = `${r.top}px`;
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.setProperty('--rise', `${22 + Math.random() * 28}px`);
    s.style.setProperty('--drift', `${(Math.random() - 0.5) * 18}px`);
    s.style.animationDelay = `${Math.random() * 70}ms`;
    document.body.appendChild(s);
    const kill = () => s.remove();
    s.addEventListener('animationend', kill);
    setTimeout(kill, 1200); // fallback if animationend never fires (backgrounded tab)
  }
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
        lbl.textContent = noteName(m);
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
  const offOn = input.onNoteOn((e) => {
    const k = keyEls.get(e.midi);
    if (!k) return;
    k.classList.add('pressed');
    spawnSparkle(k);
  });
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
