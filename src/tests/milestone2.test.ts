import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PRACTICE_MODULES,
  parseVoicePracticeModuleChoice,
  filterQuestionsByModule,
  parseFeedbackControlCommand,
} from '../utils/voicePracticeModules.ts';
import {
  VOICE_PREFERENCES_STORAGE_KEY,
  DEFAULT_VOICE_PREFERENCES,
  clampSpeechRate,
  clampSpeechPitch,
  clampSpeechVolume,
  normalizeVoicePreferences,
  loadVoicePreferences,
  saveVoicePreferences,
} from '../utils/voicePreferences.ts';
import {
  computeReviewCounts,
  filterReviewQuestions,
  type QuestionReviewItem,
} from '../components/results/QuestionReview.tsx';
import type { Question } from '../db/database.ts';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    question_id: 'Q1',
    subject: 'Numerical and Mathematical Ability',
    topic: 'Percentages',
    subtopic: 'Basic',
    difficulty: 'easy',
    difficulty_label: 'Easy',
    question_text: 'Sample question?',
    option_a: '10',
    option_b: '20',
    option_c: '30',
    option_d: '40',
    correct_answer: 'B',
    explanation: 'Sample explanation.',
    source_name: 'SSC MTS',
    source_reference: 'Ref 1',
    ...overrides,
  } as Question;
}

test('Module 1: parseVoicePracticeModuleChoice recognizes Maths and Reasoning aliases', () => {
  assert.equal(parseVoicePracticeModuleChoice('Maths'), 'maths');
  assert.equal(parseVoicePracticeModuleChoice('I want to practice Mathematics'), 'maths');
  assert.equal(parseVoicePracticeModuleChoice('Numerical and Mathematical Ability'), 'maths');
  assert.equal(parseVoicePracticeModuleChoice('Reasoning Ability'), 'reasoning');
  assert.equal(parseVoicePracticeModuleChoice('logical reasoning please'), 'reasoning');
  assert.equal(parseVoicePracticeModuleChoice('open dashboard'), null);
});

test('Module 1: filterQuestionsByModule strictly isolates subjects and deduplicates', () => {
  const pool: Question[] = [
    makeQuestion({ question_id: 'M1', subject: PRACTICE_MODULES.maths.subject }),
    makeQuestion({ question_id: 'M1', subject: PRACTICE_MODULES.maths.subject }), // duplicate
    makeQuestion({ question_id: 'R1', subject: PRACTICE_MODULES.reasoning.subject }),
    makeQuestion({ question_id: 'G1', subject: 'General Awareness' }),
    makeQuestion({ question_id: 'E1', subject: 'English Language and Comprehension' }),
  ];

  const mathsOnly = filterQuestionsByModule(pool, 'maths');
  assert.equal(mathsOnly.length, 1);
  assert.equal(mathsOnly[0].question_id, 'M1');

  const reasoningOnly = filterQuestionsByModule(pool, 'reasoning');
  assert.equal(reasoningOnly.length, 1);
  assert.equal(reasoningOnly[0].question_id, 'R1');
});

test('Module 2: parseFeedbackControlCommand parses Next and repeat commands accurately', () => {
  assert.equal(parseFeedbackControlCommand('Next'), 'next');
  assert.equal(parseFeedbackControlCommand('continue'), 'next');
  assert.equal(parseFeedbackControlCommand('Next Question please'), null); // exact match for next/continue/next question
  assert.equal(parseFeedbackControlCommand('next question'), 'next');
  assert.equal(parseFeedbackControlCommand('repeat explanation'), 'repeat_explanation');
  assert.equal(parseFeedbackControlCommand('repeat question'), 'repeat_question');
  assert.equal(parseFeedbackControlCommand('read correct answer'), 'read_correct_answer');
  assert.equal(parseFeedbackControlCommand('option A'), null);
});

test('Module 5: voicePreferences clamps values and persists cleanly to localStorage', () => {
  assert.equal(clampSpeechRate(0.1), 0.5);
  assert.equal(clampSpeechRate(3.0), 2.0);
  assert.equal(clampSpeechRate(1.24), 1.2);

  assert.equal(clampSpeechPitch(0.2), 0.5);
  assert.equal(clampSpeechPitch(2.5), 1.5);

  assert.equal(clampSpeechVolume(-1), 0);
  assert.equal(clampSpeechVolume(150), 100);

  const normalized = normalizeVoicePreferences({
    speechRate: 1.4,
    speechPitch: 0.9,
    speechVolume: 75,
    selectedVoiceURI: 'Voice-En-IN',
  });
  assert.deepEqual(normalized, {
    speechRate: 1.4,
    speechPitch: 0.9,
    speechVolume: 75,
    selectedVoiceURI: 'Voice-En-IN',
  });

  // Mock global localStorage for Node test environment
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  saveVoicePreferences(normalized);
  const loaded = loadVoicePreferences();
  assert.deepEqual(loaded, normalized);

  store.set(VOICE_PREFERENCES_STORAGE_KEY, '{corrupt json');
  assert.deepEqual(loadVoicePreferences(), DEFAULT_VOICE_PREFERENCES);
});

test('Module 4: QuestionReview computes counts and filters items accurately', () => {
  const sampleItems: QuestionReviewItem[] = [
    {
      questionNumber: 1,
      questionId: 'Q1',
      questionText: '2 + 2 = ?',
      subject: 'Maths',
      selectedOption: 'B',
      correctOption: 'B',
      status: 'correct',
      marksDelta: 3,
    },
    {
      questionNumber: 2,
      questionId: 'Q2',
      questionText: 'Capital of India?',
      subject: 'General Awareness',
      selectedOption: 'A',
      correctOption: 'C',
      status: 'incorrect',
      marksDelta: -1,
      markedForReview: true,
    },
    {
      questionNumber: 3,
      questionId: 'Q3',
      questionText: 'Synonym of Brave?',
      subject: 'English',
      selectedOption: null,
      correctOption: 'D',
      status: 'unattempted',
      marksDelta: 0,
    },
  ];

  const counts = computeReviewCounts(sampleItems);
  assert.deepEqual(counts, {
    all: 3,
    incorrect: 1,
    correct: 1,
    unattempted: 1,
    review: 1,
  });

  assert.equal(filterReviewQuestions(sampleItems, 'all').length, 3);
  assert.deepEqual(
    filterReviewQuestions(sampleItems, 'incorrect').map((i) => i.questionId),
    ['Q2']
  );
  assert.deepEqual(
    filterReviewQuestions(sampleItems, 'correct').map((i) => i.questionId),
    ['Q1']
  );
  assert.deepEqual(
    filterReviewQuestions(sampleItems, 'unattempted').map((i) => i.questionId),
    ['Q3']
  );
  assert.deepEqual(
    filterReviewQuestions(sampleItems, 'review').map((i) => i.questionId),
    ['Q2']
  );
});

test('Milestone 2 integration wiring & regression guards', () => {
  const root = process.cwd();

  const voicePracticeSrc = fs.readFileSync(
    path.join(root, 'src/screens/VoicePracticeScreen.tsx'),
    'utf8'
  );
  assert.ok(voicePracticeSrc.includes('SELECTING_MODULE'));
  assert.ok(voicePracticeSrc.includes('Choose Your Practice Module'));
  assert.ok(!voicePracticeSrc.includes('setTimeout(() => {\n            advanceToNextQuestion()'));
  assert.ok(!voicePracticeSrc.includes('Moving to next question.'));
  assert.ok(voicePracticeSrc.includes('Say Next or press Enter when you are ready.'));

  const quickActionsSrc = fs.readFileSync(
    path.join(root, 'src/components/dashboard/QuickActions.tsx'),
    'utf8'
  );
  assert.ok(quickActionsSrc.includes("sessionStorage.removeItem('practice_filter_subject')"));
  assert.ok(quickActionsSrc.includes("sessionStorage.removeItem('practice_filter_topic')"));

  const headerSrc = fs.readFileSync(path.join(root, 'src/components/Header.tsx'), 'utf8');
  assert.ok(headerSrc.includes('Voice Audio Controls'));
  assert.ok(headerSrc.includes('Test Voice'));

  const pilotSrc = fs.readFileSync(
    path.join(root, 'src/screens/PilotDemoScreen.tsx'),
    'utf8'
  );
  assert.ok(pilotSrc.includes('Session-wise Accuracy'));
  assert.ok(pilotSrc.includes('Speed vs Accuracy'));
  assert.ok(pilotSrc.includes('Listen to Performance Summary'));
  assert.ok(pilotSrc.includes('<QuestionReview'));

  const resultsSrc = fs.readFileSync(
    path.join(root, 'src/screens/ResultsScreen.tsx'),
    'utf8'
  );
  assert.ok(resultsSrc.includes('<QuestionReview'));
});
