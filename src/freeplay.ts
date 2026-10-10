// Free Play — no scoring, no targets. Every note you play (MIDI, the on-screen
// keyboard, or the computer keys) blooms into light: a ripple, a burst of
// particles, a sustained column of colour and the note's name floating up.
// Pure reaction. Sound is already produced by the input sources themselves, so
// this page only listens to the shared note bus and paints.

import { input } from './events';
import { noteName, t } from './i18n';
import { tutorialHTML } from './tutorial';

const LOW = 21;   // A0
const HIGH = 108; // C8

interface Ripple { x: number; y: number; r: number; max: number; hue: number; life: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; hue: number; size: number; }
interface Label { x: number; y: number; life: number; text: string; hue: number; }

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
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const ripples: Ripple[] = [];
  const particles: Particle[] = [];
  const labels: Label[] = [];
  const active = new Map<number, { hue: number; x: number }>(); // currently held notes

  const xFor = (midi: number) => ((midi - LOW) / (HIGH - LOW)) * W;
  const hueFor = (midi: number) => (midi % 12) * 30;

  const offOn = input.onNoteOn((e) => {
    hint.classList.add('hidden');
    const x = xFor(e.midi);
    const hue = hueFor(e.midi);
    const vel = Math.max(0.3, Math.min(1, e.velocity / 110));
    const y = H * 0.62;
    active.set(e.midi, { hue, x });
    ripples.push({ x, y, r: 8, max: 60 + vel * 130, hue, life: 1 });
    labels.push({ x, y: y - 36, life: 1, text: noteName(e.midi), hue });
    const count = reduce ? 5 : Math.round(12 + vel * 20);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const sp = 1 + Math.random() * 4 * vel;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (1 + vel * 2),
        life: 1,
        hue: hue + (Math.random() - 0.5) * 36,
        size: 2 + Math.random() * 3 * vel,
      });
    }
  });
  const offOff = input.onNoteOff((e) => active.delete(e.midi));

  let raf = 0;
  let last = performance.now();
  function frame(nowMs: number) {
    const dt = Math.min(2.5, (nowMs - last) / 16.67);
    last = nowMs;

    // translucent wash → motion trails without full clears
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(12, 14, 28, 0.26)');
    g.addColorStop(1, 'rgba(4, 6, 16, 0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';

    // sustained columns under held notes
    for (const a of active.values()) {
      const grd = ctx.createLinearGradient(a.x, 0, a.x, H);
      grd.addColorStop(0, `hsla(${a.hue}, 90%, 60%, 0)`);
      grd.addColorStop(1, `hsla(${a.hue}, 90%, 60%, 0.12)`);
      ctx.fillStyle = grd;
      ctx.fillRect(a.x - 28, 0, 56, H);
    }

    // expanding rings + glow core
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += (r.max - r.r) * 0.06 * dt;
      r.life -= 0.016 * dt;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `hsla(${r.hue}, 90%, 66%, ${r.life * 0.8})`;
      ctx.lineWidth = 2 + (1 - r.life) * 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `hsla(${r.hue}, 95%, 72%, ${r.life * 0.5})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0, 12 * r.life), 0, Math.PI * 2);
      ctx.fill();
    }

    // rising particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.05 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.02 * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.fillStyle = `hsla(${p.hue}, 90%, 66%, ${p.life})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    // floating note names
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      l.y -= 0.5 * dt;
      l.life -= 0.012 * dt;
      if (l.life <= 0) { labels.splice(i, 1); continue; }
      ctx.fillStyle = `hsla(${l.hue}, 90%, 74%, ${l.life})`;
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
