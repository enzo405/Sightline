// Mirror bookmarks — save pieces you played in the Mirror, each with a name.
// Stored locally (localStorage); the whole quantized result is kept so a saved
// piece restores both its notation and its playback exactly. Bookmarks can be
// exported to a JSON file and re-imported later (merge by id).

import { QuantizeResult } from './quantize';

export interface Bookmark {
  id: string;
  name: string;
  savedAt: string; // ISO
  bpm: number;
  grid: '8' | '16';
  result: QuantizeResult;
}

const KEY = 'sightline.mirror.bookmarks';
const EXPORT_KIND = 'sightline-mirror-bookmarks';
const EXPORT_VERSION = 1;

function newId(): string {
  return 'bm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function isBookmark(x: unknown): x is Bookmark {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  const r = b.result as { score?: { measures?: unknown } } | undefined;
  return typeof b.name === 'string' && !!r && !!r.score && Array.isArray(r.score.measures);
}

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isBookmark) : [];
  } catch {
    return [];
  }
}

function persist(list: Bookmark[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full/blocked */ }
}

/** Save a freshly played piece. Newest first. Returns the stored bookmark. */
export function addBookmark(name: string, bpm: number, grid: '8' | '16', result: QuantizeResult): Bookmark {
  const bm: Bookmark = { id: newId(), name: name.trim() || 'Untitled', savedAt: new Date().toISOString(), bpm, grid, result };
  persist([bm, ...loadBookmarks()]);
  return bm;
}

export function renameBookmark(id: string, name: string): void {
  const list = loadBookmarks();
  const bm = list.find((b) => b.id === id);
  if (!bm) return;
  bm.name = name.trim() || bm.name;
  persist(list);
}

export function deleteBookmark(id: string): void {
  persist(loadBookmarks().filter((b) => b.id !== id));
}

/** JSON text of all bookmarks, for download. */
export function exportBookmarksJSON(): string {
  return JSON.stringify({ kind: EXPORT_KIND, version: EXPORT_VERSION, bookmarks: loadBookmarks() }, null, 2);
}

/** Merge bookmarks from an export file. Existing ids are kept (skipped). */
export function importBookmarksJSON(text: string): { added: number; skipped: number } {
  const parsed = JSON.parse(text);
  const incoming: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
  const list = loadBookmarks();
  const seen = new Set(list.map((b) => b.id));
  let added = 0;
  let skipped = 0;
  for (const raw of incoming) {
    if (!isBookmark(raw)) { skipped++; continue; }
    const bm = raw as Bookmark;
    if (!bm.id || seen.has(bm.id)) {
      if (bm.id && seen.has(bm.id)) { skipped++; continue; }
      bm.id = newId();
    }
    seen.add(bm.id);
    list.push(bm);
    added++;
  }
  // newest-saved first
  list.sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
  persist(list);
  return { added, skipped };
}
