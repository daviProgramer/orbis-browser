import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON-file store with debounced, atomic writes. */
export class JsonStore<T extends object> {
  private file: string;
  private timer: NodeJS.Timeout | null = null;
  data: T;

  constructor(name: string, defaults: T) {
    this.file = path.join(app.getPath('userData'), `${name}.json`);
    this.data = defaults;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      if (Array.isArray(defaults)) {
        if (Array.isArray(parsed)) this.data = parsed as T;
      } else if (parsed && typeof parsed === 'object') {
        this.data = { ...defaults, ...(parsed as object) } as T;
      }
    } catch {
      // first run or corrupted file: fall back to defaults
    }
  }

  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[orbis] failed to write ${this.file}`, err);
    }
  }
}
