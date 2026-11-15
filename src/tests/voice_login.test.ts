import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  VoiceLoginContext,
  getVoiceLoginStagePrompt,
  getVoiceLoginStatusLabel,
  processVoiceLoginTurn,
  isSignInConfirmationCommand,
  isStartVoiceLoginCommand,
} from '../utils/voiceLogin.ts';
import { matchWakeWord } from '../voice/wakeWord.ts';
import { formatCaptchaDigitsForSpeech, normalizeSpokenCaptchaDigits } from '../utils/captchaUtils.ts';
import {
  issueCaptchaChallenge,
  verifyCaptchaChallengeToken,
  resetCaptchaServerStateForTests,
} from '../utils/captchaServer.ts';

const ROOT = process.cwd();

test('VL-1: Complete Voice Login flow runs Email -> Confirm -> Password -> CAPTCHA -> Sign In', () => {
  const ctx: VoiceLoginContext = {
    state: 'IDLE',
    identifier: '',
    password: '',
    captchaInput: '',
    captchaDigitCount: 4,
    captchaSpeechPrompt: formatCaptchaDigitsForSpeech('5832'),
  };

  // Step 1: Start Login -> ASKING_EMAIL
  const start = getVoiceLoginStagePrompt('ASKING_EMAIL', ctx)!;
  assert.equal(
    start.prompt,
    "Welcome to ACCESSPREP-X. Let's sign you in. What is your registered email ID?"
  );
  assert.equal(start.listenState, 'LISTENING_EMAIL');
  ctx.state = start.listenState;

  // Step 2: Speak email -> CONFIRMING_EMAIL
  const tEmail = processVoiceLoginTurn(ctx, 'nithish at gmail dot com');
  assert.equal(tEmail.nextState, 'CONFIRMING_EMAIL');
  assert.equal(tEmail.patch.identifier, 'nithish@gmail.com');
  assert.equal(
    tEmail.spokenPrompt,
    'I understood your email address. Would you like to continue or repeat it?'
  );
  ctx.identifier = tEmail.patch.identifier!;
  ctx.state = tEmail.listenAfterPrompt!;

  // Step 3: Confirm email -> ASKING_PASSWORD
  const tConfirmEmail = processVoiceLoginTurn(ctx, 'continue');
  assert.equal(tConfirmEmail.nextState, 'ASKING_PASSWORD');
  assert.equal(
    tConfirmEmail.spokenPrompt,
    'Please enter your password. You can say it character by character or use the keyboard.'
  );
  assert.equal(tConfirmEmail.listenAfterPrompt, 'WAITING_FOR_PASSWORD');
  ctx.state = tConfirmEmail.listenAfterPrompt!;

  // Step 4: Dictate password securely (never spoken back) -> ASKING_CAPTCHA
  const tPwd = processVoiceLoginTurn(ctx, 'capital A lowercase b number five at symbol one two');
  assert.equal(tPwd.nextState, 'ASKING_CAPTCHA');
  assert.equal(tPwd.patch.password, 'Ab5@12');
  assert.equal(tPwd.spokenPrompt?.includes('Ab5@12'), false);
  assert.equal(
    tPwd.spokenPrompt,
    'Please listen to the verification code. Five... Eight... Three... Two. Please repeat the four digits.'
  );
  ctx.password = tPwd.patch.password!;
  ctx.state = tPwd.listenAfterPrompt!;

  // Step 5: Speak CAPTCHA -> WAITING_FOR_SIGNIN_CONFIRMATION
  const tCaptcha = processVoiceLoginTurn(ctx, 'Five eight three two');
  assert.equal(tCaptcha.nextState, 'WAITING_FOR_SIGNIN_CONFIRMATION');
  assert.equal(tCaptcha.patch.captchaInput, '5832');
  assert.equal(tCaptcha.spokenPrompt, 'Your login details are ready. Say Sign In to continue.');
  ctx.captchaInput = tCaptcha.patch.captchaInput!;
  ctx.state = tCaptcha.listenAfterPrompt!;

  // Step 6: Say Sign In -> SUBMITTING_LOGIN
  const tSubmit = processVoiceLoginTurn(ctx, 'Sign in');
  assert.equal(tSubmit.nextState, 'SUBMITTING_LOGIN');
  assert.equal(tSubmit.shouldSubmit, true);
});

test('VL-2: Keyboard password fallback with "continue" and Repeat Question behavior', () => {
  const ctx: VoiceLoginContext = {
    state: 'WAITING_FOR_PASSWORD',
    identifier: 'nithish@gmail.com',
    password: 'typedSecret99',
    captchaInput: '',
    captchaDigitCount: 4,
    captchaSpeechPrompt: 'Zero... Four... Two... One.',
  };

  // Repeat Question repeats only current prompt
  const rep = processVoiceLoginTurn(ctx, 'Repeat');
  assert.equal(rep.nextState, 'ASKING_PASSWORD');
  assert.equal(
    rep.spokenPrompt,
    'Please enter your password. You can say it character by character or use the keyboard.'
  );

  // Saying "continue" when password was typed on keyboard advances to CAPTCHA
  const cont = processVoiceLoginTurn(ctx, 'continue');
  assert.equal(cont.nextState, 'ASKING_CAPTCHA');
  assert.equal(cont.listenAfterPrompt, 'LISTENING_CAPTCHA');
});

test('VL-3: Server CAPTCHA verification rejects incorrect code and preserves leading zeroes', () => {
  resetCaptchaServerStateForTests();
  const challenge = issueCaptchaChallenge(4);
  const expected = normalizeSpokenCaptchaDigits(challenge.speechPrompt);
  const wrong = expected === '0000' ? '1111' : '0000';

  const badCheck = verifyCaptchaChallengeToken(challenge.challengeToken, wrong);
  assert.equal(badCheck.valid, false);

  const challenge2 = issueCaptchaChallenge(4);
  const expected2 = normalizeSpokenCaptchaDigits(challenge2.speechPrompt);
  assert.equal(verifyCaptchaChallengeToken(challenge2.challengeToken, expected2).valid, true);
});

test('VL-4: Sign-in confirmation aliases, status labels, and LoginScreen security guards', () => {
  assert.equal(isSignInConfirmationCommand('Sign in'), true);
  assert.equal(isSignInConfirmationCommand('Login'), true);
  assert.equal(isSignInConfirmationCommand('Continue'), true);
  assert.equal(isSignInConfirmationCommand('five eight three two'), false);

  assert.equal(getVoiceLoginStatusLabel('LISTENING_EMAIL'), 'Listening for email');
  assert.equal(getVoiceLoginStatusLabel('CONFIRMING_EMAIL'), 'Email captured');
  assert.equal(getVoiceLoginStatusLabel('WAITING_FOR_PASSWORD'), 'Waiting for password');
  assert.equal(getVoiceLoginStatusLabel('LISTENING_CAPTCHA'), 'CAPTCHA verification');
  assert.equal(getVoiceLoginStatusLabel('WAITING_FOR_SIGNIN_CONFIRMATION'), 'Ready to sign in');
  assert.equal(getVoiceLoginStatusLabel('SUBMITTING_LOGIN'), 'Signing in');
  assert.equal(getVoiceLoginStatusLabel('LOGIN_SUCCESS'), 'Login successful');
  assert.equal(getVoiceLoginStatusLabel('LOGIN_ERROR'), 'Login failed');

  const loginSrc = fs.readFileSync(path.join(ROOT, 'src/screens/LoginScreen.tsx'), 'utf8');
  assert.ok(loginSrc.includes('Start Voice Login'));
  assert.ok(loginSrc.includes('Pause Voice Login'));
  assert.ok(loginSrc.includes('Resume Voice Login'));
  assert.ok(loginSrc.includes('Repeat Question'));
  assert.ok(loginSrc.includes('Switch to Keyboard Login'));
  assert.ok(loginSrc.includes('submittingRef'));
  assert.equal(loginSrc.includes('/api/ai-tutor'), false);
  assert.equal(loginSrc.includes('console.log'), false);
});

test('VL-5: isStartVoiceLoginCommand detects natural spoken login triggers and rejects queries', () => {
  // Positive spoken login commands
  assert.equal(isStartVoiceLoginCommand('start login'), true);
  assert.equal(isStartVoiceLoginCommand('Start Login'), true);
  assert.equal(isStartVoiceLoginCommand('start voice login'), true);
  assert.equal(isStartVoiceLoginCommand('voice login'), true);
  assert.equal(isStartVoiceLoginCommand('begin login'), true);
  assert.equal(isStartVoiceLoginCommand('sign in'), true);
  assert.equal(isStartVoiceLoginCommand('login'), true);
  assert.equal(isStartVoiceLoginCommand('log in'), true);
  assert.equal(isStartVoiceLoginCommand('login by voice'), true);
  assert.equal(isStartVoiceLoginCommand('login with voice'), true);
  assert.equal(isStartVoiceLoginCommand('candidate login'), true);
  assert.equal(isStartVoiceLoginCommand('start sign in'), true);

  // Negative queries or commands that should NOT start voice login
  assert.equal(isStartVoiceLoginCommand('what is login'), false);
  assert.equal(isStartVoiceLoginCommand('explain login'), false);
  assert.equal(isStartVoiceLoginCommand('where am i'), false);
  assert.equal(isStartVoiceLoginCommand('help me navigate'), false);
  assert.equal(isStartVoiceLoginCommand('open mock exam'), false);
  assert.equal(isStartVoiceLoginCommand('repeat'), false);
  assert.equal(isStartVoiceLoginCommand('stop'), false);
});

test('VL-6: Voice Login prompt initiates by asking for registered email ID', () => {
  const stagePrompt = getVoiceLoginStagePrompt('STARTING_LOGIN')!;
  assert.ok(stagePrompt);
  assert.equal(
    stagePrompt.prompt,
    "Welcome to ACCESSPREP-X. Let's sign you in. What is your registered email ID?"
  );
  assert.equal(stagePrompt.listenState, 'LISTENING_EMAIL');

  // Verify wake word "Hey Vision" detection on login screen
  const wake1 = matchWakeWord('Hey Vision');
  assert.equal(wake1.matched, true);
  assert.equal(wake1.variant, 'hey vision');
  assert.equal(wake1.strippedCommand, undefined);

  // Verify combined "Hey Vision start login" wake + command
  const wake2 = matchWakeWord('Hey Vision start login');
  assert.equal(wake2.matched, true);
  assert.equal(wake2.strippedCommand, 'start login');
  assert.equal(isStartVoiceLoginCommand(wake2.strippedCommand!), true);

  // Ensure LoginScreen registers voice handler across all stages
  const loginSrc = fs.readFileSync(path.join(ROOT, 'src/screens/LoginScreen.tsx'), 'utf8');
  assert.ok(loginSrc.includes('isStartVoiceLoginCommand'));
  assert.ok(loginSrc.includes('matchWakeWord'));
  assert.ok(loginSrc.includes('registerVoiceHandler'));
  assert.ok(loginSrc.includes('Hey Vision') && loginSrc.includes('Start login'));
});

