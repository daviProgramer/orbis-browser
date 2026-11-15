import { Brush, Globe, Info, Keyboard, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ACCENT_PRESETS,
  DEFAULT_LTS,
  SEARCH_ENGINES,
  type SearchEngineId,
  type Settings,
  type SitePermissions,
} from '../../shared/types';
import { Logo } from './Logo';

type Section = 'appearance' | 'browsing' | 'lts' | 'privacy' | 'shortcuts' | 'about';

interface Props {
  settings: Settings;
  version: string;
  platform: string;
  onChange: (partial: Partial<Settings>) => void;
  onClose: () => void;
  onToast: (text: string) => void;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['New tab', 'Ctrl+T'],
  ['Close tab', 'Ctrl+W'],
  ['Reopen closed tab', 'Ctrl+Shift+T'],
  ['New window', 'Ctrl+N'],
  ['New incognito window', 'Ctrl+Shift+N'],
  ['Next / previous tab', 'Ctrl+Tab / Ctrl+Shift+Tab'],
  ['Jump to tab 1–8 / last', 'Ctrl+1…8 / Ctrl+9'],
  ['Focus address bar', 'Ctrl+L'],
  ['Open in new tab from address bar', 'Alt+Enter'],
  ['Back / forward', 'Alt+← / Alt+→'],
  ['Reload / hard reload', 'Ctrl+R / Ctrl+Shift+R'],
  ['Find in page', 'Ctrl+F'],
  ['Zoom in / out / reset', 'Ctrl+= / Ctrl+- / Ctrl+0'],
  ['Bookmark page', 'Ctrl+D'],
  ['History / downloads', 'Ctrl+H / Ctrl+J'],
  ['Toggle sidebar', 'Ctrl+B'],
  ['Settings', 'Ctrl+,'],
  ['View source / developer tools', 'Ctrl+U / F12'],
  ['Print / full screen', 'Ctrl+P / F11'],
];

export function SettingsPage({ settings, version, platform, onChange, onClose, onToast }: Props) {
  const [section, setSection] = useState<Section>('appearance');
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

  const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: 'Appearance', icon: <Brush size={16} /> },
    { id: 'browsing', label: 'Browsing', icon: <Globe size={16} /> },
    { id: 'lts', label: 'LTS shortcuts', icon: <Zap size={16} /> },
    { id: 'privacy', label: 'Privacy & permissions', icon: <ShieldCheck size={16} /> },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={16} /> },
    { id: 'about', label: 'About Orbis', icon: <Info size={16} /> },
  ];

  return (
    <div className="page settings">
      <aside className="settings-nav">
        <h1>Settings</h1>
        {nav.map((n) => (
          <button key={n.id} className={section === n.id ? 'active' : ''} onClick={() => setSection(n.id)}>
            {n.icon} {n.label}
          </button>
        ))}
      </aside>
      <main className="settings-main">
        <button className="icon-btn settings-close" aria-label="Close settings" onClick={onClose}>
          <X size={18} />
        </button>
        {section === 'appearance' && <Appearance settings={settings} onChange={onChange} onToast={onToast} />}
        {section === 'browsing' && <Browsing settings={settings} onChange={onChange} />}
        {section === 'lts' && <LtsEditor settings={settings} onChange={onChange} />}
        {section === 'privacy' && <Privacy settings={settings} onChange={onChange} onToast={onToast} />}
        {section === 'shortcuts' && (
          <>
            <h2>Keyboard shortcuts</h2>
            <table className="shortcuts">
              <tbody>
                {SHORTCUTS.map(([action, keys]) => (
                  <tr key={action}>
                    <td>{action}</td>
                    <td><kbd>{platform === 'darwin' ? keys.replace(/Ctrl/g, mod) : keys}</kbd></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {section === 'about' && (
          <>
            <h2>About Orbis</h2>
            <div className="about">
              <Logo size={56} />
              <div>
                <strong>Orbis Browser</strong>
                <span>Version {version} · open source (MIT)</span>
                <span>Built with Electron, Chromium, React and TypeScript.</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Appearance({ settings, onChange, onToast }: { settings: Settings; onChange: Props['onChange']; onToast: Props['onToast'] }) {
  return (
    <>
      <h2>Appearance</h2>
      <Row title="Theme">
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={(theme) => onChange({ theme })}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        />
      </Row>
      <Row title="Accent colour">
        <div className="swatches">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.id}
              className={`swatch ${settings.accent.toLowerCase() === a.color ? 'on' : ''}`}
              style={{ background: a.color }}
              title={a.name}
              aria-label={a.name}
              onClick={() => onChange({ accent: a.color })}
            />
          ))}
          <label className="swatch custom" title="Custom colour">
            <input type="color" value={settings.accent} onChange={(e) => onChange({ accent: e.target.value })} aria-label="Custom accent colour" />
          </label>
        </div>
      </Row>
      <Row title="Background" hint="Used behind the toolbar and on the new tab page">
        <div className="bg-options">
          <Segmented
            label="Background"
            value={settings.backgroundKind}
            onChange={(backgroundKind) => onChange({ backgroundKind })}
            options={[
              { value: 'aurora', label: 'Aurora' },
              { value: 'dusk', label: 'Dusk' },
              { value: 'mist', label: 'Mist' },
              { value: 'solid', label: 'Solid' },
              { value: 'image', label: 'Image' },
            ]}
          />
          {settings.backgroundKind === 'solid' && (
            <label className="inline-field">
              Colour
              <input type="color" value={settings.backgroundColor} onChange={(e) => onChange({ backgroundColor: e.target.value })} />
            </label>
          )}
          {settings.backgroundKind === 'image' && (
            <div className="inline-field">
              <button
                className="btn"
                onClick={async () => {
                  const r = await window.orbis.settings.pickBackground();
                  if (r.ok && r.dataUrl) onChange({ backgroundImage: r.dataUrl, backgroundKind: 'image' });
                  else if (r.error) onToast(r.error);
                }}
              >
                Choose image…
              </button>
              {settings.backgroundImage && (
                <button className="btn" onClick={() => onChange({ backgroundImage: '', backgroundKind: 'aurora' })}>Remove</button>
              )}
            </div>
          )}
        </div>
      </Row>
      <Row title="Tab appearance">
        <Segmented
          label="Tab appearance"
          value={settings.tabStyle}
          onChange={(tabStyle) => onChange({ tabStyle })}
          options={[
            { value: 'soft', label: 'Soft' },
            { value: 'pill', label: 'Pill' },
            { value: 'underline', label: 'Underline' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </Row>
      <Row title="Interface density">
        <Segmented
          label="Interface density"
          value={settings.density}
          onChange={(density) => onChange({ density })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'spacious', label: 'Spacious' },
          ]}
        />
      </Row>
      <Row title="Font size" hint={`${settings.fontSize}px`}>
        <input type="range" min={12} max={20} step={1} value={settings.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} aria-label="Font size" />
      </Row>
      <Row title="Sidebar" hint="Ctrl+B toggles it anywhere">
        <Switch label="Show sidebar" checked={settings.showSidebar} onChange={(showSidebar) => onChange({ showSidebar })} />
      </Row>
      <Row title="Animations" hint="Turn off for a snappier, calmer interface">
        <Switch label="Animations" checked={settings.animations} onChange={(animations) => onChange({ animations })} />
      </Row>
      <div className="setting-footer">
        <button className="btn" onClick={async () => { await window.orbis.settings.reset(); onToast('Settings reset to defaults'); }}>
          Reset all settings
        </button>
      </div>
    </>
  );
}

function Browsing({ settings, onChange }: { settings: Settings; onChange: Props['onChange'] }) {
  const [home, setHome] = useState(settings.homepage);
  useEffect(() => setHome(settings.homepage), [settings.homepage]);
  return (
    <>
      <h2>Browsing</h2>
      <Row title="Search engine" hint="Used for anything typed in the address bar that isn’t a URL">
        <select value={settings.searchEngine} onChange={(e) => onChange({ searchEngine: e.target.value as SearchEngineId })} aria-label="Search engine">
          {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
            <option key={id} value={id}>{e.name}</option>
          ))}
        </select>
      </Row>
      <Row title="Home page" hint="Leave empty to use the Orbis new tab page">
        <input
          className="text-input"
          value={home}
          placeholder="Orbis new tab page"
          onChange={(e) => setHome(e.target.value)}
          onBlur={() => onChange({ homepage: home })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Home page"
        />
      </Row>
    </>
  );
}

const LTS_CODE = /^[a-z0-9_-]{1,16}$/;

function LtsEditor({ settings, onChange }: { settings: Settings; onChange: Props['onChange'] }) {
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const entries = Object.entries(settings.lts).sort(([a], [b]) => a.localeCompare(b));

  const add = () => {
    const c = code.trim().toLowerCase();
    if (!LTS_CODE.test(c)) return setError('Commands use 1–16 letters, numbers, “-” or “_”.');
    if (!url.trim()) return setError('Enter the website address.');
    setError('');
    onChange({ lts: { ...settings.lts, [c]: url.trim() } });
    setCode('');
    setUrl('');
  };

  return (
    <>
      <h2>LTS — Link &amp; Tab Shortcuts</h2>
      <p className="hint">
        Type <code>lts &lt;command&gt;</code> in the address bar and press Enter to open the website in a new tab.
      </p>
      <ul className="lts-table">
        {entries.map(([c, u]) => (
          <li key={c}>
            <code>lts {c}</code>
            <input
              className="text-input"
              defaultValue={u}
              aria-label={`URL for ${c}`}
              onBlur={(e) => {
                if (e.target.value.trim() !== u) onChange({ lts: { ...settings.lts, [c]: e.target.value.trim() } });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button
              className="icon-btn"
              aria-label={`Delete ${c}`}
              onClick={() => {
                const next = { ...settings.lts };
                delete next[c];
                onChange({ lts: next });
              }}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="lts-add">
        <input className="text-input short" placeholder="command" value={code} onChange={(e) => setCode(e.target.value)} aria-label="New command" />
        <input className="text-input" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New command URL" />
        <button className="btn primary" onClick={add}>Add</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="setting-footer">
        <button className="btn" onClick={() => onChange({ lts: { ...DEFAULT_LTS } })}>Restore default shortcuts</button>
      </div>
    </>
  );
}

function Privacy({ settings, onChange, onToast }: { settings: Settings; onChange: Props['onChange']; onToast: Props['onToast'] }) {
  const [perms, setPerms] = useState<SitePermissions>({});
  const [clearHistory, setClearHistory] = useState(true);
  const [clearCache, setClearCache] = useState(true);
  const [clearCookies, setClearCookies] = useState(false);

  useEffect(() => {
    window.orbis.permissions.list().then(setPerms);
  }, []);

  const origins = Object.entries(perms).filter(([, p]) => Object.keys(p).length > 0);

  return (
    <>
      <h2>Privacy &amp; permissions</h2>
      <Row title="When a site asks for a permission" hint="Camera, microphone, location, notifications…">
        <Segmented
          label="Permission behaviour"
          value={settings.permissionDefault}
          onChange={(permissionDefault) => onChange({ permissionDefault })}
          options={[{ value: 'ask', label: 'Ask me' }, { value: 'deny', label: 'Block' }]}
        />
      </Row>

      <h3>Saved site permissions</h3>
      {origins.length === 0 && <p className="empty">No site has a saved permission.</p>}
      <ul className="perm-list">
        {origins.map(([origin, p]) =>
          Object.entries(p).map(([perm, value]) => (
            <li key={`${origin}-${perm}`}>
              <span className="perm-origin">{origin.replace(/^https?:\/\//, '')}</span>
              <span className="perm-name">{perm}</span>
              <span className={`perm-value ${value}`}>{value === 'allow' ? 'Allowed' : 'Blocked'}</span>
              <button className="icon-btn" aria-label="Reset permission" onClick={async () => setPerms(await window.orbis.permissions.revoke(origin, perm))}>
                <X size={14} />
              </button>
            </li>
          )),
        )}
      </ul>
      {origins.length > 0 && (
        <button className="btn" onClick={async () => setPerms(await window.orbis.permissions.clearAll())}>Reset all site permissions</button>
      )}

      <h3>Clear browsing data</h3>
      <div className="checks">
        <label><input type="checkbox" checked={clearHistory} onChange={(e) => setClearHistory(e.target.checked)} /> Browsing history</label>
        <label><input type="checkbox" checked={clearCache} onChange={(e) => setClearCache(e.target.checked)} /> Cached files</label>
        <label><input type="checkbox" checked={clearCookies} onChange={(e) => setClearCookies(e.target.checked)} /> Cookies and site data (signs you out of sites)</label>
      </div>
      <button
        className="btn danger"
        disabled={!clearHistory && !clearCache && !clearCookies}
        onClick={async () => {
          await window.orbis.data.clear({ history: clearHistory, cache: clearCache, cookies: clearCookies });
          onToast('Browsing data cleared');
        }}
      >
        Clear data
      </button>
    </>
  );
}
