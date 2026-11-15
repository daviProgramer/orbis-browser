/** Chromium permissions that are always fine (they are either harmless or required for normal page behaviour). */
export const AUTO_ALLOW = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'keyboardLock',
  'mediaKeySystem',
  'speaker-selection',
  'storage-access',
  'top-level-storage-access',
]);

/** Permissions that trigger an in-browser prompt (and can be remembered per site). */
export const PROMPTABLE = new Set([
  'media',
  'geolocation',
  'notifications',
  'clipboard-read',
  'midi',
  'midiSysex',
  'idle-detection',
  'window-management',
]);

const LABELS: Record<string, string> = {
  geolocation: 'know your location',
  notifications: 'show notifications',
  'clipboard-read': 'see text and images copied to the clipboard',
  midi: 'use your MIDI devices',
  midiSysex: 'use your MIDI devices with system-exclusive messages',
  'idle-detection': 'know when you are idle',
  'window-management': 'manage windows on all your displays',
};

export function describePermission(permission: string, details: unknown): string {
  if (permission === 'media') {
    const types = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? [];
    const cam = types.includes('video');
    const mic = types.includes('audio');
    if (cam && mic) return 'use your camera and microphone';
    if (cam) return 'use your camera';
    if (mic) return 'use your microphone';
    return 'use your camera or microphone';
  }
  return LABELS[permission] ?? `use “${permission}”`;
}
