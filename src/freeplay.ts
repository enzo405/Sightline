// Free Play — no scoring, no targets. A Synthesia-style visual: every note you
// play (MIDI, the on-screen keyboard, or the computer keys) rises from a
// baseline near the bottom as a glowing bar, growing taller while you hold it,
// then detaching and floating up to the top once released. Pitch sets the lane
// and hue; velocity sets the brightness. Sound is already produced by the input
// sources themselves, so this page only listens to the shared note bus.

import { input } from './events';
import { noteName, t } from './i18n';
import { tutorialHTML } from './tutorial';

const LOW = 21;   // A0
const HIGH = 108; // C8
const SPAN = HIGH - LOW;
const RISE = 2.4; // px per 60fps-frame the bars travel upward

interface Bar {
  midi: number;
  x: number;
  w: number;
  hue: number;
  alpha: number;   // brightness from velocity
  headY: number;   // leading (top) edge — always rising
  tailY: number;   // trailing (bottom) edge — pinned to baseline while held
  held: boolean;
}
interface Label { x: number; y: number; life: number; text: string; hue: number; }

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
    <div class="feature-intro">
      <h2>${t('play.title')}</h2>
      <p>${t('play.intro')}</p>
      ${tutorialHTML('play')}
    </div>
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
  const active = new Map<number, Bar>(); // midi -> its live (held) bar

  const laneW = () => W / (SPAN + 1);
  const xFor = (midi: number) => (midi - LOW) * laneW();
  const hueFor = (midi: number) => (midi % 12) * 30;

  const offOn = input.onNoteOn((e) => {
    hint.classList.add('hidden');
    const lw = laneW();
    const x = xFor(e.midi) + lw * 0.12;
    const hue = hueFor(e.midi);
    const alpha = Math.max(0.45, Math.min(1, e.velocity / 110));
    // replace any still-held bar for this midi (retrigger)
    const prev = active.get(e.midi);
    if (prev) prev.held = false;
    const bar: Bar = { midi: e.midi, x, w: lw * 0.76, hue, alpha, headY: baseline, tailY: baseline, held: true };
    bars.push(bar);
    active.set(e.midi, bar);
    labels.push({ x: x + lw * 0.38, y: baseline + 22, life: 1, text: noteName(e.midi), hue });
  });
  const offOff = input.onNoteOff((e) => {
    const bar = active.get(e.midi);
    if (bar) { bar.held = false; active.delete(e.midi); }
  });

  let raf = 0;
  let last = performance.now();
  function frame(nowMs: number) {
    const dt = Math.min(2.5, (nowMs - last) / 16.67);
    last = nowMs;
    const v = RISE * dt;

    // translucent wash → soft motion trails
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(10, 12, 26, 0.32)');
    g.addColorStop(1, 'rgba(4, 6, 16, 0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint octave guides (every C) + baseline
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    for (let m = LOW; m <= HIGH; m++) {
      if (m % 12 !== 0) continue;
      const gx = xFor(m) + laneW() * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, baseline);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(W, baseline);
    ctx.stroke();

    // rising bars
    ctx.globalCompositeOperation = 'lighter';
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      b.headY -= v;
      b.tailY = b.held ? baseline : b.tailY - v;
      const top = b.headY;
      const h = b.tailY - top;
      if (h <= 0 || b.tailY < -24) { bars.splice(i, 1); continue; }

      // fade as the bar nears the top
      const fade = Math.max(0, Math.min(1, b.tailY / (H * 0.5)));
      const a = b.alpha * (b.held ? 1 : Math.max(0.25, fade));
      const grd = ctx.createLinearGradient(0, top, 0, b.tailY);
      grd.addColorStop(0, `hsla(${b.hue}, 95%, 72%, ${a})`);
      grd.addColorStop(1, `hsla(${b.hue}, 90%, 55%, ${a * 0.85})`);
      ctx.fillStyle = grd;
      ctx.shadowColor = `hsla(${b.hue}, 95%, 65%, ${a})`;
      ctx.shadowBlur = 16;
      roundRectPath(ctx, b.x, top, b.w, h, Math.min(5, b.w / 2));
      ctx.fill();
      ctx.shadowBlur = 0;

      // bright cap where the note meets the baseline while held
      if (b.held) {
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
  };
}
