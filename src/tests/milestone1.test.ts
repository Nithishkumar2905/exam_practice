import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  generateNumericCaptchaCode,
  formatCaptchaDigitsForSpeech,
  normalizeSpokenCaptchaDigits,
} from '../utils/captchaUtils.ts';
import {
  issueCaptchaChallenge,
  verifyCaptchaChallengeToken,
  invalidateCaptchaChallengeToken,
  checkAuthRateLimit,
  resetCaptchaServerStateForTests,
} from '../utils/captchaServer.ts';
import { matchWakeWord, isListeningLifecycleState } from '../voice/wakeWord.ts';

const ROOT = process.cwd();

test('M1-CAPTCHA-1: Generates 3- and 4-digit numeric codes preserving leading zeroes', () => {
  const c3 = generateNumericCaptchaCode(3);
  const c4 = generateNumericCaptchaCode(4);
  assert.match(c3, /^\d{3}$/);
  assert.match(c4, /^\d{4}$/);

  const randomSamples = Array.from({ length: 40 }, () => generateNumericCaptchaCode());
  assert.ok(randomSamples.every((c) => /^\d{3,4}$/.test(c)));
});

test('M1-CAPTCHA-2: Formats digits individually for TTS including leading zeroes', () => {
  assert.equal(formatCaptchaDigitsForSpeech('421'), 'Four... Two... One.');
  assert.equal(formatCaptchaDigitsForSpeech('007'), 'Zero... Zero... Seven.');
  assert.equal(formatCaptchaDigitsForSpeech('0905'), 'Zero... Nine... Zero... Five.');
});

test('M1-CAPTCHA-3: Normalizes typed and spoken number words into digits preserving leading zeroes', () => {
  assert.equal(normalizeSpokenCaptchaDigits('007'), '007');
  assert.equal(normalizeSpokenCaptchaDigits('four two one'), '421');
  assert.equal(normalizeSpokenCaptchaDigits('zero zero seven'), '007');
  assert.equal(normalizeSpokenCaptchaDigits('oh won too tree for'), '01234');
  assert.equal(normalizeSpokenCaptchaDigits('nine, eight. seven!'), '987');
});

test('M1-CAPTCHA-4: Server-side signed challenge verifies once, rejects wrong answer, and prevents replay', () => {
  resetCaptchaServerStateForTests();
  const challenge = issueCaptchaChallenge(4);
  assert.ok(challenge.challengeToken.includes('.'));
  assert.equal(challenge.digitCount, 4);
  assert.ok(challenge.speechPrompt.endsWith('.'));

  // Extract digits from speechPrompt for verification test
  const expectedDigits = normalizeSpokenCaptchaDigits(challenge.speechPrompt);
  assert.equal(expectedDigits.length, 4);

  // Valid single-use verification succeeds
  const firstCheck = verifyCaptchaChallengeToken(challenge.challengeToken, expectedDigits);
  assert.equal(firstCheck.valid, true);

  // Replay of the same token fails
  const replayCheck = verifyCaptchaChallengeToken(challenge.challengeToken, expectedDigits);
  assert.equal(replayCheck.valid, false);
  assert.equal(replayCheck.reason, 'reused');

  // Wrong answer fails and invalidates token
  const challenge2 = issueCaptchaChallenge(3);
  const digits2 = normalizeSpokenCaptchaDigits(challenge2.speechPrompt);
  const wrongDigits = digits2 === '000' ? '111' : '000';
  const wrongCheck = verifyCaptchaChallengeToken(challenge2.challengeToken, wrongDigits);
  assert.equal(wrongCheck.valid, false);
  assert.equal(wrongCheck.reason, 'mismatch');

  // Cannot reuse challenge2 even with right digits after failed attempt
  const afterWrong = verifyCaptchaChallengeToken(challenge2.challengeToken, digits2);
  assert.equal(afterWrong.valid, false);
});

test('M1-CAPTCHA-5: Refresh invalidates previous token and rate limiter caps excessive attempts', () => {
  resetCaptchaServerStateForTests();
  const challenge = issueCaptchaChallenge(3);
  const digits = normalizeSpokenCaptchaDigits(challenge.speechPrompt);
  invalidateCaptchaChallengeToken(challenge.challengeToken);

  const check = verifyCaptchaChallengeToken(challenge.challengeToken, digits);
  assert.equal(check.valid, false);
  assert.equal(check.reason, 'reused');

  for (let i = 0; i < 10; i++) {
    const r = checkAuthRateLimit('127.0.0.1:test', 'login');
    assert.equal(r.allowed, true);
  }
  const blocked = checkAuthRateLimit('127.0.0.1:test', 'login');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('M1-WAKE-1: Matches conservative Hey Vision variations and strips trailing command', () => {
  assert.deepEqual(matchWakeWord('Hey Vision'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('A Vision.'), {
    matched: true,
    variant: 'a vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('Hey A Vision!'), {
    matched: true,
    variant: 'hey a vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('Vision'), {
    matched: true,
    variant: 'vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('Hey Vision open AI Tutor'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: 'open ai tutor',
  });
});

test('M1-WAKE-2: Ignores unrelated words and low-confidence false positives', () => {
  assert.equal(matchWakeWord('television news').matched, false);
  assert.equal(matchWakeWord('revision planner').matched, false);
  assert.equal(matchWakeWord('supervision required').matched, false);
  assert.equal(matchWakeWord('open dashboard').matched, false);
  assert.equal(matchWakeWord('hey vision', 0.2).matched, false);

  assert.equal(isListeningLifecycleState('WAKE_WORD_STANDBY'), true);
  assert.equal(isListeningLifecycleState('COMMAND_LISTENING'), true);
  assert.equal(isListeningLifecycleState('DISABLED'), false);
  assert.equal(isListeningLifecycleState('IDLE'), false);
});

test('M1-WAKE-3: Recognizes common acoustic speech-to-text transcriptions and waking fillers', () => {
  // Acoustic homophones
  assert.equal(matchWakeWord('hi vision').matched, true);
  assert.equal(matchWakeWord('hello vision').matched, true);
  assert.equal(matchWakeWord('hay vision').matched, true);
  assert.equal(matchWakeWord('hey visual').matched, true);
  assert.equal(matchWakeWord('ok vision').matched, true);
  assert.equal(matchWakeWord('wake up vision').matched, true);

  // Waking filler words clean to undefined strippedCommand
  assert.deepEqual(matchWakeWord('hey vision please'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('hey vision wake up'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('hey vision assistant'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: undefined,
  });
  assert.deepEqual(matchWakeWord('hey vision please start login'), {
    matched: true,
    variant: 'hey vision',
    strippedCommand: 'start login',
  });

  // Confidence >= 0.25 accepted
  assert.equal(matchWakeWord('hey vision', 0.45).matched, true);
  assert.equal(matchWakeWord('hey vision', 0.35).matched, true);
});

test('M1-REBRAND-1: UI components rebranded from Blind Mode to Vision Mode while preserving compatibility', () => {
  const headerSrc = fs.readFileSync(path.join(ROOT, 'src/components/Header.tsx'), 'utf8');
  const navSrc = fs.readFileSync(path.join(ROOT, 'src/components/Navigation.tsx'), 'utf8');
  const ctxSrc = fs.readFileSync(path.join(ROOT, 'src/context/AccessibilityContext.tsx'), 'utf8');

  assert.ok(headerSrc.includes('Vision Mode'));
  assert.equal(headerSrc.includes('Blind Mode'), false);
  assert.ok(navSrc.includes('Toggle Hands-Free Vision Mode'));
  assert.equal(navSrc.includes('Blind Mode'), false);

  // Dual localStorage keys + backward-compatible aliases + no unsolicited post-login speech
  assert.ok(ctxSrc.includes('accessprep_vision_mode'));
  assert.ok(ctxSrc.includes('accessprep_blind_mode'));
  assert.ok(ctxSrc.includes('isVisionMode'));
  assert.ok(ctxSrc.includes('isBlindMode'));
  assert.equal(ctxSrc.includes('Would you like to enable Hands-Free'), false);
});

test('M1-LAYOUT-1: Fixed static sidebar & independently scrollable main content', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  const navSrc = fs.readFileSync(path.join(ROOT, 'src/components/Navigation.tsx'), 'utf8');

  assert.ok(appSrc.includes('h-screen overflow-hidden flex flex-col'));
  assert.ok(appSrc.includes('flex-1 flex min-h-0 overflow-hidden'));
  assert.ok(appSrc.includes('flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto'));
  assert.ok(navSrc.includes('h-full overflow-y-auto'));
});
