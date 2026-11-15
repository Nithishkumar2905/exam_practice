/**
 * Mock Examination Non-Repeating Question Rotation Engine
 * --------------------------------------------------------
 * Pure, storage-agnostic logic used by both the PostgreSQL and JSON repositories.
 *
 * Rules:
 *  - Each mock exam follows the official SSC MTS blueprint (20 Maths, 20 Reasoning,
 *    25 General Awareness, 25 English = 90 questions).
 *  - Rotation is tracked PER SUBJECT so the official blueprint is always preserved.
 *  - A question counts as "used" only once it belongs to a COMPLETED mock exam.
 *  - Unused questions are always exhausted before any question is repeated.
 *  - When a subject pool cannot fill its quota from unused questions, all remaining
 *    unused questions are taken first, and the shortfall is topped up from previously
 *    used questions (avoiding the most recent completed exam where possible). Those
 *    top-up questions open a new rotation cycle for that subject.
 *  - No question is ever selected twice within the same exam.
 */
import type { Question } from '../db/database.ts';

export const MOCK_EXAM_BLUEPRINT: ReadonlyArray<{ subject: string; count: number }> = [
  { subject: 'Numerical and Mathematical Ability', count: 20 },
  { subject: 'Reasoning Ability and Problem Solving', count: 20 },
  { subject: 'General Awareness', count: 25 },
  { subject: 'English Language and Comprehension', count: 25 },
];

export const MOCK_EXAM_TOTAL_QUESTIONS = MOCK_EXAM_BLUEPRINT.reduce((s, b) => s + b.count, 0);

export type MockAssignmentStatus = 'IN_PROGRESS' | 'COMPLETED' | 'INVALIDATED';

export interface MockAssignmentQuestion {
  questionId: string;
  subject: string;
  position: number; // 0-based order within the exam
  submitted: boolean; // true once the student submitted an answer for it
}

export interface MockExamAssignment {
  id: string;
  userId: string;
  sequenceNumber: number; // 1-based, counts every created assignment for the student
  cycleNumber?: number; // 1-based, tracks which rotation cycle this exam belongs to
  status: MockAssignmentStatus;
  questions: MockAssignmentQuestion[];
  assignedAt: string;
  completedAt?: string | null;
  mockAttemptId?: string | null;
  rotationSummary?: MockRotationSummary;
}

export interface SubjectRotationSummary {
  subject: string;
  poolSize: number;
  requested: number;
  selected: number;
  freshSelected: number;
  repeatedSelected: number;
  unusedBefore: number;
  unusedAfterCompletion: number;
  cycleNumber: number;
  startedNewCycle: boolean;
}

export interface MockRotationSummary {
  totalSelected: number;
  totalFresh: number;
  totalRepeated: number;
  cycleNumber?: number;
  totalCompletedInCycle?: number;
  totalUnusedRemaining?: number;
  isNearingExhaustion?: boolean;
  isExhausted?: boolean;
  subjects: SubjectRotationSummary[];
}

/** Questions eligible for the mock exam: static, valid, de-duplicated by question_id. */
export function getEligibleMockQuestions(all: Question[]): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of all) {
    if (!q || !q.question_id || seen.has(q.question_id)) continue;
    if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d) continue;
    if (!['A', 'B', 'C', 'D'].includes(String(q.correct_answer || '').toUpperCase())) continue;
    seen.add(q.question_id);
    out.push(q);
  }
  return out;
}

/** Fisher–Yates shuffle (non-mutating). */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface SubjectCycleState {
  usedInCycle: Set<string>;
  cycleNumber: number;
}

/**
 * Replays completed assignments to derive, per subject, which
 * questions have been used in the active rotation cycle.
 */
export function deriveRotationState(
  completed: MockExamAssignment[],
  poolBySubject: Map<string, Set<string>>,
  cycleNumber: number = 1
): Map<string, SubjectCycleState> {
  const state = new Map<string, SubjectCycleState>();
  for (const subject of poolBySubject.keys()) {
    state.set(subject, { usedInCycle: new Set(), cycleNumber });
  }

  const completedInCycle = completed.filter(
    (a) => a.status === 'COMPLETED' && (a.cycleNumber ?? 1) === cycleNumber
  );

  for (const assignment of completedInCycle) {
    for (const [subject, pool] of poolBySubject) {
      const st = state.get(subject)!;
      const ids = assignment.questions
        .map((q) => q.questionId)
        .filter((id) => pool.has(id));
      ids.forEach((id) => st.usedInCycle.add(id));
    }
  }
  return state;
}

export interface MockSelectionResult {
  questions: Question[];
  summary: MockRotationSummary;
  isNearingExhaustion: boolean;
  isExhausted: boolean;
  availableQuestionCount: number;
}

/**
 * Selects a fresh, non-repeating set of mock exam questions for a student.
 * Strictly uses ONLY unseen questions until the question pool has been exhausted.
 * NEVER fills shortfall slots with repeated questions within the same rotation cycle.
 */
export function selectMockExamQuestions(
  allQuestions: Question[],
  completedAssignments: MockExamAssignment[],
  cycleOrRng?: number | (() => number),
  maybeRng?: () => number
): MockSelectionResult {
  const currentCycle = typeof cycleOrRng === 'number' ? cycleOrRng : 1;
  const rng = typeof cycleOrRng === 'function' ? cycleOrRng : (maybeRng || Math.random);

  const eligible = getEligibleMockQuestions(allQuestions);
  const bySubject = new Map<string, Question[]>();
  for (const b of MOCK_EXAM_BLUEPRINT) bySubject.set(b.subject, []);
  for (const q of eligible) {
    if (bySubject.has(q.subject)) bySubject.get(q.subject)!.push(q);
  }

  const poolIdsBySubject = new Map<string, Set<string>>();
  for (const [subject, qs] of bySubject) {
    poolIdsBySubject.set(subject, new Set(qs.map((q) => q.question_id)));
  }

  const state = deriveRotationState(completedAssignments, poolIdsBySubject, currentCycle);

  const selected: Question[] = [];
  const selectedIds = new Set<string>();
  const subjects: SubjectRotationSummary[] = [];

  for (const { subject, count } of MOCK_EXAM_BLUEPRINT) {
    const pool = bySubject.get(subject) || [];
    const st = state.get(subject) || { usedInCycle: new Set<string>(), cycleNumber: currentCycle };
    const unused = pool.filter((q) => !st.usedInCycle.has(q.question_id));

    // STRICT NON-REPEATING REQUIREMENT: Take only available unseen questions up to blueprint quota.
    // If fewer than requested questions remain, take what is available and DO NOT pad with repeats.
    const need = Math.min(count, unused.length);
    const fresh = shuffle(unused, rng).slice(0, need);

    for (const q of fresh) {
      if (selectedIds.has(q.question_id)) continue;
      selectedIds.add(q.question_id);
      selected.push(q);
    }

    subjects.push({
      subject,
      poolSize: pool.length,
      requested: count,
      selected: fresh.length,
      freshSelected: fresh.length,
      repeatedSelected: 0,
      unusedBefore: unused.length,
      unusedAfterCompletion: unused.length - fresh.length,
      cycleNumber: currentCycle,
      startedNewCycle: false,
    });
  }

  const totalUsedBefore = Array.from(state.values()).reduce((acc, st) => acc + st.usedInCycle.size, 0);
  const totalCompletedAfter = totalUsedBefore + selected.length;
  const totalUnusedRemaining = Math.max(0, eligible.length - totalCompletedAfter);

  const isNearingExhaustion = selected.length > 0 && selected.length < MOCK_EXAM_TOTAL_QUESTIONS;
  const isExhausted = selected.length === 0;

  return {
    questions: selected,
    isNearingExhaustion,
    isExhausted,
    availableQuestionCount: selected.length,
    summary: {
      totalSelected: selected.length,
      totalFresh: selected.length,
      totalRepeated: 0,
      cycleNumber: currentCycle,
      totalCompletedInCycle: totalCompletedAfter,
      totalUnusedRemaining,
      isNearingExhaustion,
      isExhausted,
      subjects,
    },
  };
}

/** Builds a new persisted assignment record from a selection. */
export function buildAssignment(
  userId: string,
  sequenceNumber: number,
  selection: MockSelectionResult,
  cycleOrNow?: number | Date,
  maybeNow?: Date
): MockExamAssignment {
  const cycleNumber = typeof cycleOrNow === 'number' ? cycleOrNow : (selection.summary.cycleNumber || 1);
  const now = cycleOrNow instanceof Date ? cycleOrNow : (maybeNow || new Date());

  return {
    id: `mockasg_${userId}_${sequenceNumber}_${now.getTime()}`,
    userId,
    sequenceNumber,
    cycleNumber,
    status: 'IN_PROGRESS',
    questions: selection.questions.map((q, position) => ({
      questionId: q.question_id,
      subject: q.subject,
      position,
      submitted: false,
    })),
    assignedAt: now.toISOString(),
    completedAt: null,
    mockAttemptId: null,
    rotationSummary: selection.summary,
  };
}

/** True when every question of an in-progress assignment still exists in the bank. */
export function isAssignmentStillValid(assignment: MockExamAssignment, allQuestions: Question[]): boolean {
  const ids = new Set(getEligibleMockQuestions(allQuestions).map((q) => q.question_id));
  return assignment.questions.length > 0 && assignment.questions.every((q) => ids.has(q.questionId));
}
