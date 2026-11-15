import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { InitData, Settings, SitePermissions, ViewRect } from '../shared/types';
import { defaultSettings, sanitizeSettings } from './settings';
import {
  BrowserWindowController,
  broadcast,
  broadcastBookmarks,
  broadcastSettings,
  getNormalController,
  openWindow,
  uiControllers,
} from './window';
import { clearHistory, flushAll, queryHistory, removeHistory, services } from './services';

app.setName('Orbis');
// Present a regular Chrome user agent (no "Electron/" token) so sites such as YouTube, ChatGPT,
// GitHub and Discord serve their normal desktop experience.
app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|orbis-browser|Orbis)\/\S+/gi, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------------------------------------------------------------- secure IPC

type Handler<A extends unknown[], R> = (ctrl: BrowserWindowController, ...args: A) => R | Promise<R>;

/**
 * Registers an IPC handler that only answers the top-level frame of an Orbis UI window.
 * Web content never has a preload or access to these channels, but this guards against anything unexpected.
 */
function handle<A extends unknown[], R>(channel: string, fn: Handler<A, R>): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const ctrl = uiControllers.get(event.sender.id);
    if (!ctrl || event.senderFrame !== event.sender.mainFrame) {
      throw new Error(`Rejected IPC call on ${channel}`);
    }
    return fn(ctrl, ...(args as A));
  });
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function registerIpc(): void {
  handle('app:init', (ctrl): InitData => ({
    platform: process.platform,
    incognito: ctrl.incognito,
    version: app.getVersion(),
    settings: services().settings.data,
    bookmarks: services().bookmarks.data,
    downloads: ctrl.downloads.list,
    state: ctrl.getState(),
  }));

  // tabs
  handle('tabs:create', (ctrl, url?: unknown) => {
    ctrl.createTab(isStr(url) ? url : undefined);
  });
  handle('tabs:close', (ctrl, id: unknown) => {
    if (isInt(id)) ctrl.closeTab(id);
  });
  handle('tabs:activate', (ctrl, id: unknown) => {
    if (isInt(id)) ctrl.activate(id);
  });
  handle('tabs:move', (ctrl, id: unknown, index: unknown) => {
    if (isInt(id) && isInt(index)) ctrl.moveTab(id, index);
  });
  handle('tabs:contextMenu', (ctrl, id: unknown) => {
    if (isInt(id)) ctrl.showTabContextMenu(id);
  });

  // navigation
  handle('nav:go', (ctrl, input: unknown, opts?: unknown) => {
    const newTab = !!(opts && typeof opts === 'object' && (opts as { newTab?: boolean }).newTab);
    return ctrl.navigate(isStr(input) ? input.slice(0, 4096) : '', { newTab });
  });
  handle('nav:back', (ctrl) => ctrl.goBack());
  handle('nav:forward', (ctrl) => ctrl.goForward());
  handle('nav:reload', (ctrl) => ctrl.reload());
  handle('nav:stop', (ctrl) => ctrl.stop());
  handle('nav:home', (ctrl) => ctrl.goHome());

  // zoom / find
  handle('zoom:in', (ctrl) => ctrl.zoom(1));
  handle('zoom:out', (ctrl) => ctrl.zoom(-1));
  handle('zoom:reset', (ctrl) => ctrl.zoom(0));
  handle('find:start', (ctrl, text: unknown, opts: unknown) => {
    const o = (opts ?? {}) as { findNext?: boolean; forward?: boolean; matchCase?: boolean };
    ctrl.findStart(isStr(text) ? text.slice(0, 500) : '', {
      findNext: !!o.findNext,
      forward: o.forward !== false,
      matchCase: !!o.matchCase,
    });
  });
  handle('find:stop', (ctrl) => ctrl.findStop());

  // layout
  handle('layout:viewport', (ctrl, rect: unknown) => {
    const r = rect as ViewRect | null;
    if (r && [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      ctrl.setViewport(r);
    } else {
      ctrl.setViewport(null);
    }
  });
  handle('layout:overlay', (ctrl, overlay: unknown) => ctrl.setOverlay(!!overlay));

  // window controls
  handle('win:minimize', (ctrl) => ctrl.win.minimize());
  handle('win:toggleMaximize', (ctrl) => {
    if (ctrl.win.isMaximized()) ctrl.win.unmaximize();
    else ctrl.win.maximize();
  });
  handle('win:close', (ctrl) => ctrl.win.close());
  handle('win:new', (_ctrl, incognito: unknown) => {
    openWindow(!!incognito);
  });

  // settings
  handle('settings:set', (_ctrl, partial: unknown): Settings => {
    const store = services().settings;
    Object.assign(store.data, sanitizeSettings(partial));
    store.save();
    broadcastSettings();
    return store.data;
  });
  handle('settings:reset', (): Settings => {
    const store = services().settings;
    store.data = defaultSettings();
    store.save();
    broadcastSettings();
    return store.data;
  });
  handle('settings:pickBackground', async (ctrl) => {
    const result = await dialog.showOpenDialog(ctrl.win, {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    const file = result.filePaths[0];
    try {
      const stat = fs.statSync(file);
      if (stat.size > 4 * 1024 * 1024) return { ok: false, error: 'Please choose an image smaller than 4 MB.' };
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      const dataUrl = `data:image/${mime};base64,${fs.readFileSync(file).toString('base64')}`;
      return { ok: true, dataUrl };
    } catch {
      return { ok: false, error: 'Could not read that file.' };
    }
  });

  // bookmarks / history / suggestions
  handle('bookmarks:toggle', (ctrl) => ctrl.toggleBookmark());
  handle('bookmarks:remove', (_ctrl, id: unknown) => {
    if (!isStr(id)) return;
    const store = services().bookmarks;
    store.data = store.data.filter((b) => b.id !== id);
    store.save();
    broadcastBookmarks();
  });
  handle('history:query', (_ctrl, q: unknown, limit?: unknown) =>
    queryHistory(isStr(q) ? q : '', isInt(limit) ? Math.min(limit, 1000) : 300),
  );
  handle('history:remove', (_ctrl, id: unknown) => {
    if (isStr(id)) removeHistory(id);
  });
  handle('history:clear', () => clearHistory());
  handle('suggest:query', (ctrl, q: unknown) => ctrl.suggest(isStr(q) ? q.slice(0, 500) : ''));

  // downloads
  handle('downloads:open', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.open(id));
  handle('downloads:show', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.show(id));
  handle('downloads:pause', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.pause(id));
  handle('downloads:resume', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.resume(id));
  handle('downloads:cancel', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.cancel(id));
  handle('downloads:remove', (ctrl, id: unknown) => isStr(id) && ctrl.downloads.remove(id));
  handle('downloads:clear', (ctrl) => ctrl.downloads.clear());

  // permissions
  handle('permissions:respond', (ctrl, id: unknown, allow: unknown, remember: unknown) => {
    if (isStr(id)) ctrl.respondPermission(id, !!allow, !!remember);
  });
  handle('permissions:list', (): SitePermissions => services().permissions.data);
  handle('permissions:revoke', (_ctrl, origin: unknown, permission: unknown): SitePermissions => {
    const store = services().permissions;
    if (isStr(origin) && isStr(permission) && store.data[origin]) {
      delete store.data[origin][permission];
      if (Object.keys(store.data[origin]).length === 0) delete store.data[origin];
      store.save();
    }
    return store.data;
  });
  handle('permissions:clearAll', (): SitePermissions => {
    const store = services().permissions;
    store.data = {};
    store.save();
    return store.data;
  });

  // privacy
  handle('data:clear', async (ctrl, opts: unknown) => {
    const o = (opts ?? {}) as { history?: boolean; cache?: boolean; cookies?: boolean };
    if (o.history) clearHistory();
    if (o.cache) await ctrl.session.clearCache();
    if (o.cookies) {
      await ctrl.session.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
      });
    }
  });
}

// ---------------------------------------------------------------- app lifecycle

function buildMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

app.on('web-contents-created', (_event, contents) => {
  // <webview> is never allowed.
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.on('second-instance', (_event, argv) => {
  const url = argv.find((a) => /^https?:\/\//i.test(a));
  const ctrl = getNormalController();
  if (ctrl) {
    if (ctrl.win.isMinimized()) ctrl.win.restore();
    ctrl.win.focus();
    if (url) ctrl.createTab(url);
  } else {
    openWindow(false, url);
  }
});

app.whenReady().then(() => {
  nativeTheme.themeSource = services().settings.data.theme;
  buildMenu();
  registerIpc();
  const url = process.argv.slice(1).find((a) => /^https?:\/\//i.test(a));
  openWindow(false, url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(false);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => flushAll());

// `broadcast` is re-exported for modules that need to push events to every window.
export { broadcast };
