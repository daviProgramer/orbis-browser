import {
  Bookmark as BookmarkIcon,
  Clock,
  Download,
  FolderOpen,
  Globe,
  Pause,
  Play,
  Settings as SettingsIcon,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Bookmark, DownloadInfo, HistoryEntry, SidebarPanel } from '../../shared/types';
import { formatBytes, hostOf } from '../lib/theme';
import { Logo } from './Logo';

interface RailProps {
  panel: SidebarPanel | null;
  settingsOpen: boolean;
  downloadsActive: number;
  onPanel: (p: SidebarPanel) => void;
  onSettings: () => void;
}

export function Rail({ panel, settingsOpen, downloadsActive, onPanel, onSettings }: RailProps) {
  const items: { id: SidebarPanel; label: string; icon: React.ReactNode }[] = [
    { id: 'bookmarks', label: 'Bookmarks', icon: <BookmarkIcon size={18} /> },
    { id: 'history', label: 'History', icon: <Clock size={18} /> },
    { id: 'downloads', label: 'Downloads', icon: <Download size={18} /> },
    { id: 'lts', label: 'LTS shortcuts', icon: <Zap size={18} /> },
  ];
  return (
    <nav className="rail" aria-label="Sidebar">
      <div className="rail-logo"><Logo size={26} /></div>
      {items.map((it) => (
        <button
          key={it.id}
          className={`rail-btn ${panel === it.id ? 'active' : ''}`}
          title={it.label}
          aria-label={it.label}
          onClick={() => onPanel(it.id)}
        >
          {it.icon}
          {it.id === 'downloads' && downloadsActive > 0 && <span className="dot" />}
        </button>
      ))}
      <div className="rail-spacer" />
      <button className={`rail-btn ${settingsOpen ? 'active' : ''}`} title="Settings" aria-label="Settings" onClick={onSettings}>
        <SettingsIcon size={18} />
      </button>
    </nav>
  );
}

interface PanelProps {
  panel: SidebarPanel;
  bookmarks: Bookmark[];
  downloads: DownloadInfo[];
  historyTick: number;
  lts: Record<string, string>;
  incognito: boolean;
  onGo: (input: string, newTab: boolean) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

const TITLES: Record<SidebarPanel, string> = {
  bookmarks: 'Bookmarks',
  history: 'History',
  downloads: 'Downloads',
  lts: 'LTS — Link & Tab Shortcuts',
};

export function SidePanel(props: PanelProps) {
  return (
    <aside className="panel">
      <header className="panel-head">
        <h2>{TITLES[props.panel]}</h2>
        <button className="icon-btn" aria-label="Close panel" onClick={props.onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="panel-body">
        {props.panel === 'bookmarks' && <BookmarksList {...props} />}
        {props.panel === 'history' && <HistoryList {...props} />}
        {props.panel === 'downloads' && <DownloadsList downloads={props.downloads} />}
        {props.panel === 'lts' && <LtsList lts={props.lts} onGo={props.onGo} onOpenSettings={props.onOpenSettings} />}
      </div>
    </aside>
  );
}

function Favicon({ src }: { src: string | null }) {
  return src ? <img src={src} alt="" width={16} height={16} /> : <Globe size={15} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

function BookmarksList({ bookmarks, onGo }: PanelProps) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? bookmarks.filter((b) => b.title.toLowerCase().includes(s) || b.url.toLowerCase().includes(s)) : bookmarks;
  }, [bookmarks, q]);
  return (
    <>
      <input className="panel-search" placeholder="Search bookmarks" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <Empty>{bookmarks.length ? 'No matches.' : 'Press Ctrl+D or click the star in the address bar to save a page.'}</Empty>}
      <ul className="items">
        {list.map((b) => (
          <li key={b.id}>
            <button className="item" onClick={() => onGo(b.url, false)} title={b.url}>
              <Favicon src={b.favicon} />
              <span className="item-text">
                <span className="item-title">{b.title}</span>
                <span className="item-sub">{hostOf(b.url)}</span>
              </span>
            </button>
            <button className="icon-btn item-action" aria-label="Remove bookmark" onClick={() => window.orbis.bookmarks.remove(b.id)}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function HistoryList({ historyTick, incognito, onGo }: PanelProps) {
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    window.orbis.history.query(q, 300).then((list) => alive && setEntries(list));
    return () => {
      alive = false;
    };
  }, [q, historyTick]);

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const e of entries) {
      const label = dayLabel(e.visitedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <>
      {incognito && <Empty>Incognito windows don’t record history. Showing your normal browsing history.</Empty>}
      <div className="panel-tools">
        <input className="panel-search" placeholder="Search history" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" onClick={() => window.orbis.history.clear()} disabled={entries.length === 0}>Clear</button>
      </div>
      {groups.length === 0 && <Empty>{q ? 'No matches.' : 'Nothing here yet.'}</Empty>}
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="group-label">{g.label}</h3>
          <ul className="items">
            {g.items.map((h) => (
              <li key={h.id}>
                <button className="item" onClick={() => onGo(h.url, false)} title={h.url}>
                  <Favicon src={h.favicon} />
                  <span className="item-text">
                    <span className="item-title">{h.title || h.url}</span>
                    <span className="item-sub">
                      {new Date(h.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {hostOf(h.url)}
                    </span>
                  </span>
                </button>
                <button className="icon-btn item-action" aria-label="Remove from history" onClick={() => window.orbis.history.remove(h.id)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function DownloadsList({ downloads }: { downloads: DownloadInfo[] }) {
  return (
    <>
      <div className="panel-tools">
        <span className="muted">{downloads.length} item{downloads.length === 1 ? '' : 's'}</span>
        <button className="btn small" onClick={() => window.orbis.downloads.clear()} disabled={downloads.length === 0}>Clear all</button>
      </div>
      {downloads.length === 0 && <Empty>Files you download will appear here.</Empty>}
      <ul className="items">
        {downloads.map((d) => {
          const pct = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : 0;
          return (
            <li key={d.id} className="download">
              <div className="dl-row">
                <span className="item-text">
                  <span className="item-title">{d.filename}</span>
                  <span className="item-sub">
                    {d.state === 'progressing'
                      ? `${d.paused ? 'Paused · ' : ''}${formatBytes(d.receivedBytes)}${d.totalBytes ? ` of ${formatBytes(d.totalBytes)}` : ''}`
                      : d.state === 'completed'
                        ? `${formatBytes(d.totalBytes || d.receivedBytes)} · ${hostOf(d.url)}`
                        : d.state === 'cancelled' ? 'Cancelled' : 'Failed'}
                  </span>
                </span>
                <span className="dl-actions">
                  {d.state === 'progressing' && (
                    <>
                      <button className="icon-btn" aria-label={d.paused ? 'Resume' : 'Pause'} onClick={() => (d.paused ? window.orbis.downloads.resume(d.id) : window.orbis.downloads.pause(d.id))}>
                        {d.paused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button className="icon-btn" aria-label="Cancel" onClick={() => window.orbis.downloads.cancel(d.id)}>
                        <X size={14} />
                      </button>
                    </>
                  )}
                  {d.state === 'completed' && (
                    <>
                      <button className="btn small" onClick={() => window.orbis.downloads.open(d.id)}>Open</button>
                      <button className="icon-btn" aria-label="Show in folder" title="Show in folder" onClick={() => window.orbis.downloads.show(d.id)}>
                        <FolderOpen size={14} />
                      </button>
                    </>
                  )}
                  {d.state !== 'progressing' && (
                    <button className="icon-btn" aria-label="Remove from list" onClick={() => window.orbis.downloads.remove(d.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              </div>
              {d.state === 'progressing' && (
                <div className="progress"><div style={{ width: `${d.totalBytes ? pct : 40}%` }} className={d.totalBytes ? '' : 'indeterminate'} /></div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function LtsList({ lts, onGo, onOpenSettings }: { lts: Record<string, string>; onGo: PanelProps['onGo']; onOpenSettings: () => void }) {
  const entries = Object.entries(lts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <p className="hint">
        Type <code>lts &lt;command&gt;</code> in the address bar to open a site in a new tab. Click a shortcut to try it.
      </p>
      <ul className="items">
        {entries.map(([code, url]) => (
          <li key={code}>
            <button className="item" onClick={() => onGo(`lts ${code}`, true)} title={url}>
              <span className="lts-code">{code}</span>
              <span className="item-text">
                <span className="item-title">lts {code}</span>
                <span className="item-sub">{hostOf(url)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {entries.length === 0 && <Empty>No shortcuts yet.</Empty>}
      <button className="btn" onClick={onOpenSettings}>Edit shortcuts in Settings</button>
    </>
  );
}
