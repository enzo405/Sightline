// Free Play — no scoring, no targets. A Synthesia-style visual filling the
// whole view: every note you play (MIDI, the on-screen keyboard, or the
// computer keys) rises as a glowing bar straight from its key at the bottom,
// growing while it's held, then detaching and drifting up once you release it.
// Every note shares one colour that drifts to a new random hue every 10s, and
// each bar fades out along its length as it ages. The floating note names can
// be toggled off. Sound is produced by the input sources themselves, so this
// page only listens to the shared note bus and paints.

import { input } from './events';
import { noteName, t } from './i18n';

const LOW = 21;   // A0
const HIGH = 108; // C8
const SPAN = HIGH - LOW;
const RISE = 3.2; // px per 60fps-frame the bars travel upward (long, tall bars)
const HUE = 212;  // single accent-blue hue shared by every note

interface Bar {
  x: number;
  w: number;
  alpha: number;    // brightness from velocity
  headY: number;    // leading (top) edge — always rising
  tailY: number;    // trailing (bottom) edge — pinned to baseline while held
  keyHeld: boolean; // physical key still down
}
interface Label { x: number; y: number; life: number; text: string; }

const sounding = (b: Bar) => b.keyHeld;

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
      <div class="play-controls">
        <button class="play-toggle" id="play-full"></button>
        <button class="play-toggle" id="play-names"></button>
      </div>
      <div class="play-hint" id="play-hint">${t('play.hint')}</div>
    </div>
  `;

  // Let the note field use the whole view — drop the shell's padding/max-width.
  const appEl = document.getElementById('app');
  appEl?.classList.add('immersive');

  const stage = root.querySelector('.play-stage') as HTMLElement;
  const canvas = root.querySelector('#play-canvas') as HTMLCanvasElement;
  const hint = root.querySelector('#play-hint') as HTMLElement;
  const namesBtn = root.querySelector('#play-names') as HTMLButtonElement;
  const fullBtn = root.querySelector('#play-full') as HTMLButtonElement;
  const ctx = canvas.getContext('2d')!;

  // Fullscreen toggle — also hides the app header while active.
  function renderFullBtn() {
    fullBtn.textContent = document.fullscreenElement ? t('play.exitFull') : t('play.fullscreen');
  }
  function onFsChange() {
    appEl?.classList.toggle('fs', !!document.fullscreenElement);
    renderFullBtn();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void appEl?.requestFullscreen?.();
  });
  renderFullBtn();

  const bars: Bar[] = [];
  const labels: Label[] = [];
  const active = new Map<number, Bar>(); // midi -> its live (key-held) bar

  // Note-name labels can be switched on/off — hidden by default.
  let showNames = false;
  function renderNamesBtn() {
    namesBtn.textContent = showNames ? t('play.namesHide') : t('play.namesShow');
    namesBtn.classList.toggle('off', !showNames);
  }
  renderNamesBtn();
  namesBtn.addEventListener('click', () => {
    showNames = !showNames;
    if (!showNames) labels.length = 0; // hide any still on screen
    renderNamesBtn();
  });

  let W = 0;
  let H = 0;
  let baseline = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width;
    H = r.height;
    baseline = H; // bars start at the very bottom, right on top of the keyboard
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const laneW = () => W / (SPAN + 1);
  const xFor = (midi: number) => (midi - LOW) * laneW();
  const WIDTH = 0.67; // bars are 33% thinner than their key / lane

  // Place a new bar straight above its on-screen key (so the note appears to
  // rise out of the key); fall back to an even lane if the key isn't laid out.
  // Either way the bar is slimmed and kept centred over the key.
  function placeFor(midi: number): { x: number; w: number } {
    const keyEl = document.querySelector(`.pkey[data-midi="${midi}"]`) as HTMLElement | null;
    if (keyEl) {
      const kr = keyEl.getBoundingClientRect();
      if (kr.width > 0) {
        const cr = canvas.getBoundingClientRect();
        const w = kr.width * WIDTH;
        return { x: kr.left - cr.left + (kr.width - w) / 2, w };
      }
    }
    const lw = laneW();
    const full = lw * 0.76;
    const w = full * WIDTH;
    return { x: xFor(midi) + lw * 0.12 + (full - w) / 2, w };
  }

  const offOn = input.onNoteOn((e) => {
    hint.classList.add('hidden');
    const { x, w } = placeFor(e.midi);
    const alpha = Math.max(0.5, Math.min(1, e.velocity / 110));
    // retrigger: the previous bar for this key is finished off and snapped up a
    // notch (with a minimum length) so there's a clear gap — you see the end of
    // the previous note before the new one, even when spamming the same key fast.
    const prev = active.get(e.midi);
    if (prev) {
      prev.keyHeld = false;
      const RETRIGGER_GAP = 12;
      const MIN_LEN = 18;
      const len = Math.max(MIN_LEN, prev.tailY - prev.headY);
      prev.tailY = baseline - RETRIGGER_GAP;
      prev.headY = prev.tailY - len;
    }
    const bar: Bar = { x, w, alpha, headY: baseline, tailY: baseline, keyHeld: true };
    bars.push(bar);
    active.set(e.midi, bar);
    if (showNames) labels.push({ x: x + w / 2, y: baseline - 14, life: 1, text: noteName(e.midi) });
  });
  const offOff = input.onNoteOff((e) => {
    const bar = active.get(e.midi);
    if (!bar) return;
    bar.keyHeld = false; // released → it detaches and drifts up
    active.delete(e.midi);
  });

  let raf = 0;
  let last = performance.now();
  // The shared note colour drifts toward a fresh random hue every 10 seconds,
  // easing over a second or so so the palette shifts gently rather than snaps.
  let hue = HUE;
  let targetHue = HUE;
  let lastHueSwitch = last;
  function frame(nowMs: number) {
    const dt = Math.min(2.5, (nowMs - last) / 16.67);
    last = nowMs;
    const v = RISE * dt;

    // pick a new target hue every 10s, then ease toward it along the short way
    if (nowMs - lastHueSwitch >= 10000) {
      targetHue = (hue + 80 + Math.random() * 200) % 360;
      lastHueSwitch = nowMs;
    }
    const dh = ((targetHue - hue + 540) % 360) - 180;
    hue = (hue + dh * Math.min(1, 0.012 * dt) + 360) % 360;

    // clear fully each frame → crisp bars with no trailing; the real app
    // background shows straight through and blends in.
    ctx.clearRect(0, 0, W, H);

    // rising bars — all one colour, each fading out along its length as it ages
    ctx.globalCompositeOperation = 'lighter';
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      b.headY -= v;
      b.tailY = sounding(b) ? baseline : b.tailY - v;
      const top = b.headY;
      const h = b.tailY - top;
      if (h <= 0 || b.tailY < -40) { bars.splice(i, 1); continue; }

      // once released, the whole bar dims as it travels up toward the top
      const fade = Math.max(0, Math.min(1, b.tailY / (H * 0.6)));
      const a = b.alpha * (sounding(b) ? 1 : fade);
      if (!sounding(b) && a <= 0.02) { bars.splice(i, 1); continue; }

      // gradient down the bar: transparent at the older top → solid at the new
      // bottom, so each note visibly fades out with time.
      const grd = ctx.createLinearGradient(0, top, 0, b.tailY);
      grd.addColorStop(0, `hsla(${hue}, 90%, 72%, 0)`);
      grd.addColorStop(0.6, `hsla(${hue}, 95%, 66%, ${a * 0.5})`);
      grd.addColorStop(1, `hsla(${hue}, 96%, 60%, ${a})`);
      ctx.fillStyle = grd;
      ctx.shadowColor = `hsla(${hue}, 95%, 60%, ${a})`;
      ctx.shadowBlur = 22;
      roundRectPath(ctx, b.x, top, b.w, h, Math.min(7, b.w / 2));
      ctx.fill();
      ctx.shadowBlur = 0;

      // bright cap where the note meets the keyboard while it sounds
      if (sounding(b)) {
        ctx.fillStyle = `hsla(${hue}, 100%, 88%, ${a})`;
        roundRectPath(ctx, b.x, baseline - 5, b.w, 5, 2.5);
        ctx.fill();
      }
    }

    // floating note names (drift up while fading), when enabled
    if (showNames) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.font = '600 15px system-ui, -apple-system, sans-serif';
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        l.life -= 0.018 * dt;
        l.y -= v * 0.4;
        if (l.life <= 0) { labels.splice(i, 1); continue; }
        ctx.fillStyle = `hsla(${hue}, 85%, 82%, ${l.life})`;
        ctx.fillText(l.text, l.x, l.y);
      }
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('fullscreenchange', onFsChange);
    if (document.fullscreenElement) void document.exitFullscreen();
    appEl?.classList.remove('immersive', 'fs');
    offOn();
    offOff();
  };
}
