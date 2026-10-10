// Free Play — no scoring, no targets. A Synthesia-style visual filling the
// whole view: every note you play (MIDI, the on-screen keyboard, or the
// computer keys) rises from a baseline near the bottom as a glowing bar,
// growing taller while it sounds, then detaching and floating up to the top
// once it stops. The sustain pedal keeps released notes sounding — so their
// bars keep growing — until the pedal is lifted. Pitch sets the lane and hue;
// velocity sets the brightness. Sound is produced by the input sources
// themselves, so this page only listens to the shared note bus and paints.

import { input } from './events';
import { noteName, t } from './i18n';

const LOW = 21;   // A0
const HIGH = 108; // C8
const SPAN = HIGH - LOW;
const RISE = 2.4; // px per 60fps-frame the bars travel upward

interface Bar {
  midi: number;
  x: number;
  w: number;
  hue: number;
  alpha: number;    // brightness from velocity
  headY: number;    // leading (top) edge — always rising
  tailY: number;    // trailing (bottom) edge — pinned to baseline while sounding
  keyHeld: boolean; // physical key still down
  pedalHeld: boolean; // sustained by the pedal after key release
}
interface Label { x: number; y: number; life: number; text: string; hue: number; }

const sounding = (b: Bar) => b.keyHeld || b.pedalHeld;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function mountFreePlay(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="play-stage">
      <canvas id="play-canvas"></canvas>
      <div class="play-hint" id="play-hint">${t('play.hint')}</div>
    </div>
  `;

  const stage = root.querySelector('.play-stage') as HTMLElement;
  const canvas = root.querySelector('#play-canvas') as HTMLCanvasElement;
  const hint = root.querySelector('#play-hint') as HTMLElement;
  const ctx = canvas.getContext('2d')!;

  let W = 0;
  let H = 0;
  let baseline = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width;
    H = r.height;
    baseline = H - 56;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const bars: Bar[] = [];
  const labels: Label[] = [];
  const active = new Map<number, Bar>(); // midi -> its live (key-held) bar
  let pedalDown = false;

  const laneW = () => W / (SPAN + 1);
  const xFor = (midi: number) => (midi - LOW) * laneW();
  const hueFor = (midi: number) => (midi % 12) * 30;

  const offOn = input.onNoteOn((e) => {
    hint.classList.add('hidden');
    const lw = laneW();
    const x = xFor(e.midi) + lw * 0.12;
    const hue = hueFor(e.midi);
    const alpha = Math.max(0.45, Math.min(1, e.velocity / 110));
    // retrigger: the previous bar for this key stops being key-held; the pedal
    // may keep it sounding if it's down.
    const prev = active.get(e.midi);
    if (prev) { prev.keyHeld = false; prev.pedalHeld = pedalDown; }
    const bar: Bar = { midi: e.midi, x, w: lw * 0.76, hue, alpha, headY: baseline, tailY: baseline, keyHeld: true, pedalHeld: false };
    bars.push(bar);
    active.set(e.midi, bar);
    labels.push({ x: x + lw * 0.38, y: baseline + 22, life: 1, text: noteName(e.midi), hue });
  });
  const offOff = input.onNoteOff((e) => {
    const bar = active.get(e.midi);
    if (!bar) return;
    bar.keyHeld = false;
    bar.pedalHeld = pedalDown; // the pedal holds the note until it lifts
    active.delete(e.midi);
  });
  const offSustain = input.onSustain((down) => {
    pedalDown = down;
    if (!down) {
      // pedal lifted → notes kept only by the pedal now stop and detach
      for (const b of bars) if (b.pedalHeld && !b.keyHeld) b.pedalHeld = false;
    }
  });

  let raf = 0;
  let last = performance.now();
  function frame(nowMs: number) {
    const dt = Math.min(2.5, (nowMs - last) / 16.67);
    last = nowMs;
    const v = RISE * dt;

    // clear fully each frame → crisp bars with no trailing, and no white
    // guides or baseline; the real app background shows straight through.
    ctx.clearRect(0, 0, W, H);

    // rising bars
    ctx.globalCompositeOperation = 'lighter';
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      b.headY -= v;
      b.tailY = sounding(b) ? baseline : b.tailY - v;
      const top = b.headY;
      const h = b.tailY - top;
      if (h <= 0 || b.tailY < -24) { bars.splice(i, 1); continue; }

      const fade = Math.max(0, Math.min(1, b.tailY / (H * 0.5)));
      const a = b.alpha * (sounding(b) ? 1 : Math.max(0.25, fade));
      const grd = ctx.createLinearGradient(0, top, 0, b.tailY);
      grd.addColorStop(0, `hsla(${b.hue}, 95%, 72%, ${a})`);
      grd.addColorStop(1, `hsla(${b.hue}, 90%, 55%, ${a * 0.85})`);
      ctx.fillStyle = grd;
      ctx.shadowColor = `hsla(${b.hue}, 95%, 65%, ${a})`;
      ctx.shadowBlur = 16;
      roundRectPath(ctx, b.x, top, b.w, h, Math.min(5, b.w / 2));
      ctx.fill();
      ctx.shadowBlur = 0;

      // bright cap where the note meets the baseline while it sounds
      if (sounding(b)) {
        ctx.fillStyle = `hsla(${b.hue}, 100%, 85%, ${a})`;
        roundRectPath(ctx, b.x, baseline - 4, b.w, 4, 2);
        ctx.fill();
      }
    }

    // floating note names
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = '600 15px system-ui, -apple-system, sans-serif';
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      l.life -= 0.02 * dt;
      if (l.life <= 0) { labels.splice(i, 1); continue; }
      ctx.fillStyle = `hsla(${l.hue}, 90%, 78%, ${l.life})`;
      ctx.fillText(l.text, l.x, l.y);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    offOn();
    offOff();
    offSustain();
  };
}
