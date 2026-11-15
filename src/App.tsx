import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type Bookmark,
  type BrowserState,
  type DownloadInfo,
  type FindResult,
  type PermissionRequest,
  type Settings,
  type SidebarPanel,
} from '../shared/types';
import type { AddressBarHandle } from './components/AddressBar';
import { ErrorPage } from './components/ErrorPage';
import { FindBar } from './components/FindBar';
import { NewTab } from './components/NewTab';
import { PermissionBar } from './components/PermissionBar';
import { SettingsPage } from './components/SettingsPage';
import { Rail, SidePanel } from './components/Sidebar';
import { TabStrip } from './components/TabStrip';
import { Toasts, type Toast } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { WindowControls } from './components/WindowControls';
import { applySettings } from './lib/theme';

const EMPTY_STATE: BrowserState = { tabs: [], activeId: null, maximized: false, fullscreen: false };

export default function App() {
  const orbis = window.orbis;
  const isMac = orbis.platform === 'darwin';

  const [ready, setReady] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [version, setVersion] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<BrowserState>(EMPTY_STATE);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const [panel, setPanel] = useState<SidebarPanel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const [findResult, setFindResult] = useState<FindResult>({ activeMatchOrdinal: 0, matches: 0 });
  const [permQueue, setPermQueue] = useState<PermissionRequest[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addressRef = useRef<AddressBarHandle>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  // ---- initial data + event subscriptions
  useEffect(() => {
    let alive = true;
    orbis.init().then((init) => {
      if (!alive) return;
      setIncognito(init.incognito);
      setVersion(init.version);
      setSettings(init.settings);
      setState(init.state);
      setBookmarks(init.bookmarks);
      setDownloads(init.downloads);
      applySettings(init.settings, init.incognito);
      setReady(true);
    });
    const offs = [
      orbis.on('state:update', setState),
      orbis.on('settings:update', setSettings),
      orbis.on('bookmarks:update', setBookmarks),
      orbis.on('downloads:update', setDownloads),
      orbis.on('history:changed', setHistoryTick),
      orbis.on('find:result', setFindResult),
      orbis.on('permission:request', (req) => setPermQueue((q) => [...q, req])),
      orbis.on('toast', toast),
      orbis.on('ui:command', (cmd) => {
        switch (cmd.type) {
          case 'focus-address':
            setSettingsOpen(false);
            requestAnimationFrame(() => addressRef.current?.focus());
            break;
          case 'find':
            setSettingsOpen(false);
            setFindOpen(true);
            setFindFocus((n) => n + 1);
            break;
          case 'panel':
            setPanel((p) => (p === cmd.panel ? null : cmd.panel));
            break;
          case 'settings':
            setSettingsOpen((o) => !o);
            break;
          case 'escape':
            setFindOpen((open) => {
              if (open) orbis.find.stop();
              return false;
            });
            break;
        }
      }),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [orbis, toast]);

  // ---- apply appearance immediately
  useEffect(() => {
    applySettings(settings, incognito);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applySettings(settings, incognito);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings, incognito]);

  const active = useMemo(() => state.tabs.find((t) => t.id === state.activeId), [state]);

  // Switching tabs leaves the settings page and closes find.
  const lastActive = useRef<number | null>(null);
  useEffect(() => {
    if (state.activeId !== lastActive.current) {
      lastActive.current = state.activeId;
      setSettingsOpen(false);
      setFindOpen(false);
      setFindResult({ activeMatchOrdinal: 0, matches: 0 });
    }
  }, [state.activeId]);

  // A new tab starts with the address bar focused.
  useEffect(() => {
    if (ready && active?.isNewTab && !settingsOpen) addressRef.current?.focus();
  }, [ready, active?.id, active?.isNewTab, settingsOpen]);

  // ---- tell the main process where the web content goes
  const overlay = settingsOpen || suggestOpen;
  useEffect(() => {
    orbis.layout.setOverlay(overlay);
  }, [orbis, overlay]);

  const sendViewport = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    orbis.layout.setViewport({ x: r.x, y: r.y, width: r.width, height: r.height });
  }, [orbis]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    sendViewport();
    const ro = new ResizeObserver(sendViewport);
    ro.observe(el);
    window.addEventListener('resize', sendViewport);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sendViewport);
    };
  }, [sendViewport, ready]);

  useLayoutEffect(() => {
    sendViewport();
  }, [sendViewport, panel, findOpen, permQueue.length, settings.showSidebar, settings.density, settings.fontSize, settings.tabStyle]);

  // ---- helpers
  const go = useCallback(
    async (input: string, newTab: boolean) => {
      const r = await orbis.nav.go(input, { newTab });
      if (r.ok) {
        setSettingsOpen(false);
      } else if (r.kind !== 'empty') {
        toast(r.message);
        setSettingsOpen(false);
        setPanel('lts');
      }
    },
    [orbis, toast],
  );

  const changeSettings = useCallback(
    (partial: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...partial })); // optimistic: appearance updates instantly
      orbis.settings.set(partial).then(setSettings);
    },
    [orbis],
  );

  const bookmarked = !!active && bookmarks.some((b) => b.url === active.url);
  const downloadsActive = downloads.filter((d) => d.state === 'progressing').length;
  const togglePanel = (p: SidebarPanel) => setPanel((cur) => (cur === p ? null : p));

  // Escape closes settings / find when focus is inside the UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const respondPermission = (allow: boolean, remember: boolean) => {
    const [first] = permQueue;
    if (!first) return;
    orbis.permissions.respond(first.id, allow, remember);
    setPermQueue((q) => q.slice(1));
  };

  if (!ready) return <div className="app booting" />;

  const showNewTab = !settingsOpen && !!active?.isNewTab && !active.error;
  const showError = !settingsOpen && !!active?.error;
  const showRail = settings.showSidebar && !state.fullscreen;

  return (
    <div className={`app ${isMac ? 'mac' : ''} ${state.fullscreen ? 'fullscreen' : ''}`}>
      <header className="chrome">
        <div className="titlebar">
          {isMac && <div className="mac-inset" />}
          <TabStrip tabs={state.tabs} activeId={state.activeId} settingsOpen={settingsOpen} />
          <div className="drag-fill" />
          {!isMac && <WindowControls maximized={state.maximized} />}
        </div>
        <Toolbar
          ref={addressRef}
          tab={active}
          incognito={incognito}
          bookmarked={bookmarked}
          downloads={downloads}
          onGo={go}
          onSuggestionsOpen={setSuggestOpen}
          onOpenDownloads={() => setPanel('downloads')}
          onOpenFind={() => {
            setFindOpen(true);
            setFindFocus((n) => n + 1);
          }}
          onOpenSettings={() => setSettingsOpen((o) => !o)}
        />
        {findOpen && !settingsOpen && (
          <FindBar
            result={findResult}
            focusToken={findFocus}
            onClose={() => {
              orbis.find.stop();
              setFindOpen(false);
            }}
          />
        )}
        {permQueue[0] && (
          <PermissionBar request={permQueue[0]} incognito={incognito} queued={permQueue.length - 1} onRespond={respondPermission} />
        )}
      </header>

      <div className="body">
        {showRail && (
          <Rail
            panel={panel}
            settingsOpen={settingsOpen}
            downloadsActive={downloadsActive}
            onPanel={togglePanel}
            onSettings={() => setSettingsOpen((o) => !o)}
          />
        )}
        {panel && !state.fullscreen && (
          <SidePanel
            panel={panel}
            bookmarks={bookmarks}
            downloads={downloads}
            historyTick={historyTick}
            lts={settings.lts}
            incognito={incognito}
            onGo={go}
            onClose={() => setPanel(null)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        <main className="viewport" ref={viewportRef}>
          {settingsOpen && (
            <SettingsPage
              settings={settings}
              version={version}
              platform={orbis.platform}
              onChange={changeSettings}
              onClose={() => setSettingsOpen(false)}
              onToast={toast}
            />
          )}
          {showNewTab && <NewTab settings={settings} bookmarks={bookmarks} incognito={incognito} onGo={go} />}
          {showError && active && <ErrorPage tab={active} />}
        </main>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
