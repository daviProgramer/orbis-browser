// Types and constants shared by the Electron main process, the preload script and the React UI.
// This file must stay free of Node/DOM-specific imports.

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type TabStyle = 'soft' | 'pill' | 'underline' | 'compact';
export type BackgroundKind = 'aurora' | 'dusk' | 'mist' | 'solid' | 'image';
export type SearchEngineId = 'google' | 'duckduckgo' | 'bing' | 'brave';
export type SidebarPanel = 'bookmarks' | 'history' | 'downloads' | 'lts';
export type PermissionDefault = 'ask' | 'deny';

export interface Settings {
  theme: ThemeMode;
  accent: string;
  backgroundKind: BackgroundKind;
  backgroundColor: string;
  backgroundImage: string; // data: URL, '' when unused
  tabStyle: TabStyle;
  showSidebar: boolean;
  animations: boolean;
  fontSize: number; // px
  density: Density;
  searchEngine: SearchEngineId;
  homepage: string; // '' = Orbis new tab page
  permissionDefault: PermissionDefault;
  lts: Record<string, string>; // command -> URL
}

export const DEFAULT_LTS: Record<string, string> = {
  ytb: 'https://www.youtube.com',
  gpt: 'https://chatgpt.com',
  gh: 'https://github.com',
  tw: 'https://www.twitch.tv',
  gg: 'https://www.google.com',
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: '#7c5cff',
  backgroundKind: 'aurora',
  backgroundColor: '#1b1d2a',
  backgroundImage: '',
  tabStyle: 'soft',
  showSidebar: true,
  animations: true,
  fontSize: 14,
  density: 'comfortable',
  searchEngine: 'google',
  homepage: '',
  permissionDefault: 'ask',
  lts: { ...DEFAULT_LTS },
};

export const ACCENT_PRESETS = [
  { id: 'orbit', name: 'Orbit', color: '#7c5cff' },
  { id: 'nova', name: 'Nova', color: '#14b8a6' },
  { id: 'lagoon', name: 'Lagoon', color: '#2f9bff' },
  { id: 'solar', name: 'Solar', color: '#f59e0b' },
  { id: 'ember', name: 'Ember', color: '#f4525e' },
  { id: 'moss', name: 'Moss', color: '#7bc043' },
] as const;

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
};

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isNewTab: boolean;
  pinned: boolean;
  muted: boolean;
  audible: boolean;
  zoom: number; // percent
  error: { code: number; description: string; url: string } | null;
}

export interface BrowserState {
  tabs: TabInfo[];
  activeId: number | null;
  maximized: boolean;
  fullscreen: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
}

export interface DownloadInfo {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  paused: boolean;
  startTime: number;
}

export interface PermissionRequest {
  id: string;
  origin: string;
  permission: string;
  label: string;
}

export type SitePermissions = Record<string, Record<string, 'allow' | 'deny'>>;

export interface Suggestion {
  kind: 'history' | 'bookmark' | 'lts' | 'search' | 'url';
  title: string;
  subtitle: string;
  value: string;
  favicon?: string | null;
}

export type NavResult =
  | { ok: true; kind: 'url' | 'search' | 'lts' }
  | { ok: false; kind: 'lts-help' | 'lts-unknown' | 'empty'; message: string };

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
}

export type UiCommand =
  | { type: 'focus-address' }
  | { type: 'find' }
  | { type: 'panel'; panel: SidebarPanel }
  | { type: 'settings' }
  | { type: 'escape' };

export interface InitData {
  platform: string;
  incognito: boolean;
  version: string;
  settings: Settings;
  bookmarks: Bookmark[];
  downloads: DownloadInfo[];
  state: BrowserState;
}

export interface EventMap {
  'state:update': BrowserState;
  'settings:update': Settings;
  'bookmarks:update': Bookmark[];
  'downloads:update': DownloadInfo[];
  'history:changed': number;
  'find:result': FindResult;
  'permission:request': PermissionRequest;
  'ui:command': UiCommand;
  toast: string;
}

export const EVENT_CHANNELS: (keyof EventMap)[] = [
  'state:update',
  'settings:update',
  'bookmarks:update',
  'downloads:update',
  'history:changed',
  'find:result',
  'permission:request',
  'ui:command',
  'toast',
];

export type Unsubscribe = () => void;

export interface OrbisApi {
  platform: string;
  init(): Promise<InitData>;
  on<K extends keyof EventMap>(channel: K, cb: (payload: EventMap[K]) => void): Unsubscribe;
  tabs: {
    create(url?: string): Promise<void>;
    close(id: number): Promise<void>;
    activate(id: number): Promise<void>;
    move(id: number, index: number): Promise<void>;
    contextMenu(id: number): Promise<void>;
  };
  nav: {
    go(input: string, opts?: { newTab?: boolean }): Promise<NavResult>;
    back(): Promise<void>;
    forward(): Promise<void>;
    reload(): Promise<void>;
    stop(): Promise<void>;
    home(): Promise<void>;
  };
  zoom: { in(): Promise<void>; out(): Promise<void>; reset(): Promise<void> };
  find: {
    start(text: string, opts: { findNext: boolean; forward: boolean; matchCase: boolean }): Promise<void>;
    stop(): Promise<void>;
  };
  layout: { setViewport(rect: ViewRect | null): Promise<void>; setOverlay(overlay: boolean): Promise<void> };
  win: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    newWindow(incognito: boolean): Promise<void>;
  };
  settings: {
    set(partial: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
    pickBackground(): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
  };
  bookmarks: { toggle(): Promise<void>; remove(id: string): Promise<void> };
  history: {
    query(q: string, limit?: number): Promise<HistoryEntry[]>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  suggest(q: string): Promise<Suggestion[]>;
  downloads: {
    open(id: string): Promise<void>;
    show(id: string): Promise<void>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  permissions: {
    respond(id: string, allow: boolean, remember: boolean): Promise<void>;
    list(): Promise<SitePermissions>;
    revoke(origin: string, permission: string): Promise<SitePermissions>;
    clearAll(): Promise<SitePermissions>;
  };
  data: { clear(opts: { history: boolean; cache: boolean; cookies: boolean }): Promise<void> };
}
