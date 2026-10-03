// Sightline — app shell: header, MIDI status, tabs, global keyboard.

import './style.css';
import { input } from './events';
import { mountFading } from './fading';
import { mountImprov } from './improv';
import { createKeyboard } from './keyboard';
import { initMidi, onMidiStatus } from './midi';
import { mountMirror } from './mirror';
import { mountProgress } from './progressview';
import { mountSightread } from './sightread';
import { unlockAudio } from './synth';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand">Sight<span>line</span></div>
    <nav class="tabs" id="tabs"></nav>
    <div class="midi-status" id="midi-status">MIDI: …</div>
  </header>
  <main id="view"></main>
  <footer id="kbd-host"></footer>
`;

const keyboard = createKeyboard();
document.getElementById('kbd-host')!.appendChild(keyboard.el);

const TABS: { id: string; label: string; mount: (el: HTMLElement) => () => void }[] = [
  { id: 'mirror', label: '1 · Mirror', mount: mountMirror },
  { id: 'read', label: '2 · Sight-Reading', mount: mountSightread },
  { id: 'fading', label: '3 · Fading Score', mount: mountFading },
  { id: 'improv', label: '4 · Improv Lab', mount: (el) => mountImprov(el, keyboard) },
  { id: 'progress', label: 'Progress', mount: mountProgress },
];

const tabsEl = document.getElementById('tabs')!;
const viewEl = document.getElementById('view')!;
let unmount: (() => void) | null = null;
let activeTab = '';

function show(id: string): void {
  if (id === activeTab) return;
  activeTab = id;
  unmount?.();
  keyboard.clearHighlights();
  viewEl.innerHTML = '';
  const tab = TABS.find((t) => t.id === id)!;
  tabsEl.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.id === id));
  unmount = tab.mount(viewEl);
}

for (const t of TABS) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.dataset.id = t.id;
  b.textContent = t.label;
  b.addEventListener('click', () => { unlockAudio(); show(t.id); });
  tabsEl.appendChild(b);
}

const midiEl = document.getElementById('midi-status')!;
onMidiStatus((s) => {
  if (s.state === 'ready' && s.devices.length) {
    midiEl.textContent = `MIDI: ${s.devices.join(', ')}`;
    midiEl.className = 'midi-status ok';
  } else if (s.state === 'ready') {
    midiEl.textContent = 'MIDI: no device — use on-screen keys or A–; row';
    midiEl.className = 'midi-status';
  } else if (s.state === 'denied') {
    midiEl.textContent = 'MIDI: permission denied';
    midiEl.className = 'midi-status warn';
  } else {
    midiEl.textContent = 'MIDI: not supported (use Chrome/Edge) — on-screen keys work';
    midiEl.className = 'midi-status warn';
  }
});
void initMidi();

// unlock audio on first interaction anywhere
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

show('mirror');

// Test hook: lets automated checks (and curious users) inject notes.
(window as any).__sightline = {
  noteOn: (m: number, v = 90) => input.noteOn(m, v),
  noteOff: (m: number) => input.noteOff(m),
  tap: (m: number, holdMs = 150) => {
    input.noteOn(m, 90);
    setTimeout(() => input.noteOff(m), holdMs);
  },
  show,
};
