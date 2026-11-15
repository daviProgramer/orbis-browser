import { SEARCH_ENGINES, type SearchEngineId } from '../shared/types';

const EXPLICIT = /^(https?:\/\/|file:\/\/|about:blank$)/i;
const VIEW_SOURCE = /^view-source:https?:\/\//i;
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?([/?#]\S*)?$/i;
const DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  return EXPLICIT.test(s) || VIEW_SOURCE.test(s) || LOCAL.test(s) || DOMAIN.test(s);
}

export function searchUrl(query: string, engine: SearchEngineId): string {
  return SEARCH_ENGINES[engine].url.replace('%s', encodeURIComponent(query));
}

/** Turns whatever was typed in the address bar into a URL (or a search). */
export function resolveInput(
  input: string,
  engine: SearchEngineId,
): { url: string; kind: 'url' | 'search' } | null {
  const s = input.trim();
  if (!s) return null;
  if (EXPLICIT.test(s) || VIEW_SOURCE.test(s)) {
    try {
      new URL(s.replace(/^view-source:/i, ''));
      return { url: s, kind: 'url' };
    } catch {
      return { url: searchUrl(s, engine), kind: 'search' };
    }
  }
  if (!/\s/.test(s)) {
    if (LOCAL.test(s)) return { url: `http://${s}`, kind: 'url' };
    if (DOMAIN.test(s)) return { url: `https://${s}`, kind: 'url' };
  }
  return { url: searchUrl(s, engine), kind: 'search' };
}

/** Only these schemes may be navigated to by tabs. Everything else (javascript:, custom protocols…) is blocked. */
export function isAllowedNavigation(url: string): boolean {
  try {
    return ['http:', 'https:', 'file:', 'about:', 'view-source:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** LTS — Link & Tab Shortcuts: `lts <code>` typed in the address bar. */
export function parseLts(input: string): { isLts: boolean; code: string } {
  const m = /^lts(?:\s+(\S+))?\s*$/i.exec(input.trim());
  if (!m) return { isLts: false, code: '' };
  return { isLts: true, code: (m[1] ?? '').toLowerCase() };
}

export function isValidLtsCode(code: string): boolean {
  return /^[a-z0-9_-]{1,16}$/.test(code);
}

/** Normalises a user-entered LTS target; returns null when it is not an http(s) URL. */
export function normalizeLtsUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString().replace(/\/$/, u.pathname === '/' && !u.search && !u.hash ? '' : '/');
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin;
    return o && o !== 'null' ? o : null;
  } catch {
    return null;
  }
}
