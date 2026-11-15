import {
  DEFAULT_SETTINGS,
  SEARCH_ENGINES,
  type Settings,
  type SearchEngineId,
} from '../shared/types';
import { isValidLtsCode, normalizeLtsUrl } from './resolve';

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates untrusted settings coming over IPC. Unknown keys / invalid values are dropped. */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!input || typeof input !== 'object') return out;
  const p = input as Record<string, unknown>;

  if (p.theme === 'light' || p.theme === 'dark' || p.theme === 'system') out.theme = p.theme;
  if (typeof p.accent === 'string' && HEX.test(p.accent)) out.accent = p.accent.toLowerCase();
  if (['aurora', 'dusk', 'mist', 'solid', 'image'].includes(p.backgroundKind as string)) {
    out.backgroundKind = p.backgroundKind as Settings['backgroundKind'];
  }
  if (typeof p.backgroundColor === 'string' && HEX.test(p.backgroundColor)) {
    out.backgroundColor = p.backgroundColor.toLowerCase();
  }
  if (typeof p.backgroundImage === 'string') {
    if (p.backgroundImage === '' || (/^data:image\/(png|jpeg|webp|gif);base64,/.test(p.backgroundImage) && p.backgroundImage.length < 6_000_000)) {
      out.backgroundImage = p.backgroundImage;
    }
  }
  if (['soft', 'pill', 'underline', 'compact'].includes(p.tabStyle as string)) {
    out.tabStyle = p.tabStyle as Settings['tabStyle'];
  }
  if (typeof p.showSidebar === 'boolean') out.showSidebar = p.showSidebar;
  if (typeof p.animations === 'boolean') out.animations = p.animations;
  if (typeof p.fontSize === 'number' && Number.isFinite(p.fontSize)) {
    out.fontSize = Math.min(20, Math.max(12, Math.round(p.fontSize)));
  }
  if (['compact', 'comfortable', 'spacious'].includes(p.density as string)) {
    out.density = p.density as Settings['density'];
  }
  if (typeof p.searchEngine === 'string' && p.searchEngine in SEARCH_ENGINES) {
    out.searchEngine = p.searchEngine as SearchEngineId;
  }
  if (typeof p.homepage === 'string') {
    const h = p.homepage.trim();
    if (h === '') out.homepage = '';
    else {
      const url = normalizeLtsUrl(h);
      if (url) out.homepage = url;
    }
  }
  if (p.permissionDefault === 'ask' || p.permissionDefault === 'deny') {
    out.permissionDefault = p.permissionDefault;
  }
  if (p.lts && typeof p.lts === 'object' && !Array.isArray(p.lts)) {
    const lts: Record<string, string> = {};
    for (const [rawCode, rawUrl] of Object.entries(p.lts as Record<string, unknown>).slice(0, 100)) {
      const code = rawCode.toLowerCase();
      if (!isValidLtsCode(code) || typeof rawUrl !== 'string') continue;
      const url = normalizeLtsUrl(rawUrl);
      if (url) lts[code] = url;
    }
    out.lts = lts;
  }
  return out;
}

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, lts: { ...DEFAULT_SETTINGS.lts } };
}
