/**
 * Global Voice Audio Preferences Persistence & Validation
 * Persists speechRate (0.5-2.0), speechPitch (0.5-1.5), speechVolume (0-100),
 * and selectedVoiceURI in localStorage under 'accessprep_voice_preferences'.
 */

export const VOICE_PREFERENCES_STORAGE_KEY = 'accessprep_voice_preferences';

export interface VoicePreferences {
  speechRate: number;
  speechPitch: number;
  speechVolume: number; // 0 to 100 (%)
  selectedVoiceURI: string;
}

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  speechRate: 1.0,
  speechPitch: 1.0,
  speechVolume: 100,
  selectedVoiceURI: 'default',
};

export function clampSpeechRate(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_PREFERENCES.speechRate;
  return Math.round(Math.min(2.0, Math.max(0.5, n)) * 10) / 10;
}

export function clampSpeechPitch(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_PREFERENCES.speechPitch;
  return Math.round(Math.min(1.5, Math.max(0.5, n)) * 10) / 10;
}

export function clampSpeechVolume(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_PREFERENCES.speechVolume;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export function normalizeVoicePreferences(raw: Partial<VoicePreferences> | null | undefined): VoicePreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
  return {
    speechRate: clampSpeechRate(raw.speechRate),
    speechPitch: clampSpeechPitch(raw.speechPitch),
    speechVolume: clampSpeechVolume(raw.speechVolume),
    selectedVoiceURI:
      typeof raw.selectedVoiceURI === 'string' && raw.selectedVoiceURI.trim()
        ? raw.selectedVoiceURI.trim()
        : 'default',
  };
}

export function loadVoicePreferences(storage?: Pick<Storage, 'getItem'>): VoicePreferences {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!store) return { ...DEFAULT_VOICE_PREFERENCES };
    const raw = store.getItem(VOICE_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_PREFERENCES };
    return normalizeVoicePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
}

export function saveVoicePreferences(
  prefs: VoicePreferences,
  storage?: Pick<Storage, 'setItem'>
): VoicePreferences {
  const normalized = normalizeVoicePreferences(prefs);
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    store?.setItem(VOICE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

