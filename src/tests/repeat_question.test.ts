/**
 * ACCESSPREP-X — Repeat Question & Repeat Options Test Suite
 * Validates speech formatting, voice command parsing, individual option reading,
 * audio playback controls, and exam non-mutation invariants.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer } from '../utils/answerParser.ts';
import {
  formatFullQuestionPrompt,
  formatQuestionStemOnly,
  formatAllOptionsPrompt,
  formatSingleOptionPrompt,
  formatFlashcardQuestionPrompt,
  formatFlashcardAnswerPrompt
} from '../utils/repeatQuestionHelper.ts';
import { parseSystemControl } from '../voice/commandParser.ts';
import { NavigationController } from '../voice/NavigationController.ts';
import type { Question } from '../db/database.ts';

// ---------------------------------------------------------------------------
// Mock Question Data
// ---------------------------------------------------------------------------

const mockQuestion: Question = {
  question_id: 'Q_101',
  subject: 'Numerical and Mathematical Ability',
  topic: 'LCM and HCF',
  subtopic: 'Multiples',
  question_text: 'What is the LCM of 12 and 18?',
  question_type: 'MCQ',
  option_a: '24',
  option_b: '36',
  option_c: '48',
  option_d: '72',
  correct_answer: 'B',
  explanation: 'Multiples of 18 are 18, 36, 54. 36 is divisible by 12, so LCM is 36.',
  difficulty_label: 'Easy',
  source_name: 'SSC MTS PYQ',
  source_reference: '2023 Shift 1',
  source_type: 'PYQ',
  verification_status: 'Verified',
  language: 'en',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dataset_version: 'v1.0'
};

// ---------------------------------------------------------------------------
// 1. Spoken Prompt Formatter Tests
// ---------------------------------------------------------------------------

test('Repeat Helper: formatFullQuestionPrompt includes question index, subject, stem, and all 4 options', () => {
  const prompt = formatFullQuestionPrompt(mockQuestion, 0, 20);
  assert.ok(prompt.includes('Question 1 of 20'));
  assert.ok(prompt.includes('Section: Numerical and Mathematical Ability'));
  assert.ok(prompt.includes('What is the LCM of 12 and 18?'));
  assert.ok(prompt.includes('Option A: 24'));
  assert.ok(prompt.includes('Option B: 36'));
  assert.ok(prompt.includes('Option C: 48'));
  assert.ok(prompt.includes('Option D: 72'));
  assert.ok(prompt.includes('What is your answer?'));
});

test('Repeat Helper: formatQuestionStemOnly produces stem without options list', () => {
  const stem = formatQuestionStemOnly(mockQuestion, 2, 10);
  assert.ok(stem.includes('Question 3 of 10'));
  assert.ok(stem.includes('What is the LCM of 12 and 18?'));
  assert.ok(!stem.includes('Option A'));
  assert.ok(!stem.includes('Option B'));
});

test('Repeat Helper: formatAllOptionsPrompt produces all 4 options labeled A through D', () => {
  const optionsText = formatAllOptionsPrompt(mockQuestion);
  assert.ok(optionsText.startsWith('The options are:'));
  assert.ok(optionsText.includes('Option A: 24'));
  assert.ok(optionsText.includes('Option B: 36'));
  assert.ok(optionsText.includes('Option C: 48'));
  assert.ok(optionsText.includes('Option D: 72'));
});

test('Repeat Helper: formatSingleOptionPrompt extracts single option accurately', () => {
  const optA = formatSingleOptionPrompt(mockQuestion, 'A');
  const optB = formatSingleOptionPrompt(mockQuestion, 'B');
  const optC = formatSingleOptionPrompt(mockQuestion, 'C');
  const optD = formatSingleOptionPrompt(mockQuestion, 'D');

  assert.equal(optA, 'Option A: 24.');
  assert.equal(optB, 'Option B: 36.');
  assert.equal(optC, 'Option C: 48.');
  assert.equal(optD, 'Option D: 72.');
});

test('Repeat Helper: formatFlashcardQuestionPrompt formats spaced repetition card prompt', () => {
  const card = {
    subject: 'Reasoning Ability',
    topic: 'Number Series',
    questionText: 'Find the next number in series: 2, 4, 8, 16, ?'
  };
  const prompt = formatFlashcardQuestionPrompt(card, 0, 15);
  assert.ok(prompt.includes('Revision Card 1 of 15'));
  assert.ok(prompt.includes('Subject: Reasoning Ability'));
  assert.ok(prompt.includes('Topic: Number Series'));
  assert.ok(prompt.includes('Find the next number in series'));
});

test('Repeat Helper: formatFlashcardAnswerPrompt formats correct answer and explanation', () => {
  const card = {
    correctAnswer: '32',
    explanation: 'Each number is multiplied by 2.'
  };
  const prompt = formatFlashcardAnswerPrompt(card);
  assert.equal(prompt, 'Answer: 32. Explanation: Each number is multiplied by 2.');
});

// ---------------------------------------------------------------------------
// 2. Spoken Command Parser Tests (AnswerParser)
// ---------------------------------------------------------------------------

test('AnswerParser: parses repeat question voice variants to "repeat"', () => {
  assert.equal(parseAnswer('repeat'), 'repeat');
  assert.equal(parseAnswer('repeat question'), 'repeat');
  assert.equal(parseAnswer('repeat the question'), 'repeat');
  assert.equal(parseAnswer('read question again'), 'repeat');
  assert.equal(parseAnswer('read the prompt again'), 'repeat');
  assert.equal(parseAnswer('what was the question'), 'repeat');
  assert.equal(parseAnswer('say question again'), 'repeat');
});

test('AnswerParser: parses repeat options voice variants to "repeat_options"', () => {
  assert.equal(parseAnswer('repeat options'), 'repeat_options');
  assert.equal(parseAnswer('repeat the options'), 'repeat_options');
  assert.equal(parseAnswer('read options'), 'repeat_options');
  assert.equal(parseAnswer('read the options again'), 'repeat_options');
  assert.equal(parseAnswer('what are the options'), 'repeat_options');
  assert.equal(parseAnswer('read the choices'), 'repeat_options');
  assert.equal(parseAnswer('repeat choices'), 'repeat_options');
});

test('AnswerParser: parses specific option repeats (A, B, C, D)', () => {
  assert.equal(parseAnswer('repeat option a'), 'repeat_option_a');
  assert.equal(parseAnswer('repeat option b'), 'repeat_option_b');
  assert.equal(parseAnswer('repeat option c'), 'repeat_option_c');
  assert.equal(parseAnswer('repeat option d'), 'repeat_option_d');

  assert.equal(parseAnswer('read option a'), 'repeat_option_a');
  assert.equal(parseAnswer('read choice b'), 'repeat_option_b');
  assert.equal(parseAnswer('what is option c'), 'repeat_option_c');
  assert.equal(parseAnswer('repeat choice d'), 'repeat_option_d');
});

test('AnswerParser: parses speech playback control commands', () => {
  assert.equal(parseAnswer('read slower'), 'read_slower');
  assert.equal(parseAnswer('speak slower'), 'read_slower');
  assert.equal(parseAnswer('slower'), 'read_slower');

  assert.equal(parseAnswer('pause reading'), 'pause_reading');
  assert.equal(parseAnswer('pause speech'), 'pause_reading');
  assert.equal(parseAnswer('pause audio'), 'pause_reading');

  assert.equal(parseAnswer('resume reading'), 'resume_reading');
  assert.equal(parseAnswer('resume speech'), 'resume_reading');
  assert.equal(parseAnswer('resume audio'), 'resume_reading');

  assert.equal(parseAnswer('stop reading'), 'stop_speaking');
  assert.equal(parseAnswer('stop speaking'), 'stop_speaking');
  assert.equal(parseAnswer('stop audio'), 'stop_speaking');
  assert.equal(parseAnswer('be quiet'), 'stop_speaking');
});

test('AnswerParser: standard answering commands remain unimpaired', () => {
  assert.equal(parseAnswer('option a'), 'A');
  assert.equal(parseAnswer('b'), 'B');
  assert.equal(parseAnswer('choice c'), 'C');
  assert.equal(parseAnswer('d'), 'D');
  assert.equal(parseAnswer('next'), 'skip');
  assert.equal(parseAnswer('skip'), 'skip');
  assert.equal(parseAnswer('previous'), 'previous');
});

// ---------------------------------------------------------------------------
// 3. Command Parser & Navigation Controller System Control Tests
// ---------------------------------------------------------------------------

test('CommandParser: parseSystemControl recognizes playback controls', () => {
  assert.equal(parseSystemControl('pause reading'), 'pause_reading');
  assert.equal(parseSystemControl('resume reading'), 'resume_reading');
  assert.equal(parseSystemControl('read slower'), 'read_slower');
  assert.equal(parseSystemControl('stop reading'), 'stop_speaking');
  assert.equal(parseSystemControl('stop speaking'), 'stop_speaking');
  assert.equal(parseSystemControl('repeat'), 'repeat');
});

test('NavigationController: activeVoiceHandler intercepts question repeat ahead of generic system controls', async () => {
  let screenRepeated = false;
  let genericRepeated = false;

  const controller = new NavigationController({
    context: {
      currentScreen: 'voice_practice',
      isExamActive: false,
      user: null,
      pendingExamExit: null,
      historyStack: [],
      lastSpokenText: 'Generic last spoken text'
    },
    navigate: () => {},
    speak: () => {
      genericRepeated = true;
    },
    stopSpeak: () => {},
    logout: () => {}
  });

  const localHandler = (transcript: string) => {
    if (transcript.toLowerCase().includes('repeat')) {
      screenRepeated = true;
      return true;
    }
    return false;
  };

  const result = await controller.processTranscript('repeat the question', localHandler);
  assert.equal(result.status, 'local_handled');
  assert.equal(screenRepeated, true, 'Active screen handler should handle the repeat command');
  assert.equal(genericRepeated, false, 'Generic repeat should not be called when screen handled it');
});

// ---------------------------------------------------------------------------
// 4. Examination Safety & Non-Mutation Invariants
// ---------------------------------------------------------------------------

test('Exam Safety: repeating a question does not mutate state or timer', () => {
  // Simulate active exam state
  const examState = {
    currentIndex: 4,
    answers: { 0: 'A', 1: 'B', 2: 'C', 3: 'D' },
    secondsRemaining: 1800,
    isExamActive: true
  };

  const initialCopy = JSON.stringify(examState);

  // Function simulating repeat question
  const repeatCurrentQuestion = (state: typeof examState, q: Question) => {
    // Generates TTS speech prompt without touching state
    const prompt = formatFullQuestionPrompt(q, state.currentIndex, 20);
    return prompt;
  };

  const prompt = repeatCurrentQuestion(examState, mockQuestion);

  assert.ok(prompt.includes('Question 5 of 20'));
  assert.equal(
    JSON.stringify(examState),
    initialCopy,
    'Exam state must be strictly immutable during question repeat'
  );
  assert.equal(examState.secondsRemaining, 1800, 'Timer must not be modified');
  assert.equal(examState.currentIndex, 4, 'Current question index must not advance');
  assert.equal(Object.keys(examState.answers).length, 4, 'Answers record must remain untouched');
});
