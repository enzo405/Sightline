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
import { countNotes, dailyHighestDone, markDailyDone, progress } from './progress';
import { settings } from './settings';
import { DAILY_TOTAL, DailyDayDef, DailyTask, dailyDay } from './curriculum';

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
    const diffName = t('settings.diff' + settings().difficulty.charAt(0).toUpperCase() + settings().difficulty.slice(1));
    const base = done >= DAILY_TOTAL
      ? t('daily.allDone')
      : t('daily.overviewSub', { done, total: DAILY_TOTAL });
    subEl.innerHTML = `${base}<br><span class="daily-diff-note">${t('daily.difficultyNote', { level: diffName })}</span>`;
    continueBtn.textContent = done === 0
      ? t('daily.start')
      : done >= DAILY_TOTAL ? t('daily.review') : t('daily.continue', { day: nd });
  }

  function renderGrid() {
    const doneMap = progress().daily.done;
    const highest = dailyHighestDone();
    let html = '';
    for (let day = 1; day <= DAILY_TOTAL; day++) {
      const done = !!doneMap[day];
      const unlocked = day <= highest + 1;
      const current = !done && day === highest + 1;
      const cls = ['cal-day'];
      if (done) cls.push('done');
      if (current) cls.push('current');
      if (!unlocked) cls.push('locked');
      const badge = done ? '<span class="cal-badge">✓</span>' : !unlocked ? '<span class="cal-badge">🔒</span>' : '';
      html += `<button class="${cls.join(' ')}" data-day="${day}"${unlocked ? '' : ' disabled'}>
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
    markDailyDone(day);
    engine?.dispose();
    engine = null;
    renderOverview();
    renderGrid();
    const liveEl = detailEl.querySelector('#daily-live') as HTMLElement;
    const controlsEl = detailEl.querySelector('#daily-controls') as HTMLElement;
    liveEl.textContent = '';
    const hasNext = day < DAILY_TOTAL;
    controlsEl.innerHTML = `
      <div class="daily-done-banner">
        <div class="daily-done-emoji">🎉</div>
        <p>${t('daily.dayDone', { day })}</p>
        <div class="daily-done-actions">
          ${hasNext ? `<button class="btn primary" id="daily-next">${t('daily.nextDay', { day: day + 1 })}</button>` : `<p class="muted">${t('daily.allDone')}</p>`}
          <button class="btn" id="daily-calendar">${t('daily.toCalendar')}</button>
        </div>
      </div>`;
    if (hasNext) {
      (controlsEl.querySelector('#daily-next') as HTMLButtonElement)
        .addEventListener('click', () => openDay(day + 1));
    }
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
