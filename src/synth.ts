// Web Audio: a simple piano-ish synth, plus metronome / backing-track sounds.
// No samples — two detuned oscillators through a lowpass with an exponential
// decay is plenty for practice feedback.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function out(): GainNode {
  audio();
  return master!;
}

export function now(): number {
  return audio().currentTime;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Handle { stop: () => void }

const active = new Map<number, Handle>();

/** Piano-ish tone. If `durSec` is given it self-releases; otherwise call pianoOff. */
export function pianoOn(midi: number, velocity = 90, when?: number, durSec?: number): void {
  const ac = audio();
  const t = when ?? ac.currentTime;
  const freq = midiToFreq(midi);
  const vel = Math.max(0.1, Math.min(1, velocity / 127));

  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(8000, freq * 6);
  filter.Q.value = 0.5;

  const o1 = ac.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = freq;
  const o2 = ac.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = freq * 2;
  const g2 = ac.createGain();
  g2.gain.value = 0.25;

  o1.connect(filter);
  o2.connect(g2);
  g2.connect(filter);
  filter.connect(gain);
  gain.connect(out());

  const peak = 0.35 * vel;
  const decay = Math.max(1.0, 4.5 - midi / 30); // low notes ring longer
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, t + decay);

  const hardStop = t + decay + 0.1;
  o1.start(t); o2.start(t);
  o1.stop(hardStop); o2.stop(hardStop);

  const release = (rt: number) => {
    gain.gain.cancelScheduledValues(rt);
    gain.gain.setValueAtTime(gain.gain.value, rt);
    gain.gain.exponentialRampToValueAtTime(0.0008, rt + 0.15);
  };

  if (durSec !== undefined) {
    release(t + durSec);
  } else {
    active.get(midi)?.stop();
    active.set(midi, { stop: () => release(ac.currentTime) });
  }
}

export function pianoOff(midi: number): void {
  active.get(midi)?.stop();
  active.delete(midi);
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
