/**
 * ACCESSPREP-X Accessible Question & Option Reading Utility
 * Formats question stems, full question with options, all options, and individual options
 * for screen-reader and Web Speech API TTS output adhering to WCAG 2.2 AA.
 */

import { Question } from '../db/database.ts';

/**
 * Format complete question with subject context and all four options
 */
export function formatFullQuestionPrompt(q: Question, idx?: number, total?: number): string {
  const prefix =
    idx !== undefined && total !== undefined
      ? `Question ${idx + 1} of ${total}. Section: ${q.subject}. `
      : `Section: ${q.subject}. `;

  return `${prefix}${q.question_text}. Option A: ${q.option_a}. Option B: ${q.option_b}. Option C: ${q.option_c}. Option D: ${q.option_d}. What is your answer?`;
}

/**
 * Format question stem text only (without options)
 */
export function formatQuestionStemOnly(q: Question, idx?: number, total?: number): string {
  const prefix =
    idx !== undefined && total !== undefined
      ? `Question ${idx + 1} of ${total}. Section: ${q.subject}. `
      : `Section: ${q.subject}. `;

  return `${prefix}${q.question_text}.`;
}

/**
 * Format all options with clear labels (A, B, C, D)
 */
export function formatAllOptionsPrompt(q: Question): string {
  return `The options are: Option A: ${q.option_a}. Option B: ${q.option_b}. Option C: ${q.option_c}. Option D: ${q.option_d}.`;
}

/**
 * Format an individual option by key
 */
export function formatSingleOptionPrompt(q: Question, opt: 'A' | 'B' | 'C' | 'D'): string {
  const key = `option_${opt.toLowerCase()}` as keyof Question;
  const val = q[key] || '';
  return `Option ${opt}: ${val}.`;
}

/**
 * Format flashcard question for spaced repetition revision session
 */
export function formatFlashcardQuestionPrompt(
  card: { subject: string; topic: string; questionText: string },
  idx?: number,
  total?: number
): string {
  const prefix =
    idx !== undefined && total !== undefined
      ? `Revision Card ${idx + 1} of ${total}. Subject: ${card.subject}, Topic: ${card.topic}. `
      : `Subject: ${card.subject}, Topic: ${card.topic}. `;

  return `${prefix}${card.questionText}.`;
}

/**
 * Format flashcard answer & explanation
 */
export function formatFlashcardAnswerPrompt(card: {
  correctAnswer: string;
  explanation: string;
}): string {
  const cleanExp = card.explanation.trim().replace(/\.+$/, '');
  return `Answer: ${card.correctAnswer}. Explanation: ${cleanExp}.`;
}
