// Web Audio: a piano-ish synth, plus metronome / backing-track sounds.
// The piano voice is additive: several harmonic partials per note, each with
// its own decay, mild inharmonicity (stretched partials), two detuned unison
// voices, a velocity-driven brightness filter, a hammer-noise transient, and a
// light reverb — no samples, but much closer to a real string than a single
// oscillator.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbSend: GainNode | null = null;
let wetGain: GainNode | null = null;

// User settings applied to the audio graph (see settings.ts / main.ts).
let masterVolume = 0.9;
let pianoOutput = true;

// Selectable piano timbres. Each spec reshapes the additive voice: its partial
// mix (richness), brightness-filter scaling (tone colour), reverb wetness, the
// hammer-noise transient, ring length, and a detune wobble for the lo-fi warble.
export type PianoTone = 'grand' | 'dark' | 'lofi';
interface ToneSpec {
  partials: number[];
  brightMul: number;
  wet: number;
  hammerMul: number;
  decayMul: number;
  wobble: number; // extra cents on the shimmer voice
}
const TONES: Record<PianoTone, ToneSpec> = {
  grand: { partials: [1, 0.62, 0.45, 0.30, 0.18, 0.11, 0.07], brightMul: 1.0, wet: 0.12, hammerMul: 1.0, decayMul: 1.0, wobble: 0 },
  dark: { partials: [1, 0.50, 0.26, 0.12, 0.06, 0.03, 0.015], brightMul: 0.55, wet: 0.22, hammerMul: 0.7, decayMul: 1.18, wobble: 0 },
  lofi: { partials: [1, 0.55, 0.30, 0.14, 0.07, 0.03, 0.02], brightMul: 0.42, wet: 0.16, hammerMul: 1.35, decayMul: 0.8, wobble: 9 },
};
let tone: PianoTone = 'grand';

function makeImpulse(ac: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function audio(): AudioContext {
  if (!ctx) {
    // 'interactive' asks the browser for the smallest output buffer it can
    // manage, which minimizes the delay between a MIDI note-on and its sound.
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = masterVolume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp);
    comp.connect(ctx.destination);

    // small room reverb, fed by a send bus
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 1.5, 2.6);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = TONES[tone].wet;
    wetGain = wet;
    reverbSend.connect(conv);
    conv.connect(wet);
    wet.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function out(): GainNode {
  audio();
  return master!;
}

function reverb(): GainNode {
  audio();
  return reverbSend!;
}

export function now(): number {
  return audio().currentTime;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface Handle { stop: () => void }

const active = new Map<number, Handle>();

// Sustain pedal (MIDI CC64): while down, released keys keep ringing until the
// pedal lifts. `sustained` holds notes whose key is up but the pedal is holding.
let sustainOn = false;
const sustained = new Set<number>();

// Two unison voices give shimmer without doubling the oscillator count: the
// main one carries all partials; the detuned one only the loud low partials.
const INHARMONICITY = 0.0004;

/** Piano-ish tone. If `durSec` is given it self-releases; otherwise call pianoOff. */
export function pianoOn(midi: number, velocity = 90, when?: number, durSec?: number): void {
  if (!pianoOutput) return; // piano sound disabled in Settings
  const spec = TONES[tone];
  const ac = audio();
  const t = when ?? ac.currentTime;
  const f0 = midiToFreq(midi);
  const vel = Math.max(0.05, Math.min(1, velocity / 127));

  const noteGain = ac.createGain();
  noteGain.gain.value = 1;

  // Brightness: opens with how hard you play, then dulls as the string rings.
  // The tone's brightMul shifts the whole colour darker (dark / lo-fi).
  const bright = ac.createBiquadFilter();
  bright.type = 'lowpass';
  bright.Q.value = 0.2;
  const openHz = Math.min(12000, (1700 + vel * 7000 + f0 * 1.5) * spec.brightMul);
  const dullHz = Math.min(openHz, Math.max(500, (800 + f0 * 1.2) * spec.brightMul));
  bright.frequency.setValueAtTime(openHz, t);
  bright.frequency.exponentialRampToValueAtTime(dullHz, t + 0.7);

  noteGain.connect(bright);
  bright.connect(out());
  bright.connect(reverb());

  const baseDecay = Math.max(0.8, 5.2 - midi / 22) * spec.decayMul; // low notes ring longer
  const peakScale = 0.26 * vel;

  const voices = [
    { cents: -2.5, count: spec.partials.length },
    { cents: 3.0 + spec.wobble, count: 3 },
  ];
  for (const voice of voices) {
    const mult = Math.pow(2, voice.cents / 1200);
    for (let i = 0; i < voice.count; i++) {
      const n = i + 1;
      const pf = f0 * n * Math.sqrt(1 + INHARMONICITY * n * n) * mult;
      if (pf > ac.sampleRate * 0.47) continue; // avoid aliasing near Nyquist
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = pf;
      const g = ac.createGain();
      const peak = (spec.partials[i] * peakScale) / voices.length;
      const pDecay = baseDecay / (1 + 0.8 * (n - 1)); // upper partials die faster
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(Math.max(0.00008, peak * 0.0006), t + pDecay);
      o.connect(g);
      g.connect(noteGain);
      o.start(t);
      o.stop(t + pDecay + 0.05);
    }
  }

  // Hammer transient: a short, soft, lowpassed noise click at onset.
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const nf = ac.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = Math.min(5000, f0 * 4);
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.06 * vel * spec.hammerMul, t);
  ng.gain.exponentialRampToValueAtTime(0.0004, t + 0.055);
  src.connect(nf);
  nf.connect(ng);
  ng.connect(noteGain);
  src.start(t);
  src.stop(t + 0.08);

  const release = (rt: number) => {
    noteGain.gain.cancelScheduledValues(rt);
    noteGain.gain.setValueAtTime(noteGain.gain.value, rt);
    noteGain.gain.exponentialRampToValueAtTime(0.0005, rt + 0.14);
  };

  if (durSec !== undefined) {
    release(t + durSec);
  } else {
    active.get(midi)?.stop();
    sustained.delete(midi); // re-struck: no longer just pedal-held
    active.set(midi, { stop: () => release(ac.currentTime) });
  }
}

export function pianoOff(midi: number): void {
  if (sustainOn) { sustained.add(midi); return; } // hold under the pedal
  active.get(midi)?.stop();
  active.delete(midi);
}

/** Sustain pedal state (MIDI CC64). Lifting it releases all pedal-held notes. */
export function setSustain(on: boolean): void {
  if (on === sustainOn) return;
  sustainOn = on;
  if (!on) {
    for (const m of sustained) {
      active.get(m)?.stop();
      active.delete(m);
    }
    sustained.clear();
  }
}

/** Short metronome click. Accented beats get a higher pitch. */
export function click(when?: number, accent = false): void {
  const ac = audio();
  const t = when ?? ac.currentTime;
  const o = ac.createOscillator();
  o.type = 'square';
  o.frequency.value = accent ? 1800 : 1200;
  const g = ac.createGain();
  g.gain.setValueAtTime(accent ? 0.25 : 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(out());
  o.start(t); o.stop(t + 0.06);
}

/** Backing-track voices for the Improv Lab. */
export function bassNote(midi: number, when: number, durSec: number): void {
  const ac = audio();
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = midiToFreq(midi);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.4, when + 0.01);
  g.gain.setValueAtTime(0.4, when + durSec * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, when + durSec);
  o.connect(g); g.connect(out());
  o.start(when); o.stop(when + durSec + 0.05);
}

export function padChord(midis: number[], when: number, durSec: number): void {
  const ac = audio();
  for (const m of midis) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiToFreq(m);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.06, when + 0.08);
    g.gain.setValueAtTime(0.06, when + durSec - 0.15);
    g.gain.linearRampToValueAtTime(0, when + durSec);
    o.connect(f); f.connect(g); g.connect(out());
    o.start(when); o.stop(when + durSec + 0.05);
  }
}

export function hat(when: number): void {
  const ac = audio();
  const len = 0.04;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.value = 0.12;
  src.connect(f); f.connect(g); g.connect(out());
  src.start(when);
}

/** Make sure the AudioContext is unlocked (call from a user gesture). */
export function unlockAudio(): void {
  audio();
}

/** Master volume, 0..1 (applied live if the audio graph exists). */
export function setMasterVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = masterVolume;
}

/** Enable/disable the piano voice. Disabling silences any ringing notes. */
export function setPianoOutput(on: boolean): void {
  pianoOutput = on;
  if (!on) {
    for (const h of active.values()) h.stop();
    active.clear();
    sustained.clear();
  }
}

/** Select the piano timbre. Reverb wetness is applied live; the rest affects new notes. */
export function setPianoTone(tn: PianoTone): void {
  tone = tn;
  if (wetGain) wetGain.gain.value = TONES[tone].wet;
}