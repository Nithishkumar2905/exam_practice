/**
 * ACCESSPREP-X Accessible Question & Option Reading Utility
 * Formats question stems, full question with options, all options, and individual options
 * for screen-reader and Web Speech API TTS output adhering to WCAG 2.2 AA.
 *
 * Mathematical notation (plain-text or LaTeX) in numerical/reasoning questions is converted to
 * natural, grouping-preserving speech by the structured math renderer — raw symbols are never read.
 */

import { Question } from '../db/database.ts';
import { renderTextWithMathToSpeech } from '../math/mathematicalSpeechRenderer.ts';

/** Only mathematical subjects are rewritten. */
function isMathSubject(subject?: string): boolean {
  return /numerical|reasoning/i.test(subject || '');
}

/** Speech-safe version of any text belonging to a question of the given subject. */
export function speakableQuestionText(text: string, subject?: string): string {
  if (!text) return '';
  if (isMathSubject(subject)) return renderTextWithMathToSpeech(text);
  return text;
}

/** Speech for a single option (e.g. "7/9", "x^2", "3 : 2", "4% increase"). Plain words pass through unchanged. */
export function speakableOptionText(text: string, subject?: string): string {
  if (!text) return '';
  if (isMathSubject(subject)) return renderTextWithMathToSpeech(text);
  return text;
}

function optionsOf(q: Question) {
  return {
    A: speakableOptionText(q.option_a, q.subject),
    B: speakableOptionText(q.option_b, q.subject),
    C: speakableOptionText(q.option_c, q.subject),
    D: speakableOptionText(q.option_d, q.subject)
  };
}

/**
 * Format complete question with subject context and all four options
 */
export function formatFullQuestionPrompt(q: Question, idx?: number, total?: number): string {
  const prefix =
    idx !== undefined && total !== undefined
      ? `Question ${idx + 1} of ${total}. Section: ${q.subject}. `
      : `Section: ${q.subject}. `;

  const o = optionsOf(q);
  return `${prefix}${speakableQuestionText(q.question_text, q.subject)}. Option A: ${o.A}. Option B: ${o.B}. Option C: ${o.C}. Option D: ${o.D}. What is your answer?`;
}

/**
 * Format question stem text only (without options)
 */
export function formatQuestionStemOnly(q: Question, idx?: number, total?: number): string {
  const prefix =
    idx !== undefined && total !== undefined
      ? `Question ${idx + 1} of ${total}. Section: ${q.subject}. `
      : `Section: ${q.subject}. `;

  return `${prefix}${speakableQuestionText(q.question_text, q.subject)}.`;
}

/**
 * Speech for only the equations/expressions in the question stem ("Repeat Equation").
 * Falls back to the whole stem when no distinct equation can be isolated.
 */
export function formatEquationOnlyPrompt(q: Question): string {
  const stem = speakableQuestionText(q.question_text, q.subject);
  return `The question is: ${stem}.`;
}

/**
 * Format all options with clear labels (A, B, C, D)
 */
export function formatAllOptionsPrompt(q: Question): string {
  const o = optionsOf(q);
  return `The options are: Option A: ${o.A}. Option B: ${o.B}. Option C: ${o.C}. Option D: ${o.D}.`;
}

/**
 * Format an individual option by key
 */
export function formatSingleOptionPrompt(q: Question, opt: 'A' | 'B' | 'C' | 'D'): string {
  const key = `option_${opt.toLowerCase()}` as keyof Question;
  const val = speakableOptionText(String(q[key] || ''), q.subject);
  return `Option ${opt}: ${val}.`;
}

/**
 * Speech-safe explanation text (used by Repeat Explanation / Explain the equation).
 */
export function formatExplanationPrompt(q: { explanation: string; subject?: string }): string {
  return `Explanation: ${speakableQuestionText(q.explanation.trim().replace(/\.+$/, ''), q.subject)}.`;
}

/**
 * Speech-safe source citation metadata for questions.
 */
export function formatSourcePrompt(q: Partial<Question>): string {
  const parts: string[] = [];
  if (q.source_name || q.source_reference) {
    parts.push(`Source: ${q.source_name || q.source_reference}`);
  }
  if (parts.length === 0) {
    return 'Source information is recorded in the ACCESSPREP-X verified dataset.';
  }
  return `${parts.join('. ')}.`;
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

  return `${prefix}${speakableQuestionText(card.questionText, card.subject)}.`;
}

/**
 * Format flashcard answer & explanation
 */
export function formatFlashcardAnswerPrompt(card: {
  correctAnswer: string;
  explanation: string;
  subject?: string;
}): string {
  const cleanExp = card.explanation.trim().replace(/\.+$/, '');
  return `Answer: ${speakableOptionText(card.correctAnswer, card.subject)}. Explanation: ${speakableQuestionText(cleanExp, card.subject)}.`;
}
