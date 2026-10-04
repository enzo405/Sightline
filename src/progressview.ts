// Feature 5 — Progress & skill map.
// Stat tiles + two single-series SVG charts (accuracy trend, accuracy by key)
// + fading-stage and improv summaries. Colors follow the validated reference
// palette (dark mode steps) with hover tooltips and a table fallback.

import { FADE_LEVELS } from './fading';
import { keyName, t } from './i18n';
import { tutorialHTML } from './tutorial';
import { PIECES, pieceTitle } from './pieces';
import { progress, streakDays } from './progress';

// reference palette, dark-surface steps
const C = {
  surface: '#1a1a19',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  series: '#3987e5',
  seriesDim: '#1c5cab',
};

let tooltipEl: HTMLDivElement | null = null;
function tooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'viz-tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function showTip(x: number, y: number, html: string) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = 'block';
  t.style.left = `${x + 12}px`;
  t.style.top = `${y - 10}px`;
}
function hideTip() { if (tooltipEl) tooltipEl.style.display = 'none'; }

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function axisLabels(svg: SVGSVGElement, w: number, h: number, pad: { l: number; r: number; t: number; b: number }) {
  // y gridlines at 0/50/100%
  for (const v of [0, 50, 100]) {
    const y = pad.t + (1 - v / 100) * (h - pad.t - pad.b);
    svg.appendChild(svgEl('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: v === 0 ? C.baseline : C.grid, 'stroke-width': 1 }));
    const label = svgEl('text', { x: pad.l - 6, y: y + 3, fill: C.muted, 'font-size': 10, 'text-anchor': 'end' });
    label.textContent = `${v}%`;
    svg.appendChild(label);
  }
}

/** Single-series accuracy trend line (last N sight-reading exercises). */
function trendChart(host: HTMLElement, points: { label: string; pct: number }[]): void {
  const w = 440, h = 160;
  const pad = { l: 34, r: 10, t: 12, b: 18 };
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h });
  axisLabels(svg, w, h, pad);
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? (w - pad.l - pad.r) / 2 : (i / (n - 1)) * (w - pad.l - pad.r));
  const y = (p: number) => pad.t + (1 - p / 100) * (h - pad.t - pad.b);

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  svg.appendChild(svgEl('path', { d, fill: 'none', stroke: C.series, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  points.forEach((p, i) => {
    const cx = x(i), cy = y(p.pct);
    const dot = svgEl('circle', { cx, cy, r: n > 25 ? 2.5 : 3.5, fill: C.series, stroke: C.surface, 'stroke-width': 2 });
    const hit = svgEl('circle', { cx, cy, r: 9, fill: 'transparent' });
    hit.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, `<b>${p.pct}%</b><span>${p.label}</span>`));
    hit.addEventListener('mouseleave', hideTip);
    svg.appendChild(dot);
    svg.appendChild(hit);
  });
  // direct label on the last point only
  if (n > 0) {
    const last = points[n - 1];
    const t = svgEl('text', { x: Math.min(x(n - 1), w - pad.r - 4), y: y(last.pct) - 8, fill: C.ink2, 'font-size': 11, 'text-anchor': 'end' });
    t.textContent = `${last.pct}%`;
    svg.appendChild(t);
  }
  host.appendChild(svg);
}

/** Single-series bars: accuracy by key signature. */
function keyBars(host: HTMLElement, rows: { key: string; pct: number; total: number }[]): void {
  const w = 440, h = 170;
  const pad = { l: 34, r: 10, t: 12, b: 26 };
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h });
  axisLabels(svg, w, h, pad);
  const plotW = w - pad.l - pad.r;
  const bw = Math.min(36, plotW / rows.length - 2); // 2px surface gap between bars
  const y0 = h - pad.b;
  rows.forEach((r, i) => {
    const cx = pad.l + (i + 0.5) * (plotW / rows.length);
    const bh = Math.max(1, (r.pct / 100) * (h - pad.t - pad.b));
    // thin bar, 4px rounded data end, anchored flat at the baseline
    const bar = svgEl('path', {
      d: `M${cx - bw / 2},${y0} V${y0 - bh + 4} Q${cx - bw / 2},${y0 - bh} ${cx - bw / 2 + 4},${y0 - bh} H${cx + bw / 2 - 4} Q${cx + bw / 2},${y0 - bh} ${cx + bw / 2},${y0 - bh + 4} V${y0} Z`,
      fill: C.series,
    });
    bar.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, `<b>${r.pct}%</b><span>${t('progress.keyTooltip', { key: keyName(r.key), total: r.total })}</span>`));
    bar.addEventListener('mouseleave', hideTip);
    svg.appendChild(bar);
    const t2 = svgEl('text', { x: cx, y: h - 8, fill: C.ink2, 'font-size': 11, 'text-anchor': 'middle' });
    t2.textContent = keyName(r.key);
    svg.appendChild(t2);
  });
  host.appendChild(svg);
}

function tableView(rows: string[][], header: string[]): string {
  return `<details class="viz-table"><summary>View as table</summary><table>
    <tr>${header.map((hh) => `<th>${hh}</th>`).join('')}</tr>
    ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </table></details>`;
}

export function mountProgress(root: HTMLElement): () => void {
  const p = progress();
  const hist = p.sightread.history;
  const recent = hist.slice(-30);
  const last10 = hist.slice(-10);
  const avgAcc = last10.length ? Math.round((last10.reduce((s, r) => s + r.accuracy, 0) / last10.length) * 100) : null;
  const bestNpm = hist.length ? Math.max(...hist.map((r) => r.notesPerMin)) : null;
  const streak = streakDays();

  const keyRows = Object.entries(p.sightread.byKey)
    .map(([key, v]) => ({ key, pct: v.total ? Math.round((v.correct / v.total) * 100) : 0, total: v.total }))
    .sort((a, b) => b.total - a.total);

  const improvLast = p.improv.sessions.slice(-1)[0];
  const crBest = p.improv.callResponse.length ? Math.max(...p.improv.callResponse.map((r) => r.score)) : null;

  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('progress.title')}</h2>
      <p>${t('progress.intro')}</p>
      ${tutorialHTML('progress')}
    </div>
    <div class="result-tiles wide">
      <div class="tile"><div class="tile-num">${p.sightread.level}<span class="tile-sub">/10</span></div><div class="tile-label">${t('progress.level')}</div></div>
      <div class="tile"><div class="tile-num">${avgAcc !== null ? avgAcc + '%' : '—'}</div><div class="tile-label">${t('progress.accuracy')}</div></div>
      <div class="tile"><div class="tile-num">${bestNpm ?? '—'}</div><div class="tile-label">${t('progress.bestSpeed')}</div></div>
      <div class="tile"><div class="tile-num">${streak}</div><div class="tile-label">${t('progress.streak')}</div></div>
      <div class="tile"><div class="tile-num">${p.totals.notesPlayed.toLocaleString()}</div><div class="tile-label">${t('progress.notesPlayed')}</div></div>
    </div>
    <div class="viz-grid">
      <div class="panel viz-root">
        <h3>${t('progress.trendTitle')}</h3>
        <div id="pg-trend"></div>
        <div id="pg-trend-table"></div>
      </div>
      <div class="panel viz-root">
        <h3>${t('progress.keysTitle')}</h3>
        <div id="pg-keys"></div>
        <div id="pg-keys-table"></div>
      </div>
      <div class="panel">
        <h3>${t('progress.fadingTitle')}</h3>
        <div id="pg-fading"></div>
      </div>
      <div class="panel">
        <h3>${t('progress.improvTitle')}</h3>
        <div id="pg-improv"></div>
      </div>
      <div class="panel">
        <h3>${t('progress.techniqueTitle')}</h3>
        <div id="pg-technique"></div>
      </div>
    </div>
  `;

  const trendHost = root.querySelector('#pg-trend') as HTMLElement;
  if (recent.length >= 2) {
    const pts = recent.map((r) => ({
      label: t('progress.trendLabel', { level: r.level, key: keyName(r.key), date: new Date(r.date).toLocaleDateString() }),
      pct: Math.round(r.accuracy * 100),
    }));
    trendChart(trendHost, pts);
    (root.querySelector('#pg-trend-table') as HTMLElement).innerHTML =
      tableView(recent.map((r) => [new Date(r.date).toLocaleDateString(), String(r.level), keyName(r.key), Math.round(r.accuracy * 100) + '%', String(r.notesPerMin)]),
        [t('progress.colDate'), t('progress.colLevel'), t('progress.colKey'), t('progress.colAccuracy'), t('progress.colNpm')]);
  } else {
    trendHost.innerHTML = `<p class="muted">${t('progress.trendEmpty')}</p>`;
  }

  const keysHost = root.querySelector('#pg-keys') as HTMLElement;
  if (keyRows.length) {
    keyBars(keysHost, keyRows.slice(0, 9));
    (root.querySelector('#pg-keys-table') as HTMLElement).innerHTML =
      tableView(keyRows.map((r) => [t('progress.keyMajor', { key: keyName(r.key) }), r.pct + '%', String(r.total)]), [t('progress.colKey'), t('progress.colAccuracy'), t('progress.colNpm')]);
  } else {
    keysHost.innerHTML = `<p class="muted">${t('progress.keysEmpty')}</p>`;
  }

  (root.querySelector('#pg-fading') as HTMLElement).innerHTML = PIECES.map((piece) => {
    const st = p.fading[piece.id];
    const stage = (st?.level ?? 0) + (st && st.level >= FADE_LEVELS.length - 1 ? 1 : 0);
    const stars = FADE_LEVELS.map((_, i) => `<span class="fade-dot${i < stage ? ' on' : ''}"></span>`).join('');
    return `<div class="fade-row"><span>${pieceTitle(piece.id)}</span><span class="fade-dots">${stars}</span>
      <span class="muted">${st ? t(st.completions === 1 ? 'progress.run' : 'progress.runs', { n: st.completions }) : t('progress.notStarted')}</span></div>`;
  }).join('');

  (root.querySelector('#pg-improv') as HTMLElement).innerHTML = `
    <div class="stat-row">
      <div class="tile"><div class="tile-num">${improvLast ? improvLast.chordTonePct + '%' : '—'}</div><div class="tile-label">${t('progress.chordTonesLast', { prog: improvLast ? ` (${improvLast.progression})` : '' })}</div></div>
      <div class="tile"><div class="tile-num">${crBest !== null ? crBest + '/5' : '—'}</div><div class="tile-label">${t('progress.bestCall')}</div></div>
      <div class="tile"><div class="tile-num">${p.improv.sessions.length}</div><div class="tile-label">${t('progress.improvSessions')}</div></div>
    </div>`;

  const techTypeLabel: Record<string, string> = {
    'five-major': t('tech.fiveMajor'), 'five-minor': t('tech.fiveMinor'),
    'scale-major': t('tech.scaleMajor'), 'arpeggio-major': t('tech.arpeggio'),
  };
  const techEntries = Object.entries(p.technique)
    .filter(([, v]) => v.bestNpm > 0)
    .sort((a, b) => b[1].bestNpm - a[1].bestNpm);
  (root.querySelector('#pg-technique') as HTMLElement).innerHTML = techEntries.length
    ? `<div class="stat-row">` + techEntries.map(([id, v]) => {
        const [type, key, hand] = id.split(':');
        const label = `${techTypeLabel[type] ?? type} · ${key} · ${hand === 'right' ? t('tech.right') : t('tech.left')}`;
        return `<div class="tile"><div class="tile-num">${v.bestNpm}<span class="tile-sub"> n/min</span></div><div class="tile-label">${label}</div></div>`;
      }).join('') + `</div>`
    : `<p class="muted">${t('progress.techniqueEmpty')}</p>`;

  return () => hideTip();
}
