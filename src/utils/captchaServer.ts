/**
 * Server-Side Audio CAPTCHA Challenge Signing, Single-Use Verification & Rate Limiting
 */
import crypto from 'node:crypto';
import { formatCaptchaDigitsForSpeech, normalizeSpokenCaptchaDigits } from './captchaUtils.ts';

const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CAPTCHA_REQUESTS_PER_WINDOW = 20;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;

const SERVER_SECRET =
  process.env.CAPTCHA_SECRET ||
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex');

interface CaptchaPayload {
  id: string;
  hash: string;
  exp: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

// Active issued challenges: challengeId -> expiry timestamp (enforces single-use)
const activeChallenges = new Map<string, number>();
const rateBuckets = new Map<string, RateBucket>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, exp] of activeChallenges.entries()) {
    if (exp <= now) {
      activeChallenges.delete(id);
    }
  }
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
}

function hashAnswer(challengeId: string, answer: string): string {
  return crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${challengeId}:${answer}`)
    .digest('hex');
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(payloadB64)
    .digest('base64url');
}

export function generateServerNumericCode(length?: 3 | 4): string {
  const targetLen = length === 3 || length === 4 ? length : crypto.randomInt(3, 5);
  let code = '';
  for (let i = 0; i < targetLen; i++) {
    code += String(crypto.randomInt(0, 10));
  }
  return code;
}

export interface IssuedCaptchaChallenge {
  challengeToken: string;
  speechPrompt: string;
  digitCount: number;
  expiresInSeconds: number;
  /** Returned for internal tests only when needed; never exposed to DOM. */
  _codeForTest?: never;
}

/**
 * Issues a new short-lived, single-use signed CAPTCHA challenge.
 * Returns speechPrompt (word-by-word spoken form) so the client can read
 * digits aloud via speakText without storing raw digits in HTML attributes.
 */
export function issueCaptchaChallenge(length?: 3 | 4): IssuedCaptchaChallenge {
  pruneExpired();
  const code = generateServerNumericCode(length);
  const id = crypto.randomUUID();
  const exp = Date.now() + CAPTCHA_TTL_MS;

  activeChallenges.set(id, exp);

  const payload: CaptchaPayload = {
    id,
    hash: hashAnswer(id, code),
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(payloadB64);

  return {
    challengeToken: `${payloadB64}.${sig}`,
    speechPrompt: formatCaptchaDigitsForSpeech(code),
    digitCount: code.length,
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
}

export interface CaptchaVerificationResult {
  valid: boolean;
  reason?: 'missing' | 'malformed' | 'expired' | 'reused' | 'mismatch';
}

/**
 * Verifies a signed CAPTCHA challenge token and user answer.
 * Invalidates the challenge on verification attempt (single-use) when valid
 * or when explicitly consumed, preventing token replay.
 */
export function verifyCaptchaChallengeToken(
  challengeToken: string | undefined,
  submittedAnswer: string | undefined
): CaptchaVerificationResult {
  pruneExpired();

  if (!challengeToken || typeof challengeToken !== 'string' || !submittedAnswer) {
    return { valid: false, reason: 'missing' };
  }

  const parts = challengeToken.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed' };
  }

  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'malformed' };
  }

  let payload: CaptchaPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (!payload?.id || !payload?.hash || typeof payload?.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }

  if (Date.now() > payload.exp) {
    activeChallenges.delete(payload.id);
    return { valid: false, reason: 'expired' };
  }

  if (!activeChallenges.has(payload.id)) {
    return { valid: false, reason: 'reused' };
  }

  // Consume single-use token immediately so neither valid nor brute-forced tokens can be replayed
  activeChallenges.delete(payload.id);

  const normalizedAnswer = normalizeSpokenCaptchaDigits(String(submittedAnswer));
  if (!normalizedAnswer) {
    return { valid: false, reason: 'mismatch' };
  }

  const submittedHash = hashAnswer(payload.id, normalizedAnswer);
  const a = Buffer.from(submittedHash, 'hex');
  const b = Buffer.from(payload.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'mismatch' };
  }

  return { valid: true };
}

/**
 * Invalidates an active CAPTCHA challenge token (e.g., on refresh).
 */
export function invalidateCaptchaChallengeToken(challengeToken: string | undefined): void {
  if (!challengeToken || typeof challengeToken !== 'string') return;
  const [payloadB64] = challengeToken.split('.');
  if (!payloadB64) return;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload?.id) {
      activeChallenges.delete(payload.id);
    }
  } catch {
    // Ignore malformed token on invalidation
  }
}

/**
 * Simple in-memory sliding-window rate limiter for CAPTCHA and login endpoints.
 */
export function checkAuthRateLimit(
  key: string,
  kind: 'captcha' | 'login'
): { allowed: boolean; retryAfterSeconds: number } {
  pruneExpired();
  const now = Date.now();
  const limit = kind === 'captcha' ? MAX_CAPTCHA_REQUESTS_PER_WINDOW : MAX_LOGIN_ATTEMPTS_PER_WINDOW;
  const bucketKey = `${kind}:${key}`;
  const existing = rateBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetCaptchaServerStateForTests(): void {
  activeChallenges.clear();
  rateBuckets.clear();
}

