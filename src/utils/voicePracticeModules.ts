/**
 * Voice Practice Pre-Session Module Selection & Feedback Helpers
 */
import type { Question } from '../db/database.ts';

export type PracticeModuleId = 'maths' | 'reasoning';

export interface PracticeModuleDefinition {
  id: PracticeModuleId;
  subject: string;
  label: string;
  title: string;
  description: string;
  ctaLabel: string;
  confirmationName: string;
}

export const PRACTICE_MODULES: Record<PracticeModuleId, PracticeModuleDefinition> = {
  maths: {
    id: 'maths',
    subject: 'Numerical and Mathematical Ability',
    label: 'Maths',
    title: 'Numerical and Mathematical Ability',
    description: 'Practice numerical aptitude, calculations, arithmetic, and mathematical problem-solving.',
    ctaLabel: 'Start Maths Practice',
    confirmationName: 'Mathematics',
  },
  reasoning: {
    id: 'reasoning',
    subject: 'Reasoning Ability and Problem Solving',
    label: 'Reasoning',
    title: 'Reasoning Ability',
    description: 'Practice logical reasoning, analytical reasoning, patterns, sequences, and problem-solving.',
    ctaLabel: 'Start Reasoning Practice',
    confirmationName: 'Reasoning Ability',
  },
};

export function parseVoicePracticeModuleChoice(transcript: string): PracticeModuleId | null {
  if (!transcript || typeof transcript !== 'string') return null;
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return null;

  const mathsAliases = [
    'numerical and mathematical ability',
    'numerical ability',
    'quantitative aptitude',
    'mathematics',
    'maths',
    'math',
  ];
  for (const alias of mathsAliases) {
    if (clean === alias || clean.includes(alias)) {
      return 'maths';
    }
  }

  const reasoningAliases = [
    'reasoning ability',
    'logical reasoning',
    'analytical reasoning',
    'reasoning',
  ];
  for (const alias of reasoningAliases) {
    if (clean === alias || clean.includes(alias)) {
      return 'reasoning';
    }
  }

  return null;
}

/**
 * Strictly filters questions by exact module subject identifier and deduplicates by question_id.
 */
export function filterQuestionsByModule(
  questions: Question[],
  moduleId: PracticeModuleId
): Question[] {
  const targetSubject = PRACTICE_MODULES[moduleId].subject;
  const seen = new Set<string>();
  const filtered: Question[] = [];

  for (const q of questions) {
    if (!q || q.subject !== targetSubject) continue;
    if (seen.has(q.question_id)) continue;
    seen.add(q.question_id);
    filtered.push(q);
  }

  return filtered;
}

export type FeedbackVoiceCommand =
  | 'next'
  | 'repeat_explanation'
  | 'repeat_question'
  | 'read_correct_answer';

export function parseFeedbackControlCommand(transcript: string): FeedbackVoiceCommand | null {
  if (!transcript || typeof transcript !== 'string') return null;
  const clean = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return null;

  if (clean === 'next' || clean === 'continue' || clean === 'next question') {
    return 'next';
  }
  if (clean.includes('repeat explanation') || clean.includes('read explanation')) {
    return 'repeat_explanation';
  }
  if (clean.includes('repeat question')) {
    return 'repeat_question';
  }
  if (clean.includes('read correct answer') || clean.includes('correct answer')) {
    return 'read_correct_answer';
  }
  return null;
}

