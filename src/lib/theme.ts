import type { Settings } from '../../shared/types';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Picks black or white text for readable contrast on the accent colour. */
export function contrastOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? '#14151c' : '#ffffff';
}

/** Applies all appearance settings to the document immediately. */
export function applySettings(s: Settings, incognito: boolean): void {
  const root = document.documentElement;
  const dark =
    s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = incognito ? 'dark' : dark ? 'dark' : 'light';
  root.dataset.density = s.density;
  root.dataset.tabstyle = s.tabStyle;
  root.dataset.anim = s.animations ? 'on' : 'off';
  root.dataset.bg = s.backgroundKind;
  root.dataset.incognito = incognito ? 'true' : 'false';
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--accent-contrast', contrastOn(s.accent));
  root.style.setProperty('--font-size', `${s.fontSize}px`);
  root.style.setProperty('--bg-solid', s.backgroundColor);
  root.style.setProperty(
    '--bg-image',
    s.backgroundKind === 'image' && s.backgroundImage ? `url("${s.backgroundImage}")` : 'none',
  );
}

export function prettyUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('view-source:')) return url;
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const rest = `${u.pathname}${u.search}${u.hash}`;
      return `${u.host}${rest === '/' ? '' : rest}`;
    }
  } catch {
    // fall through
  }
  return url;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
