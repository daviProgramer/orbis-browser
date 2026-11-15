import { Globe, Search, Zap } from 'lucide-react';
import { useState } from 'react';
import { SEARCH_ENGINES, type Bookmark, type Settings } from '../../shared/types';
import { hostOf } from '../lib/theme';
import { Logo } from './Logo';

interface Props {
  settings: Settings;
  bookmarks: Bookmark[];
  incognito: boolean;
  onGo: (input: string, newTab: boolean) => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function NewTab({ settings, bookmarks, incognito, onGo }: Props) {
  const [q, setQ] = useState('');
  const lts = Object.entries(settings.lts).sort(([a], [b]) => a.localeCompare(b)).slice(0, 8);
  const now = new Date();

  return (
    <div className="page newtab">
      <div className="orbit-wrap">
        <div className="orbit-ring" aria-hidden="true" />
        <Logo size={64} />
      </div>
      <h1>{incognito ? 'You’re incognito' : greeting()}</h1>
      <p className="subtitle">
        {incognito
          ? 'Orbis won’t save your history, cookies or site data from this window.'
          : now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      <form
        className="hero-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onGo(q, false);
        }}
      >
        <Search size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${SEARCH_ENGINES[settings.searchEngine].name} or type a URL`}
          aria-label="Search"
        />
      </form>

      {lts.length > 0 && (
        <section className="tiles-section">
          <h2><Zap size={14} /> LTS shortcuts</h2>
          <div className="tiles">
            {lts.map(([code, url]) => (
              <button key={code} className="tile" onClick={() => onGo(`lts ${code}`, true)} title={`lts ${code}`}>
                <span className="tile-code">{code}</span>
                <span className="tile-host">{hostOf(url)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {bookmarks.length > 0 && (
        <section className="tiles-section">
          <h2>Bookmarks</h2>
          <div className="tiles">
            {bookmarks.slice(0, 8).map((b) => (
              <button key={b.id} className="tile" onClick={() => onGo(b.url, false)} title={b.url}>
                <span className="tile-fav">{b.favicon ? <img src={b.favicon} alt="" width={20} height={20} /> : <Globe size={18} />}</span>
                <span className="tile-host">{b.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
