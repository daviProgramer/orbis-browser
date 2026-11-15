import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  type Bookmark,
  type DownloadInfo,
  type HistoryEntry,
  type Settings,
  type SitePermissions,
} from '../shared/types';
import { DownloadManager } from './downloads';
import { JsonStore } from './store';

export interface Services {
  settings: JsonStore<Settings>;
  bookmarks: JsonStore<Bookmark[]>;
  history: JsonStore<HistoryEntry[]>;
  permissions: JsonStore<SitePermissions>;
  downloads: DownloadManager;
}

let instance: Services | null = null;

/** Lazily created singletons for all persisted data (lives in the user data directory). */
export function services(): Services {
  if (!instance) {
    const settings = new JsonStore<Settings>('settings', {
      ...DEFAULT_SETTINGS,
      lts: { ...DEFAULT_SETTINGS.lts },
    });
    instance = {
      settings,
      bookmarks: new JsonStore<Bookmark[]>('bookmarks', []),
      history: new JsonStore<HistoryEntry[]>('history', []),
      permissions: new JsonStore<SitePermissions>('permissions', {}),
      downloads: new DownloadManager(new JsonStore<DownloadInfo[]>('downloads', [])),
    };
  }
  return instance;
}

export function flushAll(): void {
  if (!instance) return;
  instance.settings.flush();
  instance.bookmarks.flush();
  instance.history.flush();
  instance.permissions.flush();
  instance.downloads.flush();
}

// ---------------------------------------------------------------- history

const historyListeners = new Set<() => void>();
export function onHistoryChanged(fn: () => void): () => void {
  historyListeners.add(fn);
  return () => {
    historyListeners.delete(fn);
  };
}
function historyChanged(): void {
  for (const l of historyListeners) l();
}

export function addHistory(entry: { url: string; title: string; favicon: string | null }): void {
  const s = services().history;
  const list = s.data;
  const last = list[0];
  const now = Date.now();
  if (last && last.url === entry.url && now - last.visitedAt < 5000) {
    last.visitedAt = now;
    if (entry.title) last.title = entry.title;
  } else {
    list.unshift({ id: randomUUID(), ...entry, visitedAt: now });
    if (list.length > 10000) list.length = 10000;
  }
  s.save();
  historyChanged();
}

export function updateHistoryTitle(url: string, title: string, favicon: string | null): void {
  const s = services().history;
  const recent = s.data.slice(0, 25).find((h) => h.url === url);
  if (!recent) return;
  let changed = false;
  if (title && recent.title !== title) {
    recent.title = title;
    changed = true;
  }
  if (favicon && recent.favicon !== favicon) {
    recent.favicon = favicon;
    changed = true;
  }
  if (changed) {
    s.save();
    historyChanged();
  }
}

export function queryHistory(q: string, limit: number): HistoryEntry[] {
  const query = q.trim().toLowerCase();
  const all = services().history.data;
  const out: HistoryEntry[] = [];
  for (const h of all) {
    if (!query || h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) {
      out.push(h);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function removeHistory(id: string): void {
  const s = services().history;
  s.data = s.data.filter((h) => h.id !== id);
  s.save();
  historyChanged();
}

export function clearHistory(): void {
  const s = services().history;
  s.data = [];
  s.save();
  historyChanged();
}
