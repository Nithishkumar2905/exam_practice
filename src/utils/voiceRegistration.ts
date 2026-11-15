/**
 * Voice-Enabled Student Registration Utilities
 * Deterministic speech normalization for Name, Email, Password, and Confirmation Commands.
 * SECURITY: Passwords are normalized 100% locally and deterministically — never sent to an LLM,
 * never logged, and never spoken back via TTS.
 */

import { normalizeSpokenCaptchaDigits } from './captchaUtils.ts';

export type VoiceRegistrationState =
  | 'IDLE'
  | 'ASKING_NAME'
  | 'LISTENING_NAME'
  | 'CONFIRMING_NAME'
  | 'ASKING_EMAIL'
  | 'LISTENING_EMAIL'
  | 'CONFIRMING_EMAIL'
  | 'ASKING_PASSWORD'
  | 'LISTENING_PASSWORD'
  | 'ASKING_CONFIRM_PASSWORD'
  | 'LISTENING_CONFIRM_PASSWORD'
  | 'VALIDATING_PASSWORD'
  | 'ASKING_CAPTCHA'
  | 'LISTENING_CAPTCHA'
  | 'VALIDATING_FIELDS'
  | 'WAITING_FOR_FINAL_CONFIRMATION'
  | 'SUBMITTING_REGISTRATION'
  | 'REGISTRATION_COMPLETE';

export type VoiceControlAction =
  | 'REPEAT'
  | 'CORRECT'
  | 'CONFIRM'
  | 'NEXT'
  | 'PREVIOUS'
  | 'STOP';

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  won: '1',
  two: '2',
  too: '2',
  three: '3',
  tree: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
  nine: '9',
  niner: '9',
};

const SPOKEN_PASSWORD_SYMBOLS: Array<[string[], string]> = [
  [['at', 'symbol'], '@'],
  [['at', 'sign'], '@'],
  [['exclamation', 'mark'], '!'],
  [['exclamation', 'point'], '!'],
  [['question', 'mark'], '?'],
  [['dollar', 'sign'], '$'],
  [['pound', 'sign'], '#'],
  [['hash', 'tag'], '#'],
  [['percent', 'sign'], '%'],
  [['and', 'sign'], '&'],
  [['plus', 'sign'], '+'],
  [['under', 'score'], '_'],
];

const SINGLE_WORD_SYMBOLS: Record<string, string> = {
  at: '@',
  exclamation: '!',
  bang: '!',
  underscore: '_',
  hyphen: '-',
  dash: '-',
  minus: '-',
  dollar: '$',
  hash: '#',
  hashtag: '#',
  percent: '%',
  ampersand: '&',
  asterisk: '*',
  star: '*',
  plus: '+',
  dot: '.',
  period: '.',
  space: ' ',
};

/**
 * Parses global navigation/control commands during voice registration.
 */
export function parseVoiceControlCommand(transcript: string): VoiceControlAction | null {
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return null;

  if (
    clean === 'stop' ||
    clean === 'stop voice registration' ||
    clean === 'cancel voice registration' ||
    clean === 'exit voice registration'
  ) {
    return 'STOP';
  }
  if (clean === 'repeat' || clean === 'repeat prompt' || clean === 'say again') {
    return 'REPEAT';
  }
  if (
    clean === 'correct' ||
    clean === 'correct field' ||
    clean === 'change' ||
    clean === 'edit' ||
    clean === 'retry' ||
    clean === 'no'
  ) {
    return 'CORRECT';
  }
  if (
    clean === 'previous' ||
    clean === 'previous field' ||
    clean === 'go back' ||
    clean === 'back'
  ) {
    return 'PREVIOUS';
  }
  if (clean === 'next' || clean === 'next field' || clean === 'skip') {
    return 'NEXT';
  }
  if (
    clean === 'confirm' ||
    clean === 'yes' ||
    clean === 'correct yes' ||
    clean === 'that is correct' ||
    clean === 'looks good'
  ) {
    return 'CONFIRM';
  }
  return null;
}

/**
 * Checks whether the transcript is an explicit final registration confirmation command.
 */
export function isFinalRegistrationConfirmation(transcript: string): boolean {
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    clean === 'create account' ||
    clean === 'confirm registration' ||
    clean === 'register my account' ||
    clean.includes('create account') ||
    clean.includes('confirm registration') ||
    clean.includes('register my account')
  );
}

/**
 * Normalizes a spoken full name, stripping common conversational prefixes.
 */
export function normalizeSpokenName(transcript: string): string {
  const stripped = transcript
    .trim()
    .replace(/^(?:my\s+name\s+is|i\s+am|this\s+is|name\s+is|call\s+me)\s+/i, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped;
}

/**
 * Normalizes spoken email expressions ("at", "dot", "underscore", "hyphen")
 * and handles speech-recognition spacing without stripping meaningful characters.
 */
export function normalizeSpokenEmail(transcript: string): string {
  if (!transcript) return '';

  let text = transcript
    .toLowerCase()
    .trim()
    .replace(/^(?:my\s+email\s+(?:address\s+)?is|email\s+is)\s+/i, '')
    .replace(/[,;!?]+$/g, '')
    .trim();

  // Replace multi-word email tokens first
  text = text
    .replace(/\bat\s+the\s+rate(?:\s+of)?\b/g, ' @ ')
    .replace(/\bat\s+sign\b/g, ' @ ')
    .replace(/\bat\s+symbol\b/g, ' @ ')
    .replace(/\bunder\s+score\b/g, ' _ ');

  // Replace single-word email tokens
  text = text
    .replace(/\bat\b/g, ' @ ')
    .replace(/\b(?:dot|period|point)\b/g, ' . ')
    .replace(/\bunderscore\b/g, ' _ ')
    .replace(/\b(?:hyphen|dash)\b/g, ' - ');

  // Remove spaces around email punctuation and collapse speech-inserted spaces in local/domain parts
  text = text.replace(/\s+/g, '');

  return text;
}

export function validateEmailSyntax(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Formats an email address into clear, understandable spoken text without changing its meaning.
 */
export function formatEmailForSpeech(email: string): string {
  if (!email) return '';
  return email
    .split('')
    .map((ch) => {
      if (ch === '@') return ' at ';
      if (ch === '.') return ' dot ';
      if (ch === '_') return ' underscore ';
      if (ch === '-') return ' hyphen ';
      return ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic spoken password parser.
 * Supports:
 * - "capital A", "uppercase A", "cap A" -> "A"
 * - "lowercase b", "small b" -> "b"
 * - "number five", "digit 5", "five" -> "5"
 * - "at symbol", "exclamation mark", "underscore", "hyphen", "dollar sign", etc.
 * - Direct characters/words without calling any external AI/LLM.
 */
export function normalizeSpokenPassword(transcript: string): string {
  if (!transcript) return '';

  const rawTokens = transcript
    .trim()
    .replace(/[,;]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let result = '';
  let i = 0;

  while (i < rawTokens.length) {
    const t0 = rawTokens[i].toLowerCase();
    const t1 = rawTokens[i + 1]?.toLowerCase();
    const t2 = rawTokens[i + 2]?.toLowerCase();

    // 3-word modifier: "upper case a" / "lower case b"
    if ((t0 === 'upper' || t0 === 'lower') && t1 === 'case' && t2) {
      const char = t2.replace(/[^a-z0-9]/gi, '');
      if (char.length >= 1) {
        result += t0 === 'upper' ? char[0].toUpperCase() : char[0].toLowerCase();
        i += 3;
        continue;
      }
    }

    // 2-word modifier: "capital a", "uppercase a", "cap a", "lowercase b", "small b"
    if (
      (t0 === 'capital' || t0 === 'uppercase' || t0 === 'cap' || t0 === 'lowercase' || t0 === 'small') &&
      t1
    ) {
      const char = t1.replace(/[^a-z0-9]/gi, '');
      if (char.length >= 1) {
        const isUpper = t0 === 'capital' || t0 === 'uppercase' || t0 === 'cap';
        result += isUpper ? char[0].toUpperCase() : char[0].toLowerCase();
        i += 2;
        continue;
      }
    }

    // 2-word number command: "number five" / "digit 5"
    if ((t0 === 'number' || t0 === 'digit') && t1) {
      if (/^\d+$/.test(t1)) {
        result += t1;
        i += 2;
        continue;
      }
      if (t1 in DIGIT_WORDS) {
        result += DIGIT_WORDS[t1];
        i += 2;
        continue;
      }
      if (t1 === 'oh' || t1 === 'o') {
        result += '0';
        i += 2;
        continue;
      }
    }

    // 2-word symbol command: "at symbol", "exclamation mark", "dollar sign", etc.
    if (t1) {
      const matchedPair = SPOKEN_PASSWORD_SYMBOLS.find(
        ([pair]) => pair[0] === t0 && pair[1] === t1
      );
      if (matchedPair) {
        result += matchedPair[1];
        i += 2;
        continue;
      }
    }

    // Single-word symbol command
    if (t0 in SINGLE_WORD_SYMBOLS) {
      result += SINGLE_WORD_SYMBOLS[t0];
      i += 1;
      continue;
    }

    // Standalone digit word
    if (t0 in DIGIT_WORDS) {
      result += DIGIT_WORDS[t0];
      i += 1;
      continue;
    }

    // Preserve literal token (digits, symbols, or words/letters as spoken)
    result += rawTokens[i];
    i += 1;
  }

  return result;
}

export function validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters long.',
    };
  }
  return { valid: true };
}

export interface VoiceRegistrationContext {
  state: VoiceRegistrationState;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  captchaInput: string;
  captchaSpeechPrompt?: string;
}

export interface VoiceTurnResult {
  nextState: VoiceRegistrationState;
  listenAfterPrompt?: VoiceRegistrationState;
  spokenPrompt?: string;
  patch: Partial<Pick<VoiceRegistrationContext, 'name' | 'email' | 'password' | 'confirmPassword' | 'captchaInput'>>;
  shouldSubmit?: boolean;
  shouldStop?: boolean;
}

/**
 * Returns the exact mandatory TTS prompt and corresponding listening state for any ASKING_* stage.
 */
export function getStagePrompt(
  stage: VoiceRegistrationState,
  ctx?: Partial<VoiceRegistrationContext>
): { prompt: string; listenState: VoiceRegistrationState } | null {
  switch (stage) {
    case 'ASKING_NAME':
      return { prompt: 'What is your full name?', listenState: 'LISTENING_NAME' };
    case 'ASKING_EMAIL':
      return { prompt: 'What is your email ID?', listenState: 'LISTENING_EMAIL' };
    case 'ASKING_PASSWORD':
      return {
        prompt: 'Please tell me your password.',
        listenState: 'LISTENING_PASSWORD',
      };
    case 'ASKING_CONFIRM_PASSWORD':
      return {
        prompt: 'Please repeat your password to confirm.',
        listenState: 'LISTENING_CONFIRM_PASSWORD',
      };
    case 'ASKING_CAPTCHA': {
      const digitsPrompt = ctx?.captchaSpeechPrompt
        ? `Your CAPTCHA is ${ctx.captchaSpeechPrompt}`
        : 'Audio CAPTCHA is loading. Please say Repeat to hear it.';
      return { prompt: digitsPrompt, listenState: 'LISTENING_CAPTCHA' };
    }
    case 'WAITING_FOR_FINAL_CONFIRMATION':
      return {
        prompt: "Your registration information is ready. Say Create Account to complete registration.",
        listenState: 'WAITING_FOR_FINAL_CONFIRMATION',
      };
    default:
      return null;
  }
}

/**
 * Pure, deterministic state transition function for the complete voice registration conversation.
 * Guarantees no stage is skipped and passwords are never spoken back.
 */
export function processVoiceRegistrationTurn(
  ctx: VoiceRegistrationContext,
  transcript: string
): VoiceTurnResult {
  const stage = ctx.state;
  const control = parseVoiceControlCommand(transcript);

  if (control === 'STOP') {
    return { nextState: 'IDLE', patch: {}, shouldStop: true };
  }

  if (control === 'REPEAT') {
    const mapToAsk: Partial<Record<VoiceRegistrationState, VoiceRegistrationState>> = {
      ASKING_NAME: 'ASKING_NAME',
      LISTENING_NAME: 'ASKING_NAME',
      CONFIRMING_NAME: 'ASKING_NAME',
      ASKING_EMAIL: 'ASKING_EMAIL',
      LISTENING_EMAIL: 'ASKING_EMAIL',
      CONFIRMING_EMAIL: 'ASKING_EMAIL',
      ASKING_PASSWORD: 'ASKING_PASSWORD',
      LISTENING_PASSWORD: 'ASKING_PASSWORD',
      ASKING_CONFIRM_PASSWORD: 'ASKING_CONFIRM_PASSWORD',
      LISTENING_CONFIRM_PASSWORD: 'ASKING_CONFIRM_PASSWORD',
      VALIDATING_PASSWORD: 'ASKING_PASSWORD',
      ASKING_CAPTCHA: 'ASKING_CAPTCHA',
      LISTENING_CAPTCHA: 'ASKING_CAPTCHA',
      WAITING_FOR_FINAL_CONFIRMATION: 'WAITING_FOR_FINAL_CONFIRMATION',
    };
    const targetAsk = mapToAsk[stage] ?? 'ASKING_NAME';
    const info = getStagePrompt(targetAsk, ctx);
    return {
      nextState: targetAsk,
      listenAfterPrompt: info?.listenState,
      spokenPrompt: info?.prompt,
      patch: {},
    };
  }

  if (control === 'PREVIOUS') {
    let targetAsk: VoiceRegistrationState = 'ASKING_NAME';
    if (stage.includes('EMAIL')) targetAsk = 'ASKING_NAME';
    else if (stage.includes('CONFIRM_PASSWORD') || stage === 'VALIDATING_PASSWORD') targetAsk = 'ASKING_PASSWORD';
    else if (stage.includes('PASSWORD')) targetAsk = 'ASKING_EMAIL';
    else if (stage.includes('CAPTCHA')) targetAsk = 'ASKING_CONFIRM_PASSWORD';
    else if (stage === 'WAITING_FOR_FINAL_CONFIRMATION' || stage === 'VALIDATING_FIELDS') targetAsk = 'ASKING_CAPTCHA';
    const info = getStagePrompt(targetAsk, ctx);
    return {
      nextState: targetAsk,
      listenAfterPrompt: info?.listenState,
      spokenPrompt: info?.prompt,
      patch: {},
    };
  }

  // 1. Name capture & confirmation
  if (stage === 'LISTENING_NAME') {
    const cleanedName = normalizeSpokenName(transcript);
    if (!cleanedName || cleanedName.length < 2) {
      return {
        nextState: 'ASKING_NAME',
        listenAfterPrompt: 'LISTENING_NAME',
        spokenPrompt: 'I did not catch your full name. What is your full name?',
        patch: {},
      };
    }
    return {
      nextState: 'CONFIRMING_NAME',
      listenAfterPrompt: 'CONFIRMING_NAME',
      spokenPrompt: `I heard ${cleanedName}. Is this your correct full name? Say Confirm or Repeat.`,
      patch: { name: cleanedName },
    };
  }

  if (stage === 'CONFIRMING_NAME') {
    if (control === 'CONFIRM' || control === 'NEXT') {
      const info = getStagePrompt('ASKING_EMAIL', ctx)!;
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: {},
      };
    }
    if (control === 'CORRECT') {
      const info = getStagePrompt('ASKING_NAME', ctx)!;
      return {
        nextState: 'ASKING_NAME',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: { name: '' },
      };
    }
    // If user spoke a replacement name directly
    const replacement = normalizeSpokenName(transcript);
    if (replacement && replacement.length >= 2) {
      return {
        nextState: 'CONFIRMING_NAME',
        listenAfterPrompt: 'CONFIRMING_NAME',
        spokenPrompt: `I heard ${replacement}. Is this your correct full name? Say Confirm or Repeat.`,
        patch: { name: replacement },
      };
    }
    return {
      nextState: 'CONFIRMING_NAME',
      listenAfterPrompt: 'CONFIRMING_NAME',
      spokenPrompt: 'Please say Confirm to continue to email, or Repeat to change your name.',
      patch: {},
    };
  }

  // 2. Email capture & confirmation
  if (stage === 'LISTENING_EMAIL') {
    const normalizedEmail = normalizeSpokenEmail(transcript);
    if (!validateEmailSyntax(normalizedEmail)) {
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: 'LISTENING_EMAIL',
        spokenPrompt: 'That does not sound like a valid email address. What is your email ID?',
        patch: {},
      };
    }
    return {
      nextState: 'CONFIRMING_EMAIL',
      listenAfterPrompt: 'CONFIRMING_EMAIL',
      spokenPrompt: `I heard ${formatEmailForSpeech(normalizedEmail)}. Is this your correct email address?`,
      patch: { email: normalizedEmail },
    };
  }

  if (stage === 'CONFIRMING_EMAIL') {
    if (control === 'CONFIRM' || control === 'NEXT') {
      const info = getStagePrompt('ASKING_PASSWORD', ctx)!;
      return {
        nextState: 'ASKING_PASSWORD',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: {},
      };
    }
    if (control === 'CORRECT') {
      const info = getStagePrompt('ASKING_EMAIL', ctx)!;
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: { email: '' },
      };
    }
    const replacementEmail = normalizeSpokenEmail(transcript);
    if (validateEmailSyntax(replacementEmail)) {
      return {
        nextState: 'CONFIRMING_EMAIL',
        listenAfterPrompt: 'CONFIRMING_EMAIL',
        spokenPrompt: `I heard ${formatEmailForSpeech(replacementEmail)}. Is this your correct email address?`,
        patch: { email: replacementEmail },
      };
    }
    return {
      nextState: 'CONFIRMING_EMAIL',
      listenAfterPrompt: 'CONFIRMING_EMAIL',
      spokenPrompt: 'Is this your correct email address? Say Confirm to continue or Repeat to re-enter your email.',
      patch: {},
    };
  }

  // 3. Password dictation (never speak password back)
  if (stage === 'LISTENING_PASSWORD') {
    const normalizedPwd = normalizeSpokenPassword(transcript);
    const policy = validatePasswordPolicy(normalizedPwd);
    if (!policy.valid) {
      return {
        nextState: 'ASKING_PASSWORD',
        listenAfterPrompt: 'LISTENING_PASSWORD',
        spokenPrompt: 'Password must be at least 6 characters long. Please tell me your password.',
        patch: {},
      };
    }
    const info = getStagePrompt('ASKING_CONFIRM_PASSWORD', ctx)!;
    return {
      nextState: 'ASKING_CONFIRM_PASSWORD',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { password: normalizedPwd },
    };
  }

  // 4. Confirm password + VALIDATING_PASSWORD
  if (stage === 'LISTENING_CONFIRM_PASSWORD') {
    const normalizedConfirm = normalizeSpokenPassword(transcript);
    if (!normalizedConfirm || normalizedConfirm !== ctx.password) {
      return {
        nextState: 'VALIDATING_PASSWORD',
        listenAfterPrompt: 'LISTENING_CONFIRM_PASSWORD',
        spokenPrompt: 'The passwords do not match. Please enter your password again.',
        patch: { confirmPassword: '' },
      };
    }
    const info = getStagePrompt('ASKING_CAPTCHA', ctx)!;
    return {
      nextState: 'ASKING_CAPTCHA',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { confirmPassword: normalizedConfirm },
    };
  }

  if (stage === 'VALIDATING_PASSWORD') {
    const normalizedConfirm = normalizeSpokenPassword(transcript);
    if (!normalizedConfirm || normalizedConfirm !== ctx.password) {
      return {
        nextState: 'VALIDATING_PASSWORD',
        listenAfterPrompt: 'LISTENING_CONFIRM_PASSWORD',
        spokenPrompt: 'The passwords do not match. Please enter your password again.',
        patch: { confirmPassword: '' },
      };
    }
    const info = getStagePrompt('ASKING_CAPTCHA', ctx)!;
    return {
      nextState: 'ASKING_CAPTCHA',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { confirmPassword: normalizedConfirm },
    };
  }

  // 5. Audio CAPTCHA capture -> VALIDATING_FIELDS -> WAITING_FOR_FINAL_CONFIRMATION
  if (stage === 'LISTENING_CAPTCHA') {
    const digits = normalizeSpokenCaptchaDigits(transcript);
    if (!digits) {
      return {
        nextState: 'ASKING_CAPTCHA',
        listenAfterPrompt: 'LISTENING_CAPTCHA',
        spokenPrompt: 'No digits were recognized. Please speak the CAPTCHA numbers you hear.',
        patch: {},
      };
    }
    const info = getStagePrompt('WAITING_FOR_FINAL_CONFIRMATION', ctx)!;
    return {
      nextState: 'WAITING_FOR_FINAL_CONFIRMATION',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { captchaInput: digits },
    };
  }

  // 6. Final explicit confirmation
  if (stage === 'WAITING_FOR_FINAL_CONFIRMATION') {
    if (isFinalRegistrationConfirmation(transcript)) {
      return {
        nextState: 'SUBMITTING_REGISTRATION',
        patch: {},
        shouldSubmit: true,
      };
    }
    if (control === 'CORRECT') {
      const info = getStagePrompt('ASKING_NAME', ctx)!;
      return {
        nextState: 'ASKING_NAME',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: {},
      };
    }
    return {
      nextState: 'WAITING_FOR_FINAL_CONFIRMATION',
      listenAfterPrompt: 'WAITING_FOR_FINAL_CONFIRMATION',
      spokenPrompt: "Say Create Account to complete registration, or say Stop to cancel voice mode.",
      patch: {},
    };
  }

  return { nextState: stage, patch: {} };
}

