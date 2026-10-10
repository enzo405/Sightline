// 30-Day Journey — a guided month of short daily sessions.
// Each day pairs note-reading (solfège) with fingering technique: three graded
// tasks drawn from the shared engines, cleared one by one. Days unlock in
// sequence as you finish them, so the calendar fills in like a streak tracker.
// Reuses the PlayThrough engine and notation renderer; completion is stored in
// progress so the month survives reloads.

import { keyName, t } from './i18n';
import { tutorialHTML } from './tutorial';
import { mainStream, renderScore, NoteStatus } from './notation';
import { PlayThrough } from './playthrough';
import { countNotes, dailyHighestDone, dailyLastDate, markDailyDone, progress, resetDaily } from './progress';
import { settings } from './settings';
import { DAILY_TOTAL, DailyDayDef, DailyTask, dailyDay } from './curriculum';

// Streak discipline: do one day per calendar day. You may miss at most one day
// (GRACE_GAP = 2 means "did it 2 days ago" still counts). Fall further behind
// and the series resets to day 1.
const GRACE_GAP = 2;

/** Whole calendar days between an ISO timestamp and today (local). */
function daysSince(iso: string): number {
  const d = new Date(iso);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((b - a) / 86400000);
}

/** Did the latest completion happen today? (today's journey slot is used up) */
function doneToday(): boolean {
  const last = dailyLastDate();
  return last !== null && daysSince(last) === 0;
}

/** True when the player let too many days pass mid-journey — the series is lost. */
function streakBroken(): boolean {
  const last = dailyLastDate();
  if (!last) return false;
  const done = Object.keys(progress().daily.done).length;
  if (done === 0 || done >= DAILY_TOTAL) return false;
  return daysSince(last) > GRACE_GAP;
}

function taskTitle(task: DailyTask): string {
  const p: Record<string, string | number> = { ...task.params };
  if (typeof p.root === 'string') p.root = keyName(p.root);
  if (typeof p.hand === 'string') p.hand = p.hand === 'right' ? t('tech.right') : t('tech.left');
  return t(task.titleKey, p);
}

function nextOpenDay(): number {
  const h = dailyHighestDone();
  return h >= DAILY_TOTAL ? DAILY_TOTAL : h + 1;
}

export function mountDaily(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="feature-intro">
      <h2>${t('daily.title')}</h2>
      <p>${t('daily.intro')}</p>
      ${tutorialHTML('daily')}
    </div>
    <div class="panel daily-overview">
      <div class="daily-ring" id="daily-ring"><span id="daily-ring-num"></span></div>
      <div class="daily-overview-text">
        <h3>${t('daily.journey')}</h3>
        <p class="muted" id="daily-overview-sub"></p>
        <button class="btn primary" id="daily-continue"></button>
      </div>
    </div>
    <div class="cal-grid" id="daily-grid"></div>
    <div class="daily-detail hidden" id="daily-detail"></div>
  `;

  const ringEl = root.querySelector('#daily-ring') as HTMLElement;
  const ringNumEl = root.querySelector('#daily-ring-num') as HTMLElement;
  const subEl = root.querySelector('#daily-overview-sub') as HTMLElement;
  const continueBtn = root.querySelector('#daily-continue') as HTMLButtonElement;
  const gridEl = root.querySelector('#daily-grid') as HTMLElement;
  const detailEl = root.querySelector('#daily-detail') as HTMLElement;

  // If the player fell behind mid-journey, the series resets before anything renders.
  let seriesLost = streakBroken();
  if (seriesLost) resetDaily();

  let engine: PlayThrough | null = null;
  let timer: number | null = null;
  function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }

  // ---------- overview + calendar ----------
  function renderOverview() {
    const done = Object.keys(progress().daily.done).length;
    const pct = Math.round((done / DAILY_TOTAL) * 100);
    ringEl.style.setProperty('--pct', String(pct));
    ringNumEl.innerHTML = `${done}<small>/${DAILY_TOTAL}</small>`;
    const nd = nextOpenDay();
    const resting = doneToday();
    const diffName = t('settings.diff' + settings().difficulty.charAt(0).toUpperCase() + settings().difficulty.slice(1));

    let status: string;
    if (seriesLost) status = t('daily.streakLost');
    else if (done >= DAILY_TOTAL) status = t('daily.allDone');
    else if (done === 0) status = t('daily.overviewSub', { done, total: DAILY_TOTAL });
    else if (resting) status = t('daily.restToday');
    else status = t('daily.onTrack', { day: nd });

    const parts = [status];
    if (done < DAILY_TOTAL) parts.push(`<span class="daily-streak-note">${t('daily.streakLabel', { n: done, total: DAILY_TOTAL })} · ${t('daily.graceNote')}</span>`);
    parts.push(`<span class="daily-diff-note">${t('daily.difficultyNote', { level: diffName })}</span>`);
    subEl.innerHTML = parts.join('<br>');

    if (seriesLost) subEl.classList.add('daily-lost'); else subEl.classList.remove('daily-lost');

    if (resting && done < DAILY_TOTAL) {
      continueBtn.textContent = t('daily.comeBackTomorrow');
      continueBtn.disabled = true;
    } else {
      continueBtn.disabled = false;
      continueBtn.textContent = done === 0
        ? t('daily.start')
        : done >= DAILY_TOTAL ? t('daily.review') : t('daily.continue', { day: nd });
    }
  }

  function renderGrid() {
    const doneMap = progress().daily.done;
    const highest = dailyHighestDone();
    const restFrontier = doneToday() ? highest + 1 : 0; // next day is resting until tomorrow
    let html = '';
    for (let day = 1; day <= DAILY_TOTAL; day++) {
      const done = !!doneMap[day];
      const resting = !done && day === restFrontier;
      const unlocked = day <= highest + 1 && !resting;
      const current = !done && !resting && day === highest + 1;
      const cls = ['cal-day'];
      if (done) cls.push('done');
      if (current) cls.push('current');
      if (resting) cls.push('rest');
      if (!unlocked && !resting) cls.push('locked');
      const badge = done ? '<span class="cal-badge">✓</span>'
        : resting ? '<span class="cal-badge">🌙</span>'
        : !unlocked ? '<span class="cal-badge">🔒</span>' : '';
      const disabled = unlocked ? '' : ' disabled';
      html += `<button class="${cls.join(' ')}" data-day="${day}"${disabled}>
        <span class="cal-num">${day}</span>${badge}</button>`;
    }
    gridEl.innerHTML = html;
  }

  // ---------- a single day ----------
  let def: DailyDayDef | null = null;
  let taskDone: boolean[] = [];
  let activeIdx = 0;

  function closeDay() {
    engine?.dispose();
    engine = null;
    clearTimer();
    def = null;
    detailEl.classList.add('hidden');
    detailEl.innerHTML = '';
  }

  function openDay(day: number) {
    seriesLost = false; // re-engaging clears the "series lost" notice
    engine?.dispose();
    engine = null;
    clearTimer();
    def = dailyDay(day, settings().difficulty);
    taskDone = def.tasks.map(() => false);
    detailEl.classList.remove('hidden');
    detailEl.innerHTML = `
      <div class="daily-detail-head">
        <button class="btn ghost" id="daily-back">← ${t('daily.back')}</button>
        <div>
          <h3>${t('daily.dayN', { day })}</h3>
          <p class="muted">${t(def.focusKey)}</p>
        </div>
      </div>
      <ol class="task-list" id="daily-tasks"></ol>
      <div class="score-paper" id="daily-stage"></div>
      <p class="status-text" id="daily-live"></p>
      <div class="daily-controls" id="daily-controls"></div>
    `;
    (detailEl.querySelector('#daily-back') as HTMLButtonElement)
      .addEventListener('click', closeDay);
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    renderTaskList();
    startTask(firstPending());
  }

  function firstPending(): number {
    const i = taskDone.findIndex((d) => !d);
    return i < 0 ? taskDone.length - 1 : i;
  }

  function renderTaskList() {
    if (!def) return;
    const listEl = detailEl.querySelector('#daily-tasks') as HTMLElement;
    listEl.innerHTML = def.tasks.map((task, i) => {
      const state = taskDone[i] ? 'done' : i === activeIdx ? 'active' : 'pending';
      const mark = taskDone[i] ? '✓' : i === activeIdx ? '▶' : i + 1;
      return `<li class="task-item ${state}"><span class="task-mark">${mark}</span>
        <span class="task-name">${taskTitle(task)}</span></li>`;
    }).join('');
  }

  function startTask(i: number) {
    if (!def) return;
    engine?.dispose();
    clearTimer();
    activeIdx = i;
    renderTaskList();

    const task = def.tasks[i];
    const score = task.build();
    const stream = mainStream(score);
    const stageEl = detailEl.querySelector('#daily-stage') as HTMLElement;
    const liveEl = detailEl.querySelector('#daily-live') as HTMLElement;
    const controlsEl = detailEl.querySelector('#daily-controls') as HTMLElement;
    controlsEl.innerHTML = '';
    liveEl.textContent = t('read.noteCount', { n: 1, total: stream.length });

    const rerender = (statuses: Map<number, NoteStatus>) => {
      renderScore(stageEl, score, {
        statuses,
        showNames: task.showNames,
        showFingering: task.showFingering,
        measuresPerLine: 4,
      });
    };

    engine = new PlayThrough(stream, {
      onUpdate: (statuses, pos) => {
        rerender(statuses);
        if (pos < stream.length) liveEl.textContent = t('read.noteCount', { n: pos + 1, total: stream.length });
      },
      onComplete: (res) => {
        countNotes(stream.length);
        const pct = Math.round(res.accuracy * 100);
        const passed = res.accuracy >= task.goal;
        liveEl.textContent = t('read.done');
        if (passed) {
          taskDone[i] = true;
          renderTaskList();
          const allDone = taskDone.every(Boolean);
          if (allDone) {
            completeDay();
          } else {
            controlsEl.innerHTML =
              `<p class="result-note good">${t('daily.taskCleared', { pct })}</p>`;
            timer = window.setTimeout(() => startTask(firstPending()), 1100);
          }
        } else {
          controlsEl.innerHTML = `
            <p class="result-note">${t('daily.taskRetry', { pct, goal: Math.round(task.goal * 100) })}</p>
            <button class="btn primary" id="daily-retry">${t('daily.retry')}</button>`;
          (controlsEl.querySelector('#daily-retry') as HTMLButtonElement)
            .addEventListener('click', () => startTask(i));
        }
      },
    });
    engine.start();
  }

  function completeDay() {
    if (!def) return;
    const day = def.day;
    const wasNew = !progress().daily.done[day];
    const prevHighest = dailyHighestDone();
    markDailyDone(day);
    engine?.dispose();
    engine = null;
    renderOverview();
    renderGrid();
    const liveEl = detailEl.querySelector('#daily-live') as HTMLElement;
    const controlsEl = detailEl.querySelector('#daily-controls') as HTMLElement;
    liveEl.textContent = '';

    const advanced = wasNew && day === prevHighest + 1; // finished the frontier → rest until tomorrow
    const canReviewNext = day < DAILY_TOTAL && day + 1 <= dailyHighestDone();
    let action: string;
    if (advanced && day < DAILY_TOTAL) action = `<p class="muted daily-rest-msg">🌙 ${t('daily.restToday')}</p>`;
    else if (canReviewNext) action = `<button class="btn primary" id="daily-next">${t('daily.nextDay', { day: day + 1 })}</button>`;
    else if (day >= DAILY_TOTAL) action = `<p class="muted">${t('daily.allDone')}</p>`;
    else action = '';

    controlsEl.innerHTML = `
      <div class="daily-done-banner">
        <div class="daily-done-emoji">🎉</div>
        <p>${t('daily.dayDone', { day })}</p>
        <div class="daily-done-actions">
          ${action}
          <button class="btn" id="daily-calendar">${t('daily.toCalendar')}</button>
        </div>
      </div>`;
    const nextBtn = controlsEl.querySelector('#daily-next') as HTMLButtonElement | null;
    nextBtn?.addEventListener('click', () => openDay(day + 1));
    (controlsEl.querySelector('#daily-calendar') as HTMLButtonElement)
      .addEventListener('click', closeDay);
  }

  // ---------- wiring ----------
  gridEl.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('.cal-day') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    openDay(Number(btn.dataset.day));
  });
  continueBtn.addEventListener('click', () => openDay(nextOpenDay()));

  renderOverview();
  renderGrid();

  return () => {
    engine?.dispose();
    clearTimer();
  };
}
