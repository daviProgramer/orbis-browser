import {
  BrowserWindow,
  Menu,
  WebContentsView,
  app,
  clipboard,
  nativeTheme,
  session,
  type ContextMenuParams,
  type Input,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
} from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  SEARCH_ENGINES,
  type BrowserState,
  type EventMap,
  type NavResult,
  type PermissionRequest,
  type Suggestion,
  type TabInfo,
  type UiCommand,
  type ViewRect,
} from '../shared/types';
import { DownloadManager } from './downloads';
import { AUTO_ALLOW, PROMPTABLE, describePermission } from './permissions';
import {
  isAllowedNavigation,
  isWebUrl,
  looksLikeUrl,
  originOf,
  parseLts,
  resolveInput,
  searchUrl,
} from './resolve';
import { addHistory, onHistoryChanged, services, updateHistoryTitle } from './services';

// ---------------------------------------------------------------- registries

/** UI webContents id -> controller (used to authenticate IPC senders). */
export const uiControllers = new Map<number, BrowserWindowController>();
/** Tab webContents id -> controller. */
export const tabControllers = new Map<number, BrowserWindowController>();
export const allControllers = new Set<BrowserWindowController>();

let nextTabId = 1;
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

type Command =
  | 'new-tab'
  | 'reopen-tab'
  | 'close-tab'
  | 'new-window'
  | 'new-incognito'
  | 'focus-address'
  | 'find'
  | 'reload'
  | 'hard-reload'
  | 'bookmark'
  | 'panel-history'
  | 'panel-downloads'
  | 'toggle-sidebar'
  | 'settings'
  | 'view-source'
  | 'print'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'next-tab'
  | 'prev-tab'
  | 'tab-1' | 'tab-2' | 'tab-3' | 'tab-4' | 'tab-5' | 'tab-6' | 'tab-7' | 'tab-8' | 'tab-9'
  | 'devtools'
  | 'back'
  | 'forward'
  | 'home'
  | 'fullscreen';

function matchShortcut(input: Input): Command | null {
  const isMac = process.platform === 'darwin';
  const mod = isMac ? input.meta : input.control;
  const key = input.key.toLowerCase();

  if (input.control && !input.alt && !input.meta) {
    if (key === 'tab') return input.shift ? 'prev-tab' : 'next-tab';
    if (key === 'pagedown') return 'next-tab';
    if (key === 'pageup') return 'prev-tab';
  }
  if (mod && !input.alt) {
    switch (key) {
      case 't': return input.shift ? 'reopen-tab' : 'new-tab';
      case 'w': return 'close-tab';
      case 'n': return input.shift ? 'new-incognito' : 'new-window';
      case 'l': return 'focus-address';
      case 'f': return 'find';
      case 'r': return input.shift ? 'hard-reload' : 'reload';
      case 'd': return 'bookmark';
      case 'h': return 'panel-history';
      case 'j': return 'panel-downloads';
      case 'b': return input.shift ? null : 'toggle-sidebar';
      case ',': return 'settings';
      case 'u': return 'view-source';
      case 'p': return 'print';
      case '=':
      case '+': return 'zoom-in';
      case '-':
      case '_': return 'zoom-out';
      case '0': return 'zoom-reset';
      case 'i': return input.shift ? 'devtools' : null;
      default:
        if (/^[1-9]$/.test(key)) return `tab-${key}` as Command;
    }
  }
  if (isMac && input.meta && input.alt && key === 'i') return 'devtools';
  if (!input.control && !input.meta && !input.alt) {
    if (key === 'f5') return 'reload';
    if (key === 'f12') return 'devtools';
    if (key === 'f11') return 'fullscreen';
  }
  if (input.alt && !input.control && !input.meta) {
    if (key === 'arrowleft') return 'back';
    if (key === 'arrowright') return 'forward';
    if (key === 'home') return 'home';
  }
  return null;
}

function cleanUserAgent(): string {
  return app.userAgentFallback.replace(/\s(?:Electron|orbis-browser|Orbis)\/\S+/gi, '');
}

// ---------------------------------------------------------------- tabs

interface Tab {
  id: number;
  view: WebContentsView;
  info: TabInfo;
  lastRecordedUrl: string;
}

const configuredSessions = new WeakSet<Session>();

function findControllerFor(wc: WebContents): BrowserWindowController | undefined {
  const direct = tabControllers.get(wc.id) ?? uiControllers.get(wc.id);
  if (direct) return direct;
  const win = BrowserWindow.fromWebContents(wc);
  if (win) for (const c of allControllers) if (c.win === win) return c;
  return undefined;
}

function configureSession(sess: Session): void {
  if (configuredSessions.has(sess)) return;
  configuredSessions.add(sess);
  sess.setUserAgent(cleanUserAgent());

  sess.on('will-download', (_event, item, wc) => {
    const ctrl = findControllerFor(wc);
    const manager = ctrl ? ctrl.downloads : services().downloads;
    const info = manager.track(item);
    ctrl?.send('toast', `Downloading ${info.filename}`);
  });

  sess.setPermissionRequestHandler((wc, permission, callback, details) => {
    const requestingUrl = (details as { requestingUrl?: string }).requestingUrl ?? wc?.getURL() ?? '';
    const origin = originOf(requestingUrl);
    const ctrl = wc ? findControllerFor(wc) : undefined;
    if (!origin || !ctrl) return callback(false);
    void ctrl.resolvePermission(origin, permission, details).then(callback);
  });

  sess.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    if (AUTO_ALLOW.has(permission)) return true;
    const ctrl = wc ? findControllerFor(wc) : undefined;
    if (!ctrl) return false;
    return ctrl.getStoredPermission(requestingOrigin, permission) === 'allow';
  });
}

export class BrowserWindowController {
  readonly win: BrowserWindow;
  readonly session: Session;
  readonly downloads: DownloadManager;

  private tabs: Tab[] = [];
  private activeId: number | null = null;
  private viewport: ViewRect | null = null;
  private overlay = false;
  private htmlFullscreen = false;
  private closedTabs: string[] = [];
  private emitScheduled = false;
  private pendingPermissions = new Map<string, (allow: boolean, remember: boolean) => void>();
  private incognitoDecisions = new Map<string, 'allow' | 'deny'>();
  private disposers: Array<() => void> = [];
  private partition: string;

  constructor(readonly incognito: boolean, initialUrl?: string) {
    const isMac = process.platform === 'darwin';
    this.partition = incognito ? `orbis-incognito-${randomUUID()}` : 'persist:orbis';
    this.session = session.fromPartition(this.partition);
    configureSession(this.session);
    this.downloads = incognito ? new DownloadManager(null) : services().downloads;

    this.win = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: incognito ? 'Orbis — Incognito' : 'Orbis',
      frame: isMac,
      titleBarStyle: isMac ? 'hiddenInset' : undefined,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d0e13' : '#f3f4fa',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        spellcheck: false,
      },
    });

    allControllers.add(this);
    uiControllers.set(this.win.webContents.id, this);

    // The UI window must never navigate away or spawn windows.
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.attachShortcuts(this.win.webContents);

    this.win.once('ready-to-show', () => this.win.show());
    const refresh = () => this.scheduleEmit();
    this.win.on('maximize', refresh);
    this.win.on('unmaximize', refresh);
    this.win.on('enter-full-screen', refresh);
    this.win.on('leave-full-screen', refresh);
    this.win.on('resize', () => {
      if (this.htmlFullscreen) this.applyBounds();
    });
    this.win.on('closed', () => this.dispose());

    if (!incognito) {
      this.disposers.push(onHistoryChanged(() => this.send('history:changed', Date.now())));
    }
    this.disposers.push(this.downloads.onChange((list) => this.send('downloads:update', list)));

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) void this.win.loadURL(devUrl);
    else void this.win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));

    const start = initialUrl ?? (incognito ? '' : services().settings.data.homepage);
    this.createTab(start || undefined);
  }

  // ------------------------------------------------------------ messaging

  send<K extends keyof EventMap>(channel: K, payload: EventMap[K]): void {
    if (this.win.isDestroyed() || this.win.webContents.isDestroyed()) return;
    this.win.webContents.send(channel, payload);
  }

  private command(cmd: UiCommand): void {
    this.send('ui:command', cmd);
  }

  getState(): BrowserState {
    return {
      tabs: this.tabs.map((t) => ({ ...t.info })),
      activeId: this.activeId,
      maximized: this.win.isMaximized(),
      fullscreen: this.win.isFullScreen(),
    };
  }

  scheduleEmit(): void {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    setTimeout(() => {
      this.emitScheduled = false;
      if (this.win.isDestroyed()) return;
      const active = this.activeTab();
      const title = active?.info.title || (active?.info.isNewTab ? 'New tab' : '');
      this.win.setTitle(`${title ? `${title} — ` : ''}Orbis${this.incognito ? ' (Incognito)' : ''}`);
      this.send('state:update', this.getState());
    }, 16);
  }

  // ------------------------------------------------------------ tabs

  private activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private tabById(id: number): Tab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  createTab(rawUrl?: string, opts: { activate?: boolean; index?: number } = {}): number {
    const id = nextTabId++;
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        safeDialogs: true,
        // No preload: web content gets no access to any Orbis API.
      },
    });
    const url = rawUrl && isAllowedNavigation(rawUrl) ? rawUrl : '';
    const tab: Tab = {
      id,
      view,
      lastRecordedUrl: '',
      info: {
        id,
        title: '',
        url,
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        isNewTab: !url,
        pinned: false,
        muted: false,
        audible: false,
        zoom: 100,
        error: null,
      },
    };

    tabControllers.set(view.webContents.id, this);
    this.win.contentView.addChildView(view);
    view.setVisible(false);

    const pinnedCount = this.tabs.filter((t) => t.info.pinned).length;
    const index = Math.min(Math.max(opts.index ?? this.tabs.length, pinnedCount), this.tabs.length);
    this.tabs.splice(index, 0, tab);
    this.attachTab(tab);

    if (url) view.webContents.loadURL(url).catch(() => undefined);
    if (opts.activate !== false) this.activate(id);
    this.scheduleEmit();
    return id;
  }

  private attachTab(tab: Tab): void {
    const wc = tab.view.webContents;
    const info = tab.info;
    this.attachShortcuts(wc);

    const syncNav = () => {
      if (wc.isDestroyed()) return;
      info.canGoBack = wc.navigationHistory.canGoBack();
      info.canGoForward = wc.navigationHistory.canGoForward();
      info.loading = wc.isLoading();
      info.zoom = Math.round(wc.getZoomFactor() * 100);
      info.muted = wc.audioMuted;
      this.scheduleEmit();
    };

    wc.on('page-title-updated', (_e, title) => {
      info.title = title;
      if (!this.incognito && isWebUrl(info.url)) updateHistoryTitle(info.url, title, info.favicon);
      this.scheduleEmit();
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      info.favicon = favicons[0] ?? null;
      if (!this.incognito && isWebUrl(info.url)) updateHistoryTitle(info.url, info.title, info.favicon);
      this.scheduleEmit();
    });
    wc.on('did-start-loading', syncNav);
    wc.on('did-stop-loading', syncNav);
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace && info.error) {
        info.error = null;
        this.applyBounds();
        this.scheduleEmit();
      }
    });
    wc.on('did-navigate', (_e, url) => {
      info.url = url;
      info.isNewTab = false;
      info.error = null;
      if (!this.incognito && isWebUrl(url) && tab.lastRecordedUrl !== url) {
        addHistory({ url, title: wc.getTitle(), favicon: info.favicon });
      }
      tab.lastRecordedUrl = url;
      syncNav();
      this.applyBounds();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      info.url = url;
      syncNav();
    });
    wc.on('dom-ready', syncNav);
    wc.on('zoom-changed', (_e, direction) => {
      if (tab.id === this.activeId) this.zoom(direction === 'in' ? 1 : -1);
    });
    wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === -3 /* ERR_ABORTED */) return;
      info.error = { code, description, url: validatedURL };
      info.url = validatedURL;
      info.isNewTab = false;
      info.loading = false;
      this.applyBounds();
      this.scheduleEmit();
    });
    wc.on('render-process-gone', (_e, details) => {
      info.error = { code: -1, description: `The page stopped working (${details.reason}).`, url: info.url };
      info.loading = false;
      this.applyBounds();
      this.scheduleEmit();
    });
    wc.on('audio-state-changed', () => {
      info.audible = wc.isCurrentlyAudible();
      this.scheduleEmit();
    });
    wc.on('found-in-page', (_e, result) => {
      if (tab.id !== this.activeId) return;
      this.send('find:result', {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
      });
    });

    // Only web schemes may be navigated to; anything else (javascript:, custom protocols) is ignored.
    wc.on('will-navigate', (e, url) => {
      if (!isAllowedNavigation(url)) e.preventDefault();
    });
    wc.on('will-redirect', (e, url) => {
      if (!isAllowedNavigation(url)) e.preventDefault();
    });

    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      if (!isAllowedNavigation(url) && url !== '') return { action: 'deny' };
      // Real popups (window.open with features, e.g. OAuth sign-in windows) keep window.opener working.
      if (disposition === 'new-window' && features) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            width: 520,
            height: 720,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
          },
        };
      }
      if (url) {
        this.createTab(url, {
          activate: disposition !== 'background-tab',
          index: this.tabs.findIndex((t) => t.id === tab.id) + 1,
        });
      }
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child) => {
      child.removeMenu();
      child.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedNavigation(url)) this.createTab(url);
        return { action: 'deny' };
      });
      child.webContents.on('will-navigate', (e, url) => {
        if (!isAllowedNavigation(url)) e.preventDefault();
      });
    });

    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true;
      this.win.setFullScreen(true);
      this.applyBounds();
    });
    wc.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false;
      this.win.setFullScreen(false);
      this.applyBounds();
    });

    wc.on('context-menu', (_e, params) => this.showPageContextMenu(tab, params));
  }

  activate(id: number): void {
    const tab = this.tabById(id);
    if (!tab) return;
    if (this.activeId !== id) {
      this.activeTab()?.view.webContents.stopFindInPage('clearSelection');
    }
    this.activeId = id;
    this.applyBounds();
    if (tab.info.isNewTab) this.command({ type: 'focus-address' });
    else if (!this.overlay) tab.view.webContents.focus();
    this.scheduleEmit();
  }

  closeTab(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const tab = this.tabs[index];
    if (tab.info.url && !this.incognito && isWebUrl(tab.info.url)) this.closedTabs.push(tab.info.url);
    const wc = tab.view.webContents;
    tabControllers.delete(wc.id);
    this.tabs.splice(index, 1);
    this.win.contentView.removeChildView(tab.view);
    if (!wc.isDestroyed()) wc.close();

    if (this.tabs.length === 0) {
      this.activeId = null;
      this.win.close();
      return;
    }
    if (this.activeId === id) this.activate(this.tabs[Math.min(index, this.tabs.length - 1)].id);
    else this.scheduleEmit();
  }

  moveTab(id: number, toIndex: number): void {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [tab] = this.tabs.splice(from, 1);
    const pinnedCount = this.tabs.filter((t) => t.info.pinned).length;
    const clamped = tab.info.pinned
      ? Math.min(toIndex, pinnedCount)
      : Math.max(Math.min(toIndex, this.tabs.length), pinnedCount);
    this.tabs.splice(clamped, 0, tab);
    this.scheduleEmit();
  }

  private selectRelative(delta: number): void {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    this.activate(this.tabs[(i + delta + this.tabs.length) % this.tabs.length].id);
  }

  duplicateTab(id: number): void {
    const tab = this.tabById(id);
    if (!tab?.info.url) return;
    this.createTab(tab.info.url, { index: this.tabs.indexOf(tab) + 1 });
  }

  showTabContextMenu(id: number): void {
    const tab = this.tabById(id);
    if (!tab) return;
    const index = this.tabs.indexOf(tab);
    const template: MenuItemConstructorOptions[] = [
      { label: 'New tab to the right', click: () => this.createTab(undefined, { index: index + 1 }) },
      { type: 'separator' },
      { label: 'Reload', enabled: !tab.info.isNewTab, click: () => tab.view.webContents.reload() },
      { label: 'Duplicate', enabled: !!tab.info.url, click: () => this.duplicateTab(id) },
      {
        label: tab.info.pinned ? 'Unpin tab' : 'Pin tab',
        click: () => {
          tab.info.pinned = !tab.info.pinned;
          this.tabs.splice(this.tabs.indexOf(tab), 1);
          // pinned tabs live at the start; a freshly pinned tab joins the end of that group,
          // an unpinned tab becomes the first of the regular tabs
          const pinnedCount = this.tabs.filter((t) => t.info.pinned).length;
          this.tabs.splice(pinnedCount, 0, tab);
          this.scheduleEmit();
        },
      },
      {
        label: tab.info.muted ? 'Unmute site' : 'Mute site',
        enabled: tab.info.audible || tab.info.muted,
        click: () => {
          tab.view.webContents.audioMuted = !tab.info.muted;
          tab.info.muted = tab.view.webContents.audioMuted;
          this.scheduleEmit();
        },
      },
      { type: 'separator' },
      { label: 'Close tab', click: () => this.closeTab(id) },
      {
        label: 'Close other tabs',
        enabled: this.tabs.length > 1,
        click: () => this.tabs.filter((t) => t.id !== id && !t.info.pinned).forEach((t) => this.closeTab(t.id)),
      },
      {
        label: 'Close tabs to the right',
        enabled: index < this.tabs.length - 1,
        click: () => this.tabs.slice(index + 1).forEach((t) => this.closeTab(t.id)),
      },
    ];
    Menu.buildFromTemplate(template).popup({ window: this.win });
  }

  // ------------------------------------------------------------ layout

  setViewport(rect: ViewRect | null): void {
    this.viewport = rect
      ? {
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width: Math.max(0, Math.round(rect.width)),
          height: Math.max(0, Math.round(rect.height)),
        }
      : null;
    this.applyBounds();
  }

  setOverlay(overlay: boolean): void {
    this.overlay = overlay;
    this.applyBounds();
  }

  private applyBounds(): void {
    const active = this.activeTab();
    for (const t of this.tabs) if (t !== active) t.view.setVisible(false);
    if (!active) return;
    const show =
      !this.overlay &&
      !active.info.isNewTab &&
      !active.info.error &&
      (this.htmlFullscreen || this.viewport !== null);
    if (!show) {
      active.view.setVisible(false);
      return;
    }
    if (this.htmlFullscreen) {
      const [width, height] = this.win.getContentSize();
      active.view.setBounds({ x: 0, y: 0, width, height });
    } else if (this.viewport) {
      active.view.setBounds(this.viewport);
    }
    active.view.setVisible(true);
  }

  // ------------------------------------------------------------ navigation

  /** Handles everything typed in the address bar, including LTS commands. */
  navigate(input: string, opts: { newTab?: boolean } = {}): NavResult {
    const text = input.trim();
    if (!text) return { ok: false, kind: 'empty', message: '' };

    const lts = parseLts(text);
    if (lts.isLts) {
      if (!lts.code) {
        return { ok: false, kind: 'lts-help', message: 'LTS: type “lts <command>”, for example “lts ytb”.' };
      }
      const target = services().settings.data.lts[lts.code];
      if (!target) {
        return { ok: false, kind: 'lts-unknown', message: `Unknown LTS command “${lts.code}”.` };
      }
      // LTS always opens in a new tab; a blank "New tab" page it was typed from is tidied away.
      const blank = this.activeTab();
      this.createTab(target);
      if (blank?.info.isNewTab && !blank.info.url) this.closeTab(blank.id);
      return { ok: true, kind: 'lts' };
    }

    const resolved = resolveInput(text, services().settings.data.searchEngine);
    if (!resolved) return { ok: false, kind: 'empty', message: '' };

    const tab = this.activeTab();
    if (opts.newTab || !tab) {
      this.createTab(resolved.url);
    } else {
      tab.info.isNewTab = false;
      tab.info.url = resolved.url;
      tab.info.error = null;
      this.applyBounds();
      tab.view.webContents.loadURL(resolved.url).catch(() => undefined);
      tab.view.webContents.focus();
      this.scheduleEmit();
    }
    return { ok: true, kind: resolved.kind };
  }

  goBack(): void {
    const wc = this.activeTab()?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }
  goForward(): void {
    const wc = this.activeTab()?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }
  reload(hard = false): void {
    const tab = this.activeTab();
    if (!tab || tab.info.isNewTab) return;
    const wc = tab.view.webContents;
    if (tab.info.error) {
      this.retryError();
      return;
    }
    if (hard) wc.reloadIgnoringCache();
    else wc.reload();
  }
  retryError(): void {
    const tab = this.activeTab();
    if (!tab?.info.error) return;
    const url = tab.info.error.url || tab.info.url;
    tab.info.error = null;
    this.applyBounds();
    this.scheduleEmit();
    if (url) tab.view.webContents.loadURL(url).catch(() => undefined);
  }
  stop(): void {
    this.activeTab()?.view.webContents.stop();
  }
  goHome(): void {
    const home = services().settings.data.homepage;
    if (home) this.navigate(home);
    else {
      const tab = this.activeTab();
      if (tab) {
        tab.info.isNewTab = true;
        tab.info.url = '';
        tab.info.title = '';
        tab.info.error = null;
        this.applyBounds();
        this.scheduleEmit();
        this.command({ type: 'focus-address' });
      }
    }
  }

  // ------------------------------------------------------------ zoom / find

  zoom(direction: 1 | -1 | 0): void {
    const tab = this.activeTab();
    if (!tab || tab.info.isNewTab) return;
    const wc = tab.view.webContents;
    let next = 100;
    if (direction !== 0) {
      const current = Math.round(wc.getZoomFactor() * 100);
      const idx = direction > 0
        ? ZOOM_STEPS.findIndex((z) => z > current)
        : ZOOM_STEPS.length - 1 - [...ZOOM_STEPS].reverse().findIndex((z) => z < current);
      const safe = direction > 0 ? (idx < 0 ? ZOOM_STEPS.length - 1 : idx) : Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx));
      next = ZOOM_STEPS[safe];
    }
    wc.setZoomFactor(next / 100);
    tab.info.zoom = next;
    this.scheduleEmit();
  }

  findStart(text: string, opts: { findNext: boolean; forward: boolean; matchCase: boolean }): void {
    const wc = this.activeTab()?.view.webContents;
    if (!wc) return;
    if (!text) {
      wc.stopFindInPage('clearSelection');
      this.send('find:result', { activeMatchOrdinal: 0, matches: 0 });
      return;
    }
    wc.findInPage(text, { forward: opts.forward, findNext: opts.findNext, matchCase: opts.matchCase });
  }

  findStop(): void {
    this.activeTab()?.view.webContents.stopFindInPage('clearSelection');
  }

  // ------------------------------------------------------------ bookmarks

  toggleBookmark(): void {
    const tab = this.activeTab();
    if (!tab || !isWebUrl(tab.info.url)) return;
    const store = services().bookmarks;
    const idx = store.data.findIndex((b) => b.url === tab.info.url);
    if (idx >= 0) store.data.splice(idx, 1);
    else {
      store.data.unshift({
        id: randomUUID(),
        title: tab.info.title || tab.info.url,
        url: tab.info.url,
        favicon: tab.info.favicon,
        createdAt: Date.now(),
      });
    }
    store.save();
    broadcastBookmarks();
  }

  suggest(q: string): Suggestion[] {
    const query = q.trim();
    if (!query) return [];
    const lower = query.toLowerCase();
    const settings = services().settings.data;
    const out: Suggestion[] = [];

    if (/^lts(\s|$)/.test(lower)) {
      const rest = lower.slice(3).trim();
      for (const [code, url] of Object.entries(settings.lts)) {
        if (!rest || code.startsWith(rest) || url.toLowerCase().includes(rest)) {
          out.push({ kind: 'lts', title: `lts ${code}`, subtitle: `Open ${url.replace(/^https?:\/\//, '')} in a new tab`, value: `lts ${code}` });
        }
      }
      return out.slice(0, 8);
    }

    const engine = SEARCH_ENGINES[settings.searchEngine].name;
    out.push(
      looksLikeUrl(query)
        ? { kind: 'url', title: query, subtitle: 'Open address', value: query }
        : { kind: 'search', title: query, subtitle: `Search ${engine}`, value: query },
    );
    if ('lts'.startsWith(lower) && lower.length >= 1) {
      out.push({ kind: 'lts', title: 'lts', subtitle: 'Link & Tab Shortcuts — type “lts ytb”, “lts gh”…', value: 'lts' });
    }
    const seen = new Set<string>();
    for (const b of services().bookmarks.data) {
      if (out.length >= 5) break;
      if (b.title.toLowerCase().includes(lower) || b.url.toLowerCase().includes(lower)) {
        seen.add(b.url);
        out.push({ kind: 'bookmark', title: b.title, subtitle: b.url, value: b.url, favicon: b.favicon });
      }
    }
    for (const h of services().history.data) {
      if (out.length >= 8) break;
      if (seen.has(h.url)) continue;
      if (h.title.toLowerCase().includes(lower) || h.url.toLowerCase().includes(lower)) {
        seen.add(h.url);
        out.push({ kind: 'history', title: h.title || h.url, subtitle: h.url, value: h.url, favicon: h.favicon });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ permissions

  getStoredPermission(origin: string, permission: string): 'allow' | 'deny' | undefined {
    if (this.incognito) return this.incognitoDecisions.get(`${origin}|${permission}`);
    return services().permissions.data[origin]?.[permission];
  }

  private storePermission(origin: string, permission: string, value: 'allow' | 'deny'): void {
    if (this.incognito) {
      this.incognitoDecisions.set(`${origin}|${permission}`, value);
      return;
    }
    const store = services().permissions;
    (store.data[origin] ??= {})[permission] = value;
    store.save();
  }

  resolvePermission(origin: string, permission: string, details: unknown): Promise<boolean> {
    if (AUTO_ALLOW.has(permission)) return Promise.resolve(true);
    if (!PROMPTABLE.has(permission)) return Promise.resolve(false);
    const stored = this.getStoredPermission(origin, permission);
    if (stored) return Promise.resolve(stored === 'allow');
    if (services().settings.data.permissionDefault === 'deny') return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      this.pendingPermissions.set(id, (allow, remember) => {
        if (remember) this.storePermission(origin, permission, allow ? 'allow' : 'deny');
        resolve(allow);
      });
      const request: PermissionRequest = {
        id,
        origin,
        permission,
        label: describePermission(permission, details),
      };
      this.send('permission:request', request);
    });
  }

  respondPermission(id: string, allow: boolean, remember: boolean): void {
    const fn = this.pendingPermissions.get(id);
    if (!fn) return;
    this.pendingPermissions.delete(id);
    fn(allow, remember);
  }

  // ------------------------------------------------------------ shortcuts / commands

  private attachShortcuts(wc: WebContents): void {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') {
        // Never swallow Escape (pages use it); just let the UI close find/suggestions.
        this.command({ type: 'escape' });
        return;
      }
      const cmd = matchShortcut(input);
      if (!cmd) return;
      event.preventDefault();
      this.runCommand(cmd);
    });
  }

  runCommand(cmd: Command): void {
    switch (cmd) {
      case 'new-tab': this.createTab(); break;
      case 'reopen-tab': {
        const url = this.closedTabs.pop();
        if (url) this.createTab(url);
        break;
      }
      case 'close-tab': if (this.activeId !== null) this.closeTab(this.activeId); break;
      case 'new-window': openWindow(false); break;
      case 'new-incognito': openWindow(true); break;
      case 'focus-address': this.command({ type: 'focus-address' }); break;
      case 'find': this.command({ type: 'find' }); break;
      case 'reload': this.reload(false); break;
      case 'hard-reload': this.reload(true); break;
      case 'bookmark': this.toggleBookmark(); break;
      case 'panel-history': this.command({ type: 'panel', panel: 'history' }); break;
      case 'panel-downloads': this.command({ type: 'panel', panel: 'downloads' }); break;
      case 'toggle-sidebar': {
        const s = services().settings;
        s.data.showSidebar = !s.data.showSidebar;
        s.save();
        broadcastSettings();
        break;
      }
      case 'settings': this.command({ type: 'settings' }); break;
      case 'view-source': {
        const url = this.activeTab()?.info.url;
        if (url && isWebUrl(url)) this.createTab(`view-source:${url}`);
        break;
      }
      case 'print': this.activeTab()?.view.webContents.print(); break;
      case 'zoom-in': this.zoom(1); break;
      case 'zoom-out': this.zoom(-1); break;
      case 'zoom-reset': this.zoom(0); break;
      case 'next-tab': this.selectRelative(1); break;
      case 'prev-tab': this.selectRelative(-1); break;
      case 'devtools': {
        const wc = this.activeTab()?.view.webContents;
        if (wc) {
          if (wc.isDevToolsOpened()) wc.closeDevTools();
          else wc.openDevTools({ mode: 'detach' });
        }
        break;
      }
      case 'back': this.goBack(); break;
      case 'forward': this.goForward(); break;
      case 'home': this.goHome(); break;
      case 'fullscreen': this.win.setFullScreen(!this.win.isFullScreen()); break;
      default: {
        const n = Number(cmd.slice(4));
        if (n >= 1 && n <= 9) {
          const target = n === 9 ? this.tabs[this.tabs.length - 1] : this.tabs[n - 1];
          if (target) this.activate(target.id);
        }
      }
    }
  }

  // ------------------------------------------------------------ context menu

  private showPageContextMenu(tab: Tab, params: ContextMenuParams): void {
    const wc = tab.view.webContents;
    const settings = services().settings.data;
    const items: MenuItemConstructorOptions[] = [];
    const here = this.tabs.indexOf(tab) + 1;

    if (params.linkURL && isAllowedNavigation(params.linkURL)) {
      items.push(
        { label: 'Open link in new tab', click: () => this.createTab(params.linkURL, { activate: false, index: here }) },
        { label: 'Open link in new window', click: () => openWindow(this.incognito, params.linkURL) },
        { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      );
    }
    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: 'Open image in new tab', click: () => isAllowedNavigation(params.srcURL) && this.createTab(params.srcURL, { index: here }) },
        { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) },
        { label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' },
      );
    } else if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.srcURL) {
      items.push(
        { label: 'Save media as…', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copy media address', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' },
      );
    }

    if (params.isEditable) {
      if (params.misspelledWord) {
        for (const s of params.dictionarySuggestions.slice(0, 5)) {
          items.push({ label: s, click: () => wc.replaceMisspelling(s) });
        }
        if (params.dictionarySuggestions.length) items.push({ type: 'separator' });
      }
      items.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      );
    } else if (params.selectionText.trim()) {
      const q = params.selectionText.trim().slice(0, 200);
      const label = q.length > 30 ? `${q.slice(0, 30)}…` : q;
      items.push(
        { role: 'copy' },
        { label: `Search ${SEARCH_ENGINES[settings.searchEngine].name} for “${label}”`, click: () => this.createTab(searchUrl(q, settings.searchEngine), { index: here }) },
      );
    } else if (!params.linkURL && params.mediaType === 'none') {
      items.push(
        { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => this.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => this.goForward() },
        { label: 'Reload', click: () => this.reload() },
        { type: 'separator' },
        { label: 'Print…', click: () => wc.print() },
        { label: 'View page source', enabled: isWebUrl(tab.info.url), click: () => this.createTab(`view-source:${tab.info.url}`, { index: here }) },
        { role: 'selectAll' },
      );
    }
    items.push(
      { type: 'separator' },
      { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) },
    );
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  // ------------------------------------------------------------ lifecycle

  private dispose(): void {
    for (const d of this.disposers) d();
    for (const resolve of this.pendingPermissions.values()) resolve(false, false);
    this.pendingPermissions.clear();
    for (const t of this.tabs) {
      tabControllers.delete(t.view.webContents.id);
      if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
    }
    this.tabs = [];
    uiControllers.delete(this.win.webContents.id as number);
    allControllers.delete(this);
    if (this.incognito) {
      // Wipe everything the private session stored.
      void this.session.clearStorageData();
      void this.session.clearCache();
      void this.session.clearAuthCache();
    }
  }
}

// ---------------------------------------------------------------- module helpers

export function openWindow(incognito: boolean, url?: string): BrowserWindowController {
  return new BrowserWindowController(incognito, url);
}

export function broadcast<K extends keyof EventMap>(channel: K, payload: EventMap[K]): void {
  for (const c of allControllers) c.send(channel, payload);
}

export function broadcastSettings(): void {
  const settings = services().settings.data;
  nativeTheme.themeSource = settings.theme;
  broadcast('settings:update', settings);
}

export function broadcastBookmarks(): void {
  broadcast('bookmarks:update', services().bookmarks.data);
}

export function getNormalController(): BrowserWindowController | undefined {
  const focused = BrowserWindow.getFocusedWindow();
  for (const c of allControllers) if (!c.incognito && c.win === focused) return c;
  for (const c of allControllers) if (!c.incognito) return c;
  return undefined;
}
