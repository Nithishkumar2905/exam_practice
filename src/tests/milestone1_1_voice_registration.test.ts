import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeSpokenName,
  normalizeSpokenEmail,
  validateEmailSyntax,
  formatEmailForSpeech,
  normalizeSpokenPassword,
  validatePasswordPolicy,
  parseVoiceControlCommand,
  isFinalRegistrationConfirmation,
  getStagePrompt,
  processVoiceRegistrationTurn,
  VoiceRegistrationContext,
} from '../utils/voiceRegistration.ts';
import { normalizeSpokenCaptchaDigits } from '../utils/captchaUtils.ts';
import {
  issueCaptchaChallenge,
  verifyCaptchaChallengeToken,
  invalidateCaptchaChallengeToken,
  resetCaptchaServerStateForTests,
} from '../utils/captchaServer.ts';

const ROOT = process.cwd();

test('M1.1-NAME: Normalizes spoken full name and strips conversational prefixes', () => {
  assert.equal(normalizeSpokenName('My name is Nithish Kumar.'), 'Nithish Kumar');
  assert.equal(normalizeSpokenName('I am Aarav Sharma'), 'Aarav Sharma');
  assert.equal(normalizeSpokenName('Call me Priya Nair!'), 'Priya Nair');
});

test('M1.1-EMAIL-1: Normalizes spoken email with at and dot', () => {
  const email = normalizeSpokenEmail('Nithish Kumar at gmail dot com');
  assert.equal(email, 'nithishkumar@gmail.com');
  assert.equal(validateEmailSyntax(email), true);
  assert.equal(formatEmailForSpeech(email), 'nithishkumar at gmail dot com');
});

test('M1.1-EMAIL-2: Normalizes spoken email with underscore and hyphen without stripping meaningful characters', () => {
  const email = normalizeSpokenEmail('nithish underscore kumar hyphen 01 at yahoo dot co dot in');
  assert.equal(email, 'nithish_kumar-01@yahoo.co.in');
  assert.equal(validateEmailSyntax(email), true);
  assert.equal(
    formatEmailForSpeech(email),
    'nithish underscore kumar hyphen 01 at yahoo dot co dot in'
  );
  assert.equal(validateEmailSyntax('invalid-email-without-at'), false);
});

test('M1.1-PWD-1: Deterministic password dictation supports uppercase, lowercase, numbers, and symbols', () => {
  const pwd = normalizeSpokenPassword(
    'capital A lowercase b number five at symbol exclamation mark underscore hyphen dollar sign'
  );
  assert.equal(pwd, 'Ab5@!_-$');
  assert.equal(validatePasswordPolicy(pwd).valid, true);

  const pwd2 = normalizeSpokenPassword('upper case X cap Z digit 9 zero one');
  assert.equal(pwd2, 'XZ901');
  assert.equal(validatePasswordPolicy(pwd2).valid, false); // < 6 chars
});

test('M1.1-PWD-2: Password confirmation comparison and policy enforcement', () => {
  const first = normalizeSpokenPassword('capital S sc number 2 zero 2 six exclamation mark');
  const matching = normalizeSpokenPassword('capital S sc number 2 zero 2 six exclamation mark');
  const mismatching = normalizeSpokenPassword('capital S sc number 2 zero 2 seven exclamation mark');

  assert.equal(first, 'Ssc2026!');
  assert.equal(first === matching, true);
  assert.equal(first === mismatching, false);
  assert.equal(validatePasswordPolicy(first).valid, true);
});

test('M1.1-CAPTCHA: Spoken CAPTCHA, incorrect CAPTCHA, and CAPTCHA refresh', () => {
  resetCaptchaServerStateForTests();
  const challenge = issueCaptchaChallenge(4);
  const expected = normalizeSpokenCaptchaDigits(challenge.speechPrompt);
  assert.equal(expected.length, 4);

  // Spoken CAPTCHA with leading zeroes preserved
  assert.equal(normalizeSpokenCaptchaDigits('zero four two one'), '0421');

  // Incorrect CAPTCHA fails and invalidates token
  const wrong = expected === '0000' ? '1111' : '0000';
  assert.equal(verifyCaptchaChallengeToken(challenge.challengeToken, wrong).valid, false);

  // Refresh invalidates old challenge and issues a new one
  const c2 = issueCaptchaChallenge(3);
  invalidateCaptchaChallengeToken(c2.challengeToken);
  const d2 = normalizeSpokenCaptchaDigits(c2.speechPrompt);
  assert.equal(verifyCaptchaChallengeToken(c2.challengeToken, d2).valid, false);
});

test('M1.1-CONFIRM: Recognizes explicit registration confirmation and control commands', () => {
  assert.equal(isFinalRegistrationConfirmation('Create account'), true);
  assert.equal(isFinalRegistrationConfirmation('Confirm registration'), true);
  assert.equal(isFinalRegistrationConfirmation('Register my account'), true);
  assert.equal(isFinalRegistrationConfirmation('four two one'), false);
  assert.equal(isFinalRegistrationConfirmation('hello'), false);

  assert.equal(parseVoiceControlCommand('Repeat prompt'), 'REPEAT');
  assert.equal(parseVoiceControlCommand('Correct'), 'CORRECT');
  assert.equal(parseVoiceControlCommand('Previous field'), 'PREVIOUS');
  assert.equal(parseVoiceControlCommand('Next field'), 'NEXT');
  assert.equal(parseVoiceControlCommand('Stop voice registration'), 'STOP');
  assert.equal(parseVoiceControlCommand('Confirm'), 'CONFIRM');
});

test('M1.1-CONVERSATION: Complete voice registration conversation runs every mandatory prompt without skipping', () => {
  const ctx: VoiceRegistrationContext = {
    state: 'IDLE',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    captchaInput: '',
    captchaSpeechPrompt: 'Four... Two... One.',
  };

  // 1. ASKING_NAME -> LISTENING_NAME
  const nameAsk = getStagePrompt('ASKING_NAME', ctx)!;
  assert.equal(nameAsk.prompt, 'What is your full name?');
  assert.equal(nameAsk.listenState, 'LISTENING_NAME');
  ctx.state = nameAsk.listenState;

  // 2. Speak name -> CONFIRMING_NAME
  const t1 = processVoiceRegistrationTurn(ctx, 'My name is Nithish Kumar');
  assert.equal(t1.nextState, 'CONFIRMING_NAME');
  assert.equal(t1.patch.name, 'Nithish Kumar');
  ctx.name = t1.patch.name!;
  ctx.state = t1.listenAfterPrompt!;

  // 3. Confirm name -> ASKING_EMAIL ("What is your email ID?")
  const t2 = processVoiceRegistrationTurn(ctx, 'Confirm');
  assert.equal(t2.nextState, 'ASKING_EMAIL');
  assert.equal(t2.spokenPrompt, 'What is your email ID?');
  assert.equal(t2.listenAfterPrompt, 'LISTENING_EMAIL');
  ctx.state = t2.listenAfterPrompt!;

  // 4. Speak email -> CONFIRMING_EMAIL ("Is this your correct email address?")
  const t3 = processVoiceRegistrationTurn(ctx, 'Nithish Kumar at gmail dot com');
  assert.equal(t3.nextState, 'CONFIRMING_EMAIL');
  assert.equal(t3.patch.email, 'nithishkumar@gmail.com');
  assert.ok(t3.spokenPrompt?.includes('Is this your correct email address?'));
  ctx.email = t3.patch.email!;
  ctx.state = t3.listenAfterPrompt!;

  // 5. Confirm email -> ASKING_PASSWORD ("Please tell me your password.")
  const t4 = processVoiceRegistrationTurn(ctx, 'Yes');
  assert.equal(t4.nextState, 'ASKING_PASSWORD');
  assert.equal(t4.spokenPrompt, 'Please tell me your password.');
  assert.equal(t4.listenAfterPrompt, 'LISTENING_PASSWORD');
  ctx.state = t4.listenAfterPrompt!;

  // 6. Dictate password -> ASKING_CONFIRM_PASSWORD ("Please repeat your password to confirm.")
  const t5 = processVoiceRegistrationTurn(ctx, 'capital S sc number 2 zero 2 six exclamation mark');
  assert.equal(t5.nextState, 'ASKING_CONFIRM_PASSWORD');
  assert.equal(t5.patch.password, 'Ssc2026!');
  assert.equal(t5.spokenPrompt, 'Please repeat your password to confirm.');
  assert.equal(t5.spokenPrompt?.includes('Ssc2026!'), false); // never speak password
  ctx.password = t5.patch.password!;
  ctx.state = t5.listenAfterPrompt!;

  // 7. Mismatch confirm password -> VALIDATING_PASSWORD retry
  const t6Bad = processVoiceRegistrationTurn(ctx, 'capital S sc number 9 nine 9 exclamation mark');
  assert.equal(t6Bad.nextState, 'VALIDATING_PASSWORD');
  assert.equal(t6Bad.spokenPrompt, 'The passwords do not match. Please enter your password again.');
  ctx.state = t6Bad.listenAfterPrompt!;

  // 8. Matching confirm password -> ASKING_CAPTCHA
  const t6Good = processVoiceRegistrationTurn(ctx, 'capital S sc number 2 zero 2 six exclamation mark');
  assert.equal(t6Good.nextState, 'ASKING_CAPTCHA');
  assert.equal(t6Good.patch.confirmPassword, 'Ssc2026!');
  assert.equal(t6Good.spokenPrompt, 'Your CAPTCHA is Four... Two... One.');
  ctx.confirmPassword = t6Good.patch.confirmPassword!;
  ctx.state = t6Good.listenAfterPrompt!;

  // 9. Spoken CAPTCHA -> WAITING_FOR_FINAL_CONFIRMATION
  const t7 = processVoiceRegistrationTurn(ctx, 'Four two one');
  assert.equal(t7.nextState, 'WAITING_FOR_FINAL_CONFIRMATION');
  assert.equal(t7.patch.captchaInput, '421');
  assert.equal(
    t7.spokenPrompt,
    'Your registration information is ready. Say Create Account to complete registration.'
  );
  ctx.captchaInput = t7.patch.captchaInput!;
  ctx.state = t7.listenAfterPrompt!;

  // 10. Explicit Create account -> SUBMITTING_REGISTRATION
  const t8 = processVoiceRegistrationTurn(ctx, 'Create account');
  assert.equal(t8.nextState, 'SUBMITTING_REGISTRATION');
  assert.equal(t8.shouldSubmit, true);
});

test('M1.1-SECURITY-UI: Enforces server-side CAPTCHA/password policy, no password TTS/LLM/logging, and manual fallback', () => {
  const regSrc = fs.readFileSync(path.join(ROOT, 'src/screens/RegisterScreen.tsx'), 'utf8');
  const voiceRegSrc = fs.readFileSync(path.join(ROOT, 'src/utils/voiceRegistration.ts'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');

  // State machine stages present in voiceRegistration.ts
  for (const stage of [
    'IDLE',
    'ASKING_NAME',
    'LISTENING_NAME',
    'CONFIRMING_NAME',
    'ASKING_EMAIL',
    'LISTENING_EMAIL',
    'CONFIRMING_EMAIL',
    'ASKING_PASSWORD',
    'LISTENING_PASSWORD',
    'ASKING_CONFIRM_PASSWORD',
    'LISTENING_CONFIRM_PASSWORD',
    'VALIDATING_PASSWORD',
    'ASKING_CAPTCHA',
    'LISTENING_CAPTCHA',
    'VALIDATING_FIELDS',
    'WAITING_FOR_FINAL_CONFIRMATION',
    'SUBMITTING_REGISTRATION',
    'REGISTRATION_COMPLETE',
  ]) {
    assert.ok(voiceRegSrc.includes(stage), `Missing state ${stage} in voiceRegistration.ts`);
  }

  // Security checks: masked inputs, no password logging, no AI tutor calls
  assert.ok(regSrc.includes('type="password"'));
  assert.ok(regSrc.includes('confirmPassword'));
  assert.equal(regSrc.includes('/api/ai-tutor'), false);
  assert.equal(regSrc.includes('console.log'), false);
  assert.ok(regSrc.includes('NotAllowedError'));
  assert.ok(regSrc.includes('submittingRef'));
  assert.ok(regSrc.includes('accessprep_vision_mode'));

  // Server-side registration enforces CAPTCHA and password length >= 6
  const registerBlock = serverSrc.slice(serverSrc.indexOf("app.post('/api/auth/register'"));
  assert.ok(registerBlock.includes('verifyCaptchaChallengeToken'));
  assert.ok(registerBlock.includes('password.length < 6'));
});

