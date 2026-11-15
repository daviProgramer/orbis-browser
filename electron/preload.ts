import { contextBridge, ipcRenderer } from 'electron';
import type { EventMap, OrbisApi } from '../shared/types';

// NOTE: the sandboxed preload may only require 'electron', so this file must not import runtime values
// from other modules (type-only imports are erased at compile time).
const EVENTS = new Set<string>([
  'state:update',
  'settings:update',
  'bookmarks:update',
  'downloads:update',
  'history:changed',
  'find:result',
  'permission:request',
  'ui:command',
  'toast',
]);

const call = <T = void>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: OrbisApi = {
  platform: process.platform,
  init: () => call('app:init'),
  on: <K extends keyof EventMap>(channel: K, cb: (payload: EventMap[K]) => void) => {
    if (!EVENTS.has(channel)) throw new Error(`Unknown channel: ${String(channel)}`);
    const handler = (_e: unknown, payload: EventMap[K]) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  tabs: {
    create: (url) => call('tabs:create', url),
    close: (id) => call('tabs:close', id),
    activate: (id) => call('tabs:activate', id),
    move: (id, index) => call('tabs:move', id, index),
    contextMenu: (id) => call('tabs:contextMenu', id),
  },
  nav: {
    go: (input, opts) => call('nav:go', input, opts),
    back: () => call('nav:back'),
    forward: () => call('nav:forward'),
    reload: () => call('nav:reload'),
    stop: () => call('nav:stop'),
    home: () => call('nav:home'),
  },
  zoom: {
    in: () => call('zoom:in'),
    out: () => call('zoom:out'),
    reset: () => call('zoom:reset'),
  },
  find: {
    start: (text, opts) => call('find:start', text, opts),
    stop: () => call('find:stop'),
  },
  layout: {
    setViewport: (rect) => call('layout:viewport', rect),
    setOverlay: (overlay) => call('layout:overlay', overlay),
  },
  win: {
    minimize: () => call('win:minimize'),
    toggleMaximize: () => call('win:toggleMaximize'),
    close: () => call('win:close'),
    newWindow: (incognito) => call('win:new', incognito),
  },
  settings: {
    set: (partial) => call('settings:set', partial),
    reset: () => call('settings:reset'),
    pickBackground: () => call('settings:pickBackground'),
  },
  bookmarks: {
    toggle: () => call('bookmarks:toggle'),
    remove: (id) => call('bookmarks:remove', id),
  },
  history: {
    query: (q, limit) => call('history:query', q, limit),
    remove: (id) => call('history:remove', id),
    clear: () => call('history:clear'),
  },
  suggest: (q) => call('suggest:query', q),
  downloads: {
    open: (id) => call('downloads:open', id),
    show: (id) => call('downloads:show', id),
    pause: (id) => call('downloads:pause', id),
    resume: (id) => call('downloads:resume', id),
    cancel: (id) => call('downloads:cancel', id),
    remove: (id) => call('downloads:remove', id),
    clear: () => call('downloads:clear'),
  },
  permissions: {
    respond: (id, allow, remember) => call('permissions:respond', id, allow, remember),
    list: () => call('permissions:list'),
    revoke: (origin, permission) => call('permissions:revoke', origin, permission),
    clearAll: () => call('permissions:clearAll'),
  },
  data: {
    clear: (opts) => call('data:clear', opts),
  },
};

contextBridge.exposeInMainWorld('orbis', api);
