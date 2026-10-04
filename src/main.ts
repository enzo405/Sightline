// Sightline — app shell: header, language switch, MIDI status, tabs, keyboard.

import './style.css';
import { input } from './events';
import { mountFading } from './fading';
import { mountEar } from './eartraining';
import { lang, onLangChange, setLang, t } from './i18n';
import { mountImprov } from './improv';
import { createKeyboard, Keyboard } from './keyboard';
import { initMidi, midiSupported, MidiStatus, onMidiStatus } from './midi';
import { mountMirror } from './mirror';
import { mountProgress } from './progressview';
import { mountSettings } from './settingsview';
import { onSettingsChange, settings } from './settings';
import { mountSightread } from './sightread';
import { mountTechnique } from './technique';
import { setMasterVolume, setPianoOutput, setPianoTone, unlockAudio } from './synth';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand">Sight<span>line</span></div>
    <nav class="tabs" id="tabs"></nav>
    <button class="lang-toggle" id="lang-toggle"></button>
    <button class="midi-enable" id="midi-enable"></button>
    <div class="midi-status" id="midi-status"></div>
  </header>
  <main id="view"></main>
  <footer id="kbd-host"></footer>
`;

document.documentElement.lang = lang();

const kbdHost = document.getElementById('kbd-host')!;
let keyboard: Keyboard = createKeyboard();
kbdHost.appendChild(keyboard.el);

// Apply saved audio settings now and whenever they change.
function applyAudioSettings() {
  const s = settings();
  setPianoOutput(s.pianoSound);
  setMasterVolume(s.volume);
  setPianoTone(s.tone);
}
applyAudioSettings();
onSettingsChange(applyAudioSettings);

const TABS: { id: string; labelKey: string; mount: (el: HTMLElement) => () => void }[] = [
  { id: 'mirror', labelKey: 'tab.mirror', mount: mountMirror },
  { id: 'read', labelKey: 'tab.read', mount: mountSightread },
  { id: 'fading', labelKey: 'tab.fading', mount: mountFading },
  { id: 'improv', labelKey: 'tab.improv', mount: (el) => mountImprov(el, keyboard) },
  { id: 'technique', labelKey: 'tab.technique', mount: mountTechnique },
  { id: 'ear', labelKey: 'tab.ear', mount: mountEar },
  { id: 'progress', labelKey: 'tab.progress', mount: mountProgress },
  { id: 'settings', labelKey: 'tab.settings', mount: mountSettings },
];

const tabsEl = document.getElementById('tabs')!;
const viewEl = document.getElementById('view')!;
let unmount: (() => void) | null = null;
let activeTab = '';

function show(id: string, force = false): void {
  if (id === activeTab && !force) return;
  activeTab = id;
  unmount?.();
  keyboard.clearHighlights();
  viewEl.innerHTML = '';
  const tab = TABS.find((t) => t.id === id)!;
  tabsEl.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.id === id));
  unmount = tab.mount(viewEl);
}

for (const tab of TABS) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.dataset.id = tab.id;
  b.textContent = t(tab.labelKey);
  b.addEventListener('click', () => { unlockAudio(); show(tab.id); });
  tabsEl.appendChild(b);
}

// --- language toggle ---
const langBtn = document.getElementById('lang-toggle') as HTMLButtonElement;
function renderLangBtn() {
  langBtn.textContent = t('lang.toggle');
  langBtn.title = t('lang.toggleTitle');
}
renderLangBtn();
langBtn.addEventListener('click', () => setLang(lang() === 'en' ? 'fr' : 'en'));

// --- MIDI status + enable button ---
const midiEl = document.getElementById('midi-status')!;
const midiBtn = document.getElementById('midi-enable') as HTMLButtonElement;
let lastStatus: MidiStatus = { state: 'unsupported' };
let midiConnected = false;

function renderMidi(s: MidiStatus) {
  lastStatus = s;
  midiConnected = s.state === 'ready' && s.devices.length > 0;
  if (midiConnected) {
    midiEl.textContent = t('midi.ready', { devices: (s as { devices: string[] }).devices.join(', ') });
    midiEl.className = 'midi-status ok';
  } else if (s.state === 'ready') {
    midiEl.textContent = t('midi.none');
    midiEl.className = 'midi-status';
  } else if (s.state === 'denied') {
    midiEl.textContent = t('midi.denied');
    midiEl.className = 'midi-status warn';
  } else {
    midiEl.textContent = t('midi.unsupported');
    midiEl.className = 'midi-status warn';
  }
  // Show the button whenever MIDI isn't actively connected, as long as the
  // browser has the API at all. Firefox only shows its permission prompt from a
  // user gesture, so this click is what actually connects the keyboard.
  const showBtn = midiSupported() && !midiConnected;
  midiBtn.classList.toggle('hidden', !showBtn);
  midiBtn.textContent = s.state === 'ready' || s.state === 'denied' ? t('midi.retry') : t('midi.enable');
  midiBtn.title = t('midi.enableTitle');
}
midiBtn.addEventListener('click', () => { unlockAudio(); void initMidi(); });
onMidiStatus(renderMidi);
// Try once on load (works where no gesture is required); the button covers
// browsers like Firefox that require a user gesture for the permission prompt.
if (midiSupported()) void initMidi();

// --- re-render everything on language change ---
onLangChange(() => {
  document.documentElement.lang = lang();
  renderLangBtn();
  tabsEl.querySelectorAll('.tab').forEach((b) => {
    const tab = TABS.find((x) => x.id === (b as HTMLElement).dataset.id);
    if (tab) (b as HTMLButtonElement).textContent = t(tab.labelKey);
  });
  renderMidi(lastStatus);
  // rebuild the keyboard so its note labels follow the language
  const held = activeTab;
  keyboard.destroy();
  keyboard = createKeyboard();
  kbdHost.appendChild(keyboard.el);
  show(held, true);
});

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
  setLang,
};
