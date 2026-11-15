import { app, shell, type DownloadItem } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DownloadInfo } from '../shared/types';
import type { JsonStore } from './store';

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return cleaned || 'download';
}

function uniquePath(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

/** Tracks downloads for one profile. Normal windows share a persisted manager; incognito windows get a private in-memory one. */
export class DownloadManager {
  private items = new Map<string, DownloadItem>();
  private listeners = new Set<(list: DownloadInfo[]) => void>();
  private timer: NodeJS.Timeout | null = null;
  list: DownloadInfo[];

  constructor(private store: JsonStore<DownloadInfo[]> | null) {
    this.list = (store?.data ?? []).map((d) =>
      d.state === 'progressing' ? { ...d, state: 'interrupted' as const, paused: false } : d,
    );
    if (store) store.data = this.list;
  }

  onChange(fn: (list: DownloadInfo[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(immediate = false): void {
    if (immediate) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    } else if (this.timer) {
      return;
    } else {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.fire();
      }, 250);
      return;
    }
    this.fire();
  }

  flush(): void {
    this.store?.flush();
  }

  private fire(): void {
    this.store?.save();
    for (const l of this.listeners) l(this.list);
  }

  track(item: DownloadItem): DownloadInfo {
    const savePath = uniquePath(app.getPath('downloads'), sanitizeFilename(item.getFilename()));
    item.setSavePath(savePath);
    const info: DownloadInfo = {
      id: randomUUID(),
      filename: path.basename(savePath),
      url: item.getURL(),
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      paused: false,
      startTime: Date.now(),
    };
    this.list.unshift(info);
    this.items.set(info.id, item);

    item.on('updated', (_e, state) => {
      info.receivedBytes = item.getReceivedBytes();
      info.totalBytes = item.getTotalBytes();
      info.paused = item.isPaused();
      if (state === 'interrupted') info.state = 'interrupted';
      this.notify();
    });
    item.once('done', (_e, state) => {
      info.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
      info.receivedBytes = item.getReceivedBytes();
      info.paused = false;
      this.items.delete(info.id);
      this.notify(true);
    });
    this.notify(true);
    return info;
  }

  private find(id: string): DownloadInfo | undefined {
    return this.list.find((d) => d.id === id);
  }

  open(id: string): void {
    const d = this.find(id);
    if (d?.state === 'completed' && fs.existsSync(d.savePath)) void shell.openPath(d.savePath);
  }
  show(id: string): void {
    const d = this.find(id);
    if (d && fs.existsSync(d.savePath)) shell.showItemInFolder(d.savePath);
  }
  pause(id: string): void {
    this.items.get(id)?.pause();
    this.notify(true);
  }
  resume(id: string): void {
    const it = this.items.get(id);
    if (it?.canResume()) it.resume();
    this.notify(true);
  }
  cancel(id: string): void {
    this.items.get(id)?.cancel();
  }
  remove(id: string): void {
    this.items.get(id)?.cancel();
    this.list = this.list.filter((d) => d.id !== id);
    if (this.store) this.store.data = this.list;
    this.notify(true);
  }
  clear(): void {
    for (const it of this.items.values()) it.cancel();
    this.list = [];
    if (this.store) this.store.data = this.list;
    this.notify(true);
  }
}
