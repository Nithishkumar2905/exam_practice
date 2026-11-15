/**
 * ACCESSPREP-X Voice Command Parser
 * Deterministic, phonetic-tolerant natural language normalization and intent routing.
 */

import { ScreenId } from '../types/screens.ts';
import { SCREEN_TARGETS, PRACTICE_SUBJECT_TRIGGERS } from './commandRegistry.ts';
import { NavigationTarget, CommandIntentType } from './commandTypes.ts';

/**
 * Normalizes speech input into a clean string without punctuation and excess whitespace.
 */
export function cleanVoiceTranscript(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonetic / Homophone replacements for common speech recognition inaccuracies
 */
export function normalizePhonetics(cleanText: string): string {
  let text = cleanText;

  // "ai tutor" homophones
  text = text.replace(/\b(eye|i|aye)\s+tutor\b/g, 'ai tutor');
  text = text.replace(/\b(eye|i|aye)\s+scribe\b/g, 'ai tutor');

  // "mock test" / "mock exam"
  text = text.replace(/\bmark\s+test\b/g, 'mock test');
  text = text.replace(/\bmark\s+exam\b/g, 'mock exam');
  text = text.replace(/\bmox\s+exam\b/g, 'mock exam');

  // "dashboard"
  text = text.replace(/\bdash\s+board\b/g, 'dashboard');

  // "sm2"
  text = text.replace(/\bsm\s*2\b/g, 'sm2');

  // "bkt"
  text = text.replace(/\bb\s*k\s*t\b/g, 'bkt');

  // Numbers in navigation phrases: "screen 4", "screen four"
  text = text.replace(/\bscreen\s+(four|4)\b/g, 'dashboard');
  text = text.replace(/\bscreen\s+(seven|7)\b/g, 'mock exam');
  text = text.replace(/\bscreen\s+(nine|9)\b/g, 'ai tutor');

  return text.trim();
}

/**
 * Detects if the transcript represents a confirmation response (Yes / No)
 */
export function parseConfirmationIntent(cleanText: string): 'yes' | 'no' | null {
  const t = cleanText.trim();

  // Check "no" first because multi-word no-phrases can overlap with yes-words
  const noMatches = [
    'no',
    'nope',
    'cancel',
    'stay',
    'dont leave',
    'do not leave',
    'resume',
    'resume exam',
    'negative',
    'no keep going',
    'no stay',
    'no please'
  ];

  const yesMatches = [
    'yes',
    'yeah',
    'yep',
    'sure',
    'confirm',
    'leave',
    'pause and leave',
    'pause exam',
    'proceed',
    'ok',
    'okay',
    'affirmative',
    'yes please',
    'yes pause'
  ];

  // Exact match first for both lists
  if (noMatches.includes(t)) return 'no';
  if (yesMatches.includes(t)) return 'yes';

  // Partial match — no before yes to avoid overlap
  if (noMatches.some((m) => m.includes(' ') && (t.startsWith(m + ' ') || t.endsWith(' ' + m)))) {
    return 'no';
  }

  if (yesMatches.some((m) => m.includes(' ') && (t.startsWith(m + ' ') || t.endsWith(' ' + m)))) {
    return 'yes';
  }

  return null;
}

/**
 * Detects system level control commands (stop speaking, pause, resume, read slower, repeat)
 */
export function parseSystemControl(
  cleanText: string
): 'stop_speaking' | 'pause_reading' | 'resume_reading' | 'read_slower' | 'repeat' | null {
  const t = cleanText.trim();

  // 1. Pause Commands
  const pausePhrases = ['pause reading', 'pause speaking', 'pause audio', 'pause'];
  if (pausePhrases.some((p) => t === p)) {
    return 'pause_reading';
  }

  // 2. Resume Commands
  const resumePhrases = ['resume reading', 'resume speaking', 'continue reading', 'resume audio', 'resume'];
  if (resumePhrases.some((p) => t === p)) {
    return 'resume_reading';
  }

  // 3. Speed Commands
  const slowerPhrases = ['read slower', 'speak slower', 'talk slower', 'slow down', 'slower'];
  if (slowerPhrases.some((p) => t === p || t.includes(p))) {
    return 'read_slower';
  }

  // 4. Stop Commands
  const stopPhrases = [
    'stop speaking',
    'be quiet',
    'silence',
    'mute',
    'shut up',
    'stop reading',
    'stop talking',
    'quiet',
    'stop'
  ];

  if (stopPhrases.some((p) => t === p || (p !== 'stop' && t.includes(p)))) {
    return 'stop_speaking';
  }

  // 5. Repeat Commands
  const repeatPhrases = [
    'repeat',
    'say that again',
    'say again',
    'repeat last message',
    'repeat question',
    'read again',
    'what did you say'
  ];

  if (repeatPhrases.some((p) => t === p)) {
    return 'repeat';
  }

  return null;
}

/**
 * Detects global voice assistance intents
 */
export function parseAssistanceIntent(
  cleanText: string
): 'where_am_i' | 'what_can_i_do' | 'help_navigation' | 'go_back' | 'logout' | null {
  const t = cleanText.trim();

  // Where am I
  if (
    t === 'where am i' ||
    t === 'what screen is this' ||
    t === 'where are we' ||
    t === 'current screen' ||
    t === 'what is this screen' ||
    t === 'tell me where i am'
  ) {
    return 'where_am_i';
  }

  // What can I do here
  if (
    t === 'what can i do here' ||
    t === 'what can i do' ||
    t === 'screen help' ||
    t === 'available actions' ||
    t === 'what actions can i take' ||
    t === 'help on this screen' ||
    t === 'what are my options'
  ) {
    return 'what_can_i_do';
  }

  // Help navigation / command overview
  if (
    t === 'help me navigate' ||
    t === 'help navigate' ||
    t === 'help' ||
    t === 'commands' ||
    t === 'voice commands' ||
    t === 'navigation help' ||
    t === 'how do i navigate' ||
    t === 'list screens' ||
    t === 'available screens' ||
    t === 'menu'
  ) {
    return 'help_navigation';
  }

  // Go back
  if (
    t === 'go back' ||
    t === 'back' ||
    t === 'previous screen' ||
    t === 'return' ||
    t === 'last screen' ||
    t === 'take me back'
  ) {
    return 'go_back';
  }

  // Logout
  if (
    t === 'log out' ||
    t === 'logout' ||
    t === 'sign out' ||
    t === 'sign off' ||
    t === 'exit portal' ||
    t === 'quit'
  ) {
    return 'logout';
  }

  return null;
}

export interface MatchedScreenResult {
  target: NavigationTarget;
  subjectFilter?: string;
  subjectLabel?: string;
  confidence: number;
}

/**
 * Strips conversational filler prefixes such as "please go to", "i want to open", etc.
 */
export function stripNavigationPrefixes(text: string): string {
  let cleaned = text.trim();

  const prefixes = [
    'please open',
    'please go to',
    'please navigate to',
    'please take me to',
    'please show me',
    'please show',
    'please switch to',
    'can you open',
    'can you go to',
    'can you take me to',
    'could you open',
    'could you go to',
    'i want to open',
    'i want to go to',
    'i want to practice',
    'i want to take',
    'take me to',
    'navigate to',
    'switch to',
    'jump to',
    'bring me to',
    'go to',
    'open',
    'show me',
    'show my',
    'show',
    'view',
    'launch'
  ];

  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix + ' ')) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }

  return cleaned;
}

/**
 * Matches a spoken transcript to one of the 16 approved screens.
 */
export function matchScreenNavigation(
  rawTranscript: string,
  currentScreen?: ScreenId
): MatchedScreenResult | null {
  const clean = cleanVoiceTranscript(rawTranscript);
  const normalized = normalizePhonetics(clean);

  // 1. Check Practice Subject specific triggers first
  for (const trigger of PRACTICE_SUBJECT_TRIGGERS) {
    if (normalized.includes(trigger.phrase)) {
      return {
        target: SCREEN_TARGETS['voice_practice'],
        subjectFilter: trigger.subject,
        subjectLabel: trigger.label,
        confidence: 0.95
      };
    }
  }

  // 2. Strip filler verbs
  const stripped = stripNavigationPrefixes(normalized);

  // Guard against words that are primarily screen controls on specific screens:
  // e.g. "review" on mock_exam means review questions, not Revision Planner.
  // "repeat" means repeat question, not results.
  // "submit" means submit exam, not login/registration.
  if (currentScreen === 'mock_exam' || currentScreen === 'pilot_demo') {
    if (
      normalized === 'review' ||
      normalized === 'review test' ||
      normalized === 'repeat' ||
      normalized === 'submit' ||
      normalized === 'submit examination' ||
      normalized === 'submit exam' ||
      normalized === 'start examination' ||
      normalized === 'start exam' ||
      normalized === 'begin test' ||
      normalized === 'previous' ||
      normalized === 'back'
    ) {
      return null; // Let mock exam / pilot demo screen handle local control
    }
  }

  if (currentScreen === 'revision_planner') {
    if (
      normalized === 'next' ||
      normalized === 'skip' ||
      normalized === 'flip' ||
      normalized === 'reveal' ||
      normalized === 'reveal answer' ||
      normalized === 'show answer' ||
      normalized === 'again' ||
      normalized === 'hard' ||
      normalized === 'good' ||
      normalized === 'easy' ||
      normalized === 'pause' ||
      normalized === 'resume' ||
      normalized === 'previous' ||
      normalized === 'start revision' ||
      normalized === 'start revision session' ||
      normalized === 'start session' ||
      normalized === 'start drill'
    ) {
      return null;
    }
  }

  // 3. Exact alias match across all 16 screens
  for (const screenId of Object.keys(SCREEN_TARGETS) as ScreenId[]) {
    const target = SCREEN_TARGETS[screenId];

    for (const alias of target.aliases) {
      const cleanAlias = cleanVoiceTranscript(alias);

      // Exact match with stripped or normalized transcript
      if (stripped === cleanAlias || normalized === cleanAlias) {
        return { target, confidence: 1.0 };
      }

      // If spoken command ends with the screen alias (e.g. "open student dashboard")
      if (normalized.endsWith(' ' + cleanAlias) || stripped.endsWith(' ' + cleanAlias)) {
        return { target, confidence: 0.9 };
      }

      // If spoken command contains multi-word alias (e.g. "take me to the ai tutor right now")
      if (cleanAlias.includes(' ') && normalized.includes(cleanAlias)) {
        return { target, confidence: 0.85 };
      }
    }
  }

  return null;
}

