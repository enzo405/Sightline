// Settings page — one place for all app-wide preferences (persisted locally):
// piano sound on/off, master volume, language, and MIDI keyboard connection.

import { lang, setLang, t } from './i18n';
import { initMidi, midiSupported, MidiStatus, onMidiStatus } from './midi';
import { onSettingsChange, settings, updateSettings } from './settings';
import { unlockAudio } from './synth';

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
