// Settings page — one place for all app-wide preferences (persisted locally):
// piano sound on/off, master volume, language, and MIDI keyboard connection.

import { lang, setLang, t } from './i18n';
import { initMidi, midiSupported, MidiStatus, onMidiStatus } from './midi';
import { resetProgress } from './progress';
import { onSettingsChange, resetSettings, settings, updateSettings } from './settings';
import { now, pianoOn, unlockAudio } from './synth';

// Short C-major arpeggio so the user hears the timbre they just picked.
function previewTone(): void {
  const base = now();
  [60, 64, 67, 72].forEach((m, i) => pianoOn(m, 82, base + i * 0.1, 0.55));
}

export function mountSettings(el: HTMLElement): () => void {
  const s = settings();
  el.innerHTML = `
    <div class="feature-intro">
      <h2>${t('settings.title')}</h2>
      <p>${t('settings.intro')}</p>
    </div>

    <div class="settings-grid">
      <section class="panel">
        <h3>${t('settings.audio')}</h3>
        <label class="setting-row">
          <span>
            ${t('settings.pianoSound')}
            <small class="muted">${t('settings.pianoSoundHint')}</small>
          </span>
          <button class="switch" id="set-piano" role="switch"></button>
        </label>
        <label class="setting-row">
          <span>${t('settings.volume')}</span>
          <input type="range" id="set-vol" min="0" max="100" step="1" value="${Math.round(s.volume * 100)}">
        </label>
        <label class="setting-row">
          <span>
            ${t('settings.tone')}
            <small class="muted">${t('settings.toneHint')}</small>
          </span>
          <div class="seg" id="set-tone">
            <button data-t="grand" class="${s.tone === 'grand' ? 'active' : ''}">${t('settings.toneGrand')}</button>
            <button data-t="dark" class="${s.tone === 'dark' ? 'active' : ''}">${t('settings.toneDark')}</button>
            <button data-t="lofi" class="${s.tone === 'lofi' ? 'active' : ''}">${t('settings.toneLofi')}</button>
          </div>
        </label>
      </section>

      <section class="panel">
        <h3>${t('settings.language')}</h3>
        <div class="seg" id="set-lang">
          <button data-l="en" class="${lang() === 'en' ? 'active' : ''}">English</button>
          <button data-l="fr" class="${lang() === 'fr' ? 'active' : ''}">Français</button>
        </div>
      </section>

      <section class="panel">
        <h3>${t('settings.midi')}</h3>
        <p class="muted" id="set-midi-status"></p>
        <button class="btn primary" id="set-midi-btn"></button>
      </section>

      <section class="panel">
        <h3>${t('settings.data')}</h3>
        <p class="muted">${t('settings.dataHint')}</p>
        <button class="btn danger" id="set-reset">${t('settings.reset')}</button>
      </section>
    </div>
  `;

  // --- piano sound switch ---
  const pianoBtn = el.querySelector('#set-piano') as HTMLButtonElement;
  function renderSwitch() {
    const on = settings().pianoSound;
    pianoBtn.classList.toggle('on', on);
    pianoBtn.setAttribute('aria-checked', String(on));
    pianoBtn.textContent = on ? t('settings.on') : t('settings.off');
  }
  renderSwitch();
  pianoBtn.addEventListener('click', () => {
    unlockAudio();
    updateSettings({ pianoSound: !settings().pianoSound });
  });

  // --- volume ---
  const vol = el.querySelector('#set-vol') as HTMLInputElement;
  vol.addEventListener('input', () => {
    unlockAudio();
    updateSettings({ volume: Number(vol.value) / 100 });
  });

  // --- piano tone ---
  const toneSeg = el.querySelector('#set-tone') as HTMLElement;
  toneSeg.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    const tn = b?.dataset.t;
    if (tn !== 'grand' && tn !== 'dark' && tn !== 'lofi') return;
    unlockAudio();
    updateSettings({ tone: tn }); // main.ts applies setPianoTone via onSettingsChange
    toneSeg.querySelectorAll('button').forEach((x) =>
      x.classList.toggle('active', (x as HTMLElement).dataset.t === tn));
    previewTone();
  });

  // --- language ---
  const langSeg = el.querySelector('#set-lang') as HTMLElement;
  langSeg.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (b?.dataset.l === 'en' || b?.dataset.l === 'fr') setLang(b.dataset.l);
    // main.ts re-mounts this tab on language change, so no manual re-render here.
  });

  // --- MIDI ---
  const midiStatusEl = el.querySelector('#set-midi-status') as HTMLElement;
  const midiBtn = el.querySelector('#set-midi-btn') as HTMLButtonElement;
  function renderMidi(st: MidiStatus) {
    if (st.state === 'ready' && st.devices.length) {
      midiStatusEl.textContent = t('midi.ready', { devices: st.devices.join(', ') });
      midiBtn.textContent = t('midi.retry');
    } else if (st.state === 'ready') {
      midiStatusEl.textContent = t('midi.none');
      midiBtn.textContent = t('midi.retry');
    } else if (st.state === 'denied') {
      midiStatusEl.textContent = t('midi.denied');
      midiBtn.textContent = t('midi.retry');
    } else {
      midiStatusEl.textContent = t('midi.unsupported');
      midiBtn.textContent = t('midi.enable');
    }
    midiBtn.disabled = !midiSupported();
  }
  const offMidi = onMidiStatus(renderMidi);
  midiBtn.addEventListener('click', () => { unlockAudio(); void initMidi(); });

  // --- reset all data ---
  const resetBtn = el.querySelector('#set-reset') as HTMLButtonElement;
  resetBtn.addEventListener('click', () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    resetProgress();
    resetSettings();
    // Full reload gives every module a clean, freshly-loaded state.
    location.reload();
  });

  // keep the switch/volume in sync if changed elsewhere
  const offSettings = onSettingsChange((next) => {
    renderSwitch();
    if (document.activeElement !== vol) vol.value = String(Math.round(next.volume * 100));
  });

  return () => {
    offMidi();
    offSettings();
  };
}
