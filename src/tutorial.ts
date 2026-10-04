// Collapsible "How it works" tutorial shown under each page's intro.
// Steps live in i18n under `tut.<page>` as a single string, each step
// separated by `|`, so translations stay in one place.

import { t } from './i18n';

export function tutorialHTML(page: string): string {
  const raw = t(`tut.${page}`);
  if (!raw || raw === `tut.${page}`) return ''; // no tutorial for this page
  const steps = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (!steps.length) return '';
  return `<details class="tutorial">
    <summary>${t('tut.title')}</summary>
    <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  </details>`;
}
