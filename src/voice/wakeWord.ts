/**
 * "Hey Vision" Wake-Word Detection & Mic Lifecycle State Machine
 * Conservative wake-word matching to avoid false positives while supporting
 * common speech-recognition transcriptions ("Hey Vision", "A Vision", "Hey A Vision", "Vision").
 */

export type WakeWordLifecycleState =
  | 'DISABLED'
  | 'WAKE_WORD_STANDBY'
  | 'WAKE_WORD_DETECTED'
  | 'ASSISTANT_ACTIVE'
  | 'COMMAND_LISTENING'
  | 'PROCESSING_COMMAND'
  | 'IDLE';

export interface WakeWordMatchResult {
  matched: boolean;
  variant?: 'hey vision' | 'a vision' | 'hey a vision' | 'vision';
  strippedCommand?: string;
}

const MIN_WAKE_CONFIDENCE = 0.25;

const WAKE_FILLER_WORDS = new Set([
  'please',
  'wake up',
  'wake',
  'assistant',
  'vision assistant',
  'can you hear me',
  'are you there',
  'hello',
  'hi',
  'listen',
  'listening',
  'ready'
]);

function cleanWakeRemainder(rem: string | undefined): string | undefined {
  if (!rem) return undefined;
  let clean = rem.toLowerCase().trim();
  if (!clean) return undefined;
  if (WAKE_FILLER_WORDS.has(clean)) return undefined;
  if (clean.startsWith('please ')) {
    clean = clean.replace(/^please\s+/, '').trim();
  }
  return clean || undefined;
}

/**
 * Matches wake-word variations ("Hey Vision", "Hi Vision", "Hello Vision", "A Vision", "Vision", etc.)
 * with strict exclusion of unrelated words like "television", "revision", "supervision", or "visionary".
 */
export function matchWakeWord(
  transcript: string,
  confidence?: number
): WakeWordMatchResult {
  if (!transcript || typeof transcript !== 'string') {
    return { matched: false };
  }
  if (typeof confidence === 'number' && confidence > 0 && confidence < MIN_WAKE_CONFIDENCE) {
    return { matched: false };
  }

  const normalized = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { matched: false };
  }

  // Explicit safety exclusion for non-standalone words containing vision
  if (/\b(?:television|revision|supervision|division|provision|visionary)\b/i.test(normalized)) {
    return { matched: false };
  }

  const patterns: Array<{
    regex: RegExp;
    variant: WakeWordMatchResult['variant'];
  }> = [
    { regex: /^(?:hey\s+a\s+(?:vision|vizion|vishon|vijan))(?:\s+(.*))?$/i, variant: 'hey a vision' },
    { regex: /^(?:(?:hey|hi|hello|hay|hai|hei|ok|okay|high)\s+(?:vision|vizion|vishon|vijan|visual))(?:\s+(.*))?$/i, variant: 'hey vision' },
    { regex: /^(?:a\s+(?:vision|vizion|vishon|vijan))(?:\s+(.*))?$/i, variant: 'a vision' },
    { regex: /^(?:wake\s+up\s+(?:vision|vizion|vishon|vijan))(?:\s+(.*))?$/i, variant: 'vision' },
    // Standalone "vision" or "vision <command>" at start of utterance
    { regex: /^(?:vision)(?:\s+(.*))?$/i, variant: 'vision' },
  ];

  for (const { regex, variant } of patterns) {
    const match = normalized.match(regex);
    if (match) {
      const remainder = cleanWakeRemainder(match[1]);
      return {
        matched: true,
        variant,
        strippedCommand: remainder || undefined,
      };
    }
  }

  // Also allow "hey vision" / "hi vision" / "a vision" embedded cleanly at word boundaries
  const embeddedPatterns: Array<{
    regex: RegExp;
    variant: WakeWordMatchResult['variant'];
  }> = [
    { regex: /\b(hey\s+a\s+(?:vision|vizion|vishon|vijan))\b(?:\s+(.*))?$/i, variant: 'hey a vision' },
    { regex: /\b((?:hey|hi|hello|hay|hai|hei|ok|okay|high)\s+(?:vision|vizion|vishon|vijan|visual))\b(?:\s+(.*))?$/i, variant: 'hey vision' },
    { regex: /\b(a\s+(?:vision|vizion|vishon|vijan))\b(?:\s+(.*))?$/i, variant: 'a vision' },
    { regex: /\b(wake\s+up\s+(?:vision|vizion|vishon|vijan))\b(?:\s+(.*))?$/i, variant: 'vision' },
  ];

  for (const { regex, variant } of embeddedPatterns) {
    const match = normalized.match(regex);
    if (match) {
      const remainder = cleanWakeRemainder(match[2]);
      return {
        matched: true,
        variant,
        strippedCommand: remainder || undefined,
      };
    }
  }

  return { matched: false };
}

export function isListeningLifecycleState(state: WakeWordLifecycleState): boolean {
  return (
    state === 'WAKE_WORD_STANDBY' ||
    state === 'ASSISTANT_ACTIVE' ||
    state === 'COMMAND_LISTENING'
  );
}

