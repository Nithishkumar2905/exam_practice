/**
 * Dedicated Voice-Based Login State Controller
 * Reuses deterministic email/password/CAPTCHA normalizers without modifying registration.
 * SECURITY: Passwords are never logged, never spoken back via TTS, and never sent to an LLM.
 */
import { normalizeSpokenCaptchaDigits } from './captchaUtils.ts';
import {
  normalizeSpokenEmail,
  validateEmailSyntax,
  normalizeSpokenPassword,
  parseVoiceControlCommand,
} from './voiceRegistration.ts';

export type VoiceLoginState =
  | 'IDLE'
  | 'STARTING_LOGIN'
  | 'ASKING_EMAIL'
  | 'LISTENING_EMAIL'
  | 'CONFIRMING_EMAIL'
  | 'ASKING_PASSWORD'
  | 'WAITING_FOR_PASSWORD'
  | 'ASKING_CAPTCHA'
  | 'LISTENING_CAPTCHA'
  | 'VALIDATING_LOGIN'
  | 'WAITING_FOR_SIGNIN_CONFIRMATION'
  | 'SUBMITTING_LOGIN'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_ERROR'
  | 'CANCELLED';

export interface VoiceLoginContext {
  state: VoiceLoginState;
  identifier: string;
  password: string;
  captchaInput: string;
  captchaDigitCount: number;
  captchaSpeechPrompt?: string;
}

export interface VoiceLoginTurnResult {
  nextState: VoiceLoginState;
  listenAfterPrompt?: VoiceLoginState;
  spokenPrompt?: string;
  patch: Partial<Pick<VoiceLoginContext, 'identifier' | 'password' | 'captchaInput'>>;
  shouldSubmit?: boolean;
  shouldCancel?: boolean;
  focusField?: 'identifier' | 'password' | 'captcha';
}

export function getVoiceLoginStatusLabel(state: VoiceLoginState): string {
  switch (state) {
    case 'STARTING_LOGIN':
    case 'ASKING_EMAIL':
    case 'LISTENING_EMAIL':
      return 'Listening for email';
    case 'CONFIRMING_EMAIL':
      return 'Email captured';
    case 'ASKING_PASSWORD':
    case 'WAITING_FOR_PASSWORD':
      return 'Waiting for password';
    case 'ASKING_CAPTCHA':
    case 'LISTENING_CAPTCHA':
      return 'CAPTCHA verification';
    case 'VALIDATING_LOGIN':
    case 'WAITING_FOR_SIGNIN_CONFIRMATION':
      return 'Ready to sign in';
    case 'SUBMITTING_LOGIN':
      return 'Signing in';
    case 'LOGIN_SUCCESS':
      return 'Login successful';
    case 'LOGIN_ERROR':
      return 'Login failed';
    case 'CANCELLED':
    case 'IDLE':
    default:
      return 'Keyboard login active';
  }
}

export function isSignInConfirmationCommand(transcript: string): boolean {
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    clean === 'sign in' ||
    clean === 'signin' ||
    clean === 'login' ||
    clean === 'log in' ||
    clean === 'continue' ||
    clean.includes('sign in') ||
    clean.includes('log in')
  );
}

export function isStartVoiceLoginCommand(transcript: string): boolean {
  if (!transcript || typeof transcript !== 'string') return false;
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return false;

  // Reject assistance or informational queries
  if (
    clean.startsWith('what') ||
    clean.startsWith('how') ||
    clean.startsWith('why') ||
    clean.startsWith('where') ||
    clean.startsWith('explain')
  ) {
    return false;
  }

  const exactMatches = new Set([
    'start login',
    'start voice login',
    'voice login',
    'begin login',
    'start sign in',
    'sign in',
    'signin',
    'login',
    'log in',
    'open login',
    'candidate login',
    'start candidate login',
    'login by voice',
    'login with voice',
    'voice assisted login',
    'authenticate',
    'start authentication'
  ]);

  if (exactMatches.has(clean)) return true;

  return (
    clean.startsWith('start login') ||
    clean.startsWith('start voice login') ||
    clean.startsWith('begin login') ||
    clean.startsWith('voice login') ||
    clean.startsWith('start sign in') ||
    clean.includes('start login') ||
    clean.includes('start voice login') ||
    clean.includes('voice login') ||
    clean.includes('login by voice') ||
    clean.includes('login with voice')
  );
}

export function getVoiceLoginStagePrompt(
  stage: VoiceLoginState,
  ctx?: Partial<VoiceLoginContext>
): { prompt: string; listenState: VoiceLoginState } | null {
  switch (stage) {
    case 'STARTING_LOGIN':
    case 'ASKING_EMAIL':
      return {
        prompt: "Welcome to ACCESSPREP-X. Let's sign you in. What is your registered email ID?",
        listenState: 'LISTENING_EMAIL',
      };
    case 'CONFIRMING_EMAIL':
      return {
        prompt: 'I understood your email address. Would you like to continue or repeat it?',
        listenState: 'CONFIRMING_EMAIL',
      };
    case 'ASKING_PASSWORD':
      return {
        prompt: 'Please enter your password. You can say it character by character or use the keyboard.',
        listenState: 'WAITING_FOR_PASSWORD',
      };
    case 'ASKING_CAPTCHA': {
      const countWord = ctx?.captchaDigitCount === 3 ? 'three' : 'four';
      const digitsPart = ctx?.captchaSpeechPrompt
        ? `${ctx.captchaSpeechPrompt} Please repeat the ${countWord} digits.`
        : 'Audio verification code is loading. Please say Repeat to hear it.';
      return {
        prompt: `Please listen to the verification code. ${digitsPart}`,
        listenState: 'LISTENING_CAPTCHA',
      };
    }
    case 'WAITING_FOR_SIGNIN_CONFIRMATION':
      return {
        prompt: 'Your login details are ready. Say Sign In to continue.',
        listenState: 'WAITING_FOR_SIGNIN_CONFIRMATION',
      };
    default:
      return null;
  }
}

/**
 * Pure, deterministic state transition controller for Voice Login.
 * Ensures no mandatory state is skipped and submission never occurs before validation.
 */
export function processVoiceLoginTurn(
  ctx: VoiceLoginContext,
  transcript: string
): VoiceLoginTurnResult {
  const stage = ctx.state;
  const control = parseVoiceControlCommand(transcript);
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (control === 'STOP' || clean === 'switch to keyboard' || clean === 'keyboard login') {
    return { nextState: 'CANCELLED', patch: {}, shouldCancel: true };
  }

  if (control === 'REPEAT') {
    const mapToAsk: Partial<Record<VoiceLoginState, VoiceLoginState>> = {
      STARTING_LOGIN: 'ASKING_EMAIL',
      ASKING_EMAIL: 'ASKING_EMAIL',
      LISTENING_EMAIL: 'ASKING_EMAIL',
      CONFIRMING_EMAIL: 'CONFIRMING_EMAIL',
      ASKING_PASSWORD: 'ASKING_PASSWORD',
      WAITING_FOR_PASSWORD: 'ASKING_PASSWORD',
      ASKING_CAPTCHA: 'ASKING_CAPTCHA',
      LISTENING_CAPTCHA: 'ASKING_CAPTCHA',
      WAITING_FOR_SIGNIN_CONFIRMATION: 'WAITING_FOR_SIGNIN_CONFIRMATION',
    };
    const targetAsk = mapToAsk[stage] ?? 'ASKING_EMAIL';
    const info = getVoiceLoginStagePrompt(targetAsk, ctx);
    return {
      nextState: targetAsk,
      listenAfterPrompt: info?.listenState,
      spokenPrompt: info?.prompt,
      patch: {},
    };
  }

  // Step 2: Capture Email ID
  if (stage === 'LISTENING_EMAIL') {
    const normalizedEmail = normalizeSpokenEmail(transcript);
    if (!validateEmailSyntax(normalizedEmail)) {
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: 'LISTENING_EMAIL',
        spokenPrompt: 'That does not sound like a valid email address. What is your registered email ID?',
        patch: {},
        focusField: 'identifier',
      };
    }
    const info = getVoiceLoginStagePrompt('CONFIRMING_EMAIL', ctx)!;
    return {
      nextState: 'CONFIRMING_EMAIL',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { identifier: normalizedEmail },
    };
  }

  // Step 2b: Confirm Email ID
  if (stage === 'CONFIRMING_EMAIL') {
    if (control === 'CONFIRM' || control === 'NEXT' || clean === 'continue') {
      const info = getVoiceLoginStagePrompt('ASKING_PASSWORD', ctx)!;
      return {
        nextState: 'ASKING_PASSWORD',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: {},
        focusField: 'password',
      };
    }
    if (control === 'CORRECT') {
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: 'LISTENING_EMAIL',
        spokenPrompt: 'Please say your registered email ID again.',
        patch: { identifier: '' },
        focusField: 'identifier',
      };
    }
    const replacementEmail = normalizeSpokenEmail(transcript);
    if (validateEmailSyntax(replacementEmail)) {
      const info = getVoiceLoginStagePrompt('CONFIRMING_EMAIL', ctx)!;
      return {
        nextState: 'CONFIRMING_EMAIL',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: { identifier: replacementEmail },
      };
    }
    return {
      nextState: 'CONFIRMING_EMAIL',
      listenAfterPrompt: 'CONFIRMING_EMAIL',
      spokenPrompt: 'Would you like to continue or repeat your email address?',
      patch: {},
    };
  }

  // Step 3: Capture Password (voice character-by-character OR keyboard + "continue")
  if (stage === 'WAITING_FOR_PASSWORD') {
    if (clean === 'continue' || clean === 'done' || clean === 'next') {
      if (!ctx.password || ctx.password.length === 0) {
        return {
          nextState: 'WAITING_FOR_PASSWORD',
          listenAfterPrompt: 'WAITING_FOR_PASSWORD',
          spokenPrompt: 'No password has been entered yet. Please say your password or type it using the keyboard.',
          patch: {},
          focusField: 'password',
        };
      }
      const info = getVoiceLoginStagePrompt('ASKING_CAPTCHA', ctx)!;
      return {
        nextState: 'ASKING_CAPTCHA',
        listenAfterPrompt: info.listenState,
        spokenPrompt: info.prompt,
        patch: {},
      };
    }

    const parsedPwd = normalizeSpokenPassword(transcript);
    if (!parsedPwd) {
      return {
        nextState: 'WAITING_FOR_PASSWORD',
        listenAfterPrompt: 'WAITING_FOR_PASSWORD',
        spokenPrompt: 'For your security, please enter your password using the keyboard or speak it clearly.',
        patch: {},
        focusField: 'password',
      };
    }
    // Never speak the password back
    const info = getVoiceLoginStagePrompt('ASKING_CAPTCHA', ctx)!;
    return {
      nextState: 'ASKING_CAPTCHA',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { password: parsedPwd },
    };
  }

  // Step 4: Audio CAPTCHA
  if (stage === 'LISTENING_CAPTCHA') {
    const digits = normalizeSpokenCaptchaDigits(transcript);
    if (!digits || digits.length < 3) {
      const countWord = ctx.captchaDigitCount === 3 ? 'three' : 'four';
      return {
        nextState: 'LISTENING_CAPTCHA',
        listenAfterPrompt: 'LISTENING_CAPTCHA',
        spokenPrompt: `I did not catch all ${countWord} digits. Please repeat the ${countWord} digits.`,
        patch: {},
        focusField: 'captcha',
      };
    }

    // Validate all required fields before WAITING_FOR_SIGNIN_CONFIRMATION
    if (!ctx.identifier.trim() || !ctx.password) {
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: 'LISTENING_EMAIL',
        spokenPrompt: 'Email or password is missing. What is your registered email ID?',
        patch: { captchaInput: digits },
      };
    }

    const info = getVoiceLoginStagePrompt('WAITING_FOR_SIGNIN_CONFIRMATION', ctx)!;
    return {
      nextState: 'WAITING_FOR_SIGNIN_CONFIRMATION',
      listenAfterPrompt: info.listenState,
      spokenPrompt: info.prompt,
      patch: { captchaInput: digits },
    };
  }

  // Step 5: Login Confirmation
  if (stage === 'WAITING_FOR_SIGNIN_CONFIRMATION') {
    if (isSignInConfirmationCommand(transcript)) {
      if (!ctx.identifier.trim() || !ctx.password || !ctx.captchaInput.trim()) {
        return {
          nextState: 'VALIDATING_LOGIN',
          listenAfterPrompt: 'ASKING_EMAIL',
          spokenPrompt: 'Some login details are missing. Let us check your registered email ID.',
          patch: {},
        };
      }
      return {
        nextState: 'SUBMITTING_LOGIN',
        patch: {},
        shouldSubmit: true,
      };
    }
    return {
      nextState: 'WAITING_FOR_SIGNIN_CONFIRMATION',
      listenAfterPrompt: 'WAITING_FOR_SIGNIN_CONFIRMATION',
      spokenPrompt: 'Your login details are ready. Say Sign In to continue.',
      patch: {},
    };
  }

  // Retry from LOGIN_ERROR
  if (stage === 'LOGIN_ERROR') {
    if (isSignInConfirmationCommand(transcript) || control === 'CONFIRM') {
      return {
        nextState: 'ASKING_EMAIL',
        listenAfterPrompt: 'LISTENING_EMAIL',
        spokenPrompt: 'What is your registered email ID?',
        patch: {},
      };
    }
  }

  return { nextState: stage, patch: {} };
}

