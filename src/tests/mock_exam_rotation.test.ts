import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_EXAM_BLUEPRINT,
  MOCK_EXAM_TOTAL_QUESTIONS,
  getEligibleMockQuestions,
  selectMockExamQuestions,
  buildAssignment,
  deriveRotationState,
  isAssignmentStillValid,
  type MockExamAssignment,
} from '../utils/mockExamRotation.ts';
import { loadQuestions, Question } from '../db/database.ts';
import { getRepository } from '../db/repository.ts';
import { evaluateSubmission } from '../utils/scoring.ts';

test('1. Question Repository: exactly 400 eligible mock questions, 100 per subject', () => {
  const allQ = loadQuestions();
  const eligible = getEligibleMockQuestions(allQ);
  assert.equal(eligible.length, 400, 'Expected exactly 400 eligible mock questions in bank');

  const bySubject: Record<string, number> = {};
  for (const q of eligible) {
    bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
  }

  assert.equal(bySubject['Numerical and Mathematical Ability'], 100);
  assert.equal(bySubject['Reasoning Ability and Problem Solving'], 100);
  assert.equal(bySubject['General Awareness'], 100);
  assert.equal(bySubject['English Language and Comprehension'], 100);
});

test('2. Single Mock Exam adheres strictly to the 90-question SSC MTS blueprint', () => {
  const allQ = loadQuestions();
  const selection = selectMockExamQuestions(allQ, []);
  assert.equal(selection.questions.length, MOCK_EXAM_TOTAL_QUESTIONS);
  assert.equal(selection.questions.length, 90);

  // Check unique questions in the exam
  const uniqueIds = new Set(selection.questions.map((q) => q.question_id));
  assert.equal(uniqueIds.size, 90, 'No question may ever be duplicated in the same exam');

  // Verify subject blueprint breakdown
  const bySubject: Record<string, number> = {};
  for (const q of selection.questions) {
    bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
  }

  assert.equal(bySubject['Numerical and Mathematical Ability'], 20);
  assert.equal(bySubject['Reasoning Ability and Problem Solving'], 20);
  assert.equal(bySubject['General Awareness'], 25);
  assert.equal(bySubject['English Language and Comprehension'], 25);
});

test('3. Non-repeating rotation across Mock Exams 1 to 4 (90, 180, 270, 360 fresh questions)', () => {
  const allQ = loadQuestions();
  const completedAssignments: MockExamAssignment[] = [];
  const seenAllQuestions = new Set<string>();

  for (let examNum = 1; examNum <= 4; examNum++) {
    const selection = selectMockExamQuestions(allQ, completedAssignments);
    assert.equal(selection.questions.length, 90, `Exam ${examNum} must have 90 questions`);

    const currentExamIds = new Set(selection.questions.map((q) => q.question_id));
    assert.equal(currentExamIds.size, 90, `Exam ${examNum} has internal duplicates`);

    // Verify ZERO overlap with any previously completed examination
    for (const id of currentExamIds) {
      assert.ok(
        !seenAllQuestions.has(id),
        `Question ${id} repeated in Exam ${examNum} before the question bank was exhausted!`
      );
      seenAllQuestions.add(id);
    }

    assert.equal(
      selection.summary.totalFresh,
      90,
      `Exam ${examNum} should have 90 fresh questions (got ${selection.summary.totalFresh})`
    );
    assert.equal(
      selection.summary.totalRepeated,
      0,
      `Exam ${examNum} should have 0 repeated questions (got ${selection.summary.totalRepeated})`
    );

    // Build completed assignment to simulate successful completion
    const asg = buildAssignment('usr_test_student', examNum, selection);
    asg.status = 'COMPLETED';
    asg.completedAt = new Date().toISOString();
    completedAssignments.push(asg);

    assert.equal(
      seenAllQuestions.size,
      examNum * 90,
      `Cumulative unique questions used after Exam ${examNum} should be ${examNum * 90}`
    );
  }

  assert.equal(seenAllQuestions.size, 360, 'After 4 exams, exactly 360 questions must have been used');
});

test('4. Mock Exam 5 strictly uses only remaining 40 unseen questions (never repeats prematurely)', () => {
  const allQ = loadQuestions();
  const completedAssignments: MockExamAssignment[] = [];
  const seenInFirstFour = new Set<string>();

  for (let examNum = 1; examNum <= 4; examNum++) {
    const selection = selectMockExamQuestions(allQ, completedAssignments, 1);
    selection.questions.forEach((q) => seenInFirstFour.add(q.question_id));
    const asg = buildAssignment('usr_test_student', examNum, selection, 1);
    asg.status = 'COMPLETED';
    asg.completedAt = new Date().toISOString();
    completedAssignments.push(asg);
  }

  assert.equal(seenInFirstFour.size, 360, 'First 4 exams must use 360 distinct questions');

  // Now Exam 5
  const exam5 = selectMockExamQuestions(allQ, completedAssignments, 1);
  assert.equal(exam5.questions.length, 40, 'Exam 5 must contain exactly the 40 remaining unseen questions');
  assert.equal(exam5.isNearingExhaustion, true, 'Exam 5 must flag isNearingExhaustion');
  assert.equal(exam5.isExhausted, false);
  assert.equal(exam5.availableQuestionCount, 40);

  // Verify no internal duplicates
  const exam5Ids = new Set(exam5.questions.map((q) => q.question_id));
  assert.equal(exam5Ids.size, 40, 'Exam 5 must have 40 distinct questions');

  // Verify ZERO questions in Exam 5 were seen in Exams 1-4
  for (const id of exam5Ids) {
    assert.ok(!seenInFirstFour.has(id), `Question ${id} in Exam 5 was already seen in previous exams!`);
  }

  // Math: 20 fresh (100 total), Reasoning: 20 fresh (100 total), GA: 0, English: 0
  assert.equal(exam5.summary.totalFresh, 40);
  assert.equal(exam5.summary.totalRepeated, 0);

  const mathSummary = exam5.summary.subjects.find((s) => s.subject === 'Numerical and Mathematical Ability')!;
  assert.equal(mathSummary.freshSelected, 20);
  assert.equal(mathSummary.repeatedSelected, 0);

  const reasoningSummary = exam5.summary.subjects.find((s) => s.subject === 'Reasoning Ability and Problem Solving')!;
  assert.equal(reasoningSummary.freshSelected, 20);
  assert.equal(reasoningSummary.repeatedSelected, 0);

  const gaSummary = exam5.summary.subjects.find((s) => s.subject === 'General Awareness')!;
  assert.equal(gaSummary.freshSelected, 0);
  assert.equal(gaSummary.repeatedSelected, 0);

  const engSummary = exam5.summary.subjects.find((s) => s.subject === 'English Language and Comprehension')!;
  assert.equal(engSummary.freshSelected, 0);
  assert.equal(engSummary.repeatedSelected, 0);
});

test('5. In-progress exams do NOT exhaust questions until COMPLETED', () => {
  const allQ = loadQuestions();
  const completedAssignments: MockExamAssignment[] = [];

  // Assignment 1 is created but remains IN_PROGRESS (e.g. candidate abandoned or did not finish)
  const selection1 = selectMockExamQuestions(allQ, completedAssignments);
  const asg1 = buildAssignment('usr_in_progress_test', 1, selection1);
  asg1.status = 'IN_PROGRESS';

  // State derivation based only on COMPLETED
  const state = deriveRotationState(
    [asg1],
    new Map([['General Awareness', new Set(allQ.filter((q) => q.subject === 'General Awareness').map((q) => q.question_id))]])
  );
  assert.equal(
    state.get('General Awareness')!.usedInCycle.size,
    0,
    'In-progress assignments must not mark questions as consumed'
  );
});

test('6. Repository & Persistence: createMockAssignment, resume active, and completeMockAssignment', async () => {
  const repo = await getRepository();
  const testUserId = `usr_rot_test_${Date.now()}`;
  const allQ = loadQuestions();

  // 1. Initial rotation selection
  const selection1 = selectMockExamQuestions(allQ, []);
  const assignment1 = buildAssignment(testUserId, 1, selection1);

  const created1 = await repo.createMockAssignment(assignment1);
  assert.equal(created1.id, assignment1.id);
  assert.equal(created1.status, 'IN_PROGRESS');

  // 2. Refresh/resume test: attempting to create or fetch while IN_PROGRESS returns the SAME assignment
  const activeAssignments = await repo.getMockAssignments(testUserId);
  const active = activeAssignments.find((a) => a.status === 'IN_PROGRESS');
  assert.ok(active, 'Active in-progress assignment must exist');
  assert.equal(active!.id, assignment1.id);
  assert.equal(active!.questions.length, 90);

  // 3. Verification of question validity
  assert.equal(isAssignmentStillValid(active!, allQ), true);

  // 4. Complete assignment 1
  const attemptId = `mock_test_${Date.now()}`;
  await repo.completeMockAssignment(
    assignment1.id,
    active!.questions.slice(0, 10).map((q) => q.questionId),
    {
      id: attemptId,
      userId: testUserId,
      examTitle: 'SSC MTS 2026 Official Pattern Mock Examination #1',
      session1Score: 45,
      session2Score: 60,
      totalScore: 105,
      totalMax: 270,
      percentage: 38.89,
      qualified: true,
      totalTimeSeconds: 3600,
      answers: {},
      completedAt: new Date().toISOString(),
      assignmentId: assignment1.id,
      sequenceNumber: 1,
    },
    {
      id: `hist_${attemptId}`,
      userId: testUserId,
      type: 'mock_exam',
      title: 'SSC MTS 2026 Official Pattern Mock Examination #1',
      summary: 'Score: 105/270',
      durationSeconds: 3600,
      timestamp: new Date().toISOString(),
    }
  );

  const updatedAsg = await repo.getMockAssignmentById(assignment1.id);
  assert.equal(updatedAsg!.status, 'COMPLETED');
  assert.equal(updatedAsg!.mockAttemptId, attemptId);

  // 5. Subsequent exam must select 90 completely fresh questions
  const history = await repo.getMockAssignments(testUserId);
  const selection2 = selectMockExamQuestions(allQ, history);
  assert.equal(selection2.questions.length, 90);

  const exam1Ids = new Set(assignment1.questions.map((q) => q.questionId));
  for (const q of selection2.questions) {
    assert.ok(
      !exam1Ids.has(q.question_id),
      `Exam 2 selected question ${q.question_id} which was already completed in Exam 1`
    );
  }
});

test('7. Multiple concurrent calls while IN_PROGRESS return identical question set (Page Refresh Guard)', async () => {
  const repo = await getRepository();
  const testUserId = `usr_refresh_test_${Date.now()}`;
  const allQ = loadQuestions();

  // Student opens mock exam -> creates assignment
  const selection = selectMockExamQuestions(allQ, []);
  const initialAssignment = buildAssignment(testUserId, 1, selection);
  const created = await repo.createMockAssignment(initialAssignment);

  // Candidate refreshes page multiple times:
  for (let i = 0; i < 5; i++) {
    const assignments = await repo.getMockAssignments(testUserId);
    const active = assignments.find((a) => a.status === 'IN_PROGRESS');
    assert.ok(active, `Active assignment must exist on refresh #${i + 1}`);
    assert.equal(active!.id, created.id);
    assert.equal(active!.questions.length, 90);
    assert.deepEqual(
      active!.questions.map((q) => q.questionId),
      created.questions.map((q) => q.questionId),
      `Question list and order must be 100% identical on refresh #${i + 1}`
    );
  }
});

test('8. Double-submit guard prevents duplicate attempt recording', async () => {
  const repo = await getRepository();
  const testUserId = `usr_double_sub_${Date.now()}`;
  const allQ = loadQuestions();

  const selection = selectMockExamQuestions(allQ, []);
  const assignment = buildAssignment(testUserId, 1, selection);
  await repo.createMockAssignment(assignment);

  const attemptId = `mock_dbl_${Date.now()}`;
  const attemptPayload = {
    id: attemptId,
    userId: testUserId,
    examTitle: 'SSC MTS 2026 Official Pattern Mock Examination #1',
    session1Score: 40,
    session2Score: 50,
    totalScore: 90,
    totalMax: 270,
    percentage: 33.33,
    qualified: true,
    totalTimeSeconds: 4000,
    answers: {},
    completedAt: new Date().toISOString(),
    assignmentId: assignment.id,
    sequenceNumber: 1,
  };
  const historyPayload = {
    id: `hist_${attemptId}`,
    userId: testUserId,
    type: 'mock_exam' as const,
    title: 'SSC MTS 2026 Official Pattern Mock Examination #1',
    summary: 'Score: 90/270',
    durationSeconds: 4000,
    timestamp: new Date().toISOString(),
  };

  // First submit succeeds
  await repo.completeMockAssignment(assignment.id, ['SSC-MTS-NUM-001'], attemptPayload, historyPayload);

  // Second submit on same completed assignment throws error MOCK_ASSIGNMENT_NOT_ACTIVE
  await assert.rejects(
    async () => {
      await repo.completeMockAssignment(assignment.id, ['SSC-MTS-NUM-001'], attemptPayload, historyPayload);
    },
    { message: 'MOCK_ASSIGNMENT_NOT_ACTIVE' }
  );
});

test('9. When all 400 questions are exhausted, returns 0 questions and isExhausted flag', () => {
  const allQ = loadQuestions();
  const completedAssignments: MockExamAssignment[] = [];

  // Complete exams 1 to 5 (consuming 90 + 90 + 90 + 90 + 40 = 400 questions)
  for (let examNum = 1; examNum <= 5; examNum++) {
    const selection = selectMockExamQuestions(allQ, completedAssignments, 1);
    const asg = buildAssignment('usr_exhaust_test', examNum, selection, 1);
    asg.status = 'COMPLETED';
    asg.completedAt = new Date().toISOString();
    completedAssignments.push(asg);
  }

  // Attempting Exam 6 without cycle reset
  const exam6 = selectMockExamQuestions(allQ, completedAssignments, 1);
  assert.equal(exam6.questions.length, 0, 'No questions must be returned when bank is exhausted');
  assert.equal(exam6.isExhausted, true, 'isExhausted flag must be true');
  assert.equal(exam6.isNearingExhaustion, false);
  assert.equal(exam6.availableQuestionCount, 0);
});

test('10. Cycle reset preserves history and starts Cycle 2 with fresh 90 questions in newly shuffled order', async () => {
  const repo = await getRepository();
  const testUserId = `usr_cycle_reset_${Date.now()}`;
  const allQ = loadQuestions();

  const cycleBefore = await repo.getMockCycle(testUserId);
  assert.equal(cycleBefore, 1, 'Default cycle must be 1');

  // Complete Cycle 1 Exam 1
  const sel1 = selectMockExamQuestions(allQ, [], 1);
  const asg1 = buildAssignment(testUserId, 1, sel1, 1);
  await repo.createMockAssignment(asg1);
  await repo.completeMockAssignment(
    asg1.id,
    sel1.questions.map((q) => q.question_id),
    {
      id: `att_${asg1.id}`,
      userId: testUserId,
      examTitle: 'Mock Exam #1',
      session1Score: 60,
      session2Score: 60,
      totalScore: 120,
      totalMax: 270,
      percentage: 44.4,
      qualified: true,
      totalTimeSeconds: 3000,
      answers: {},
      completedAt: new Date().toISOString(),
      assignmentId: asg1.id,
      sequenceNumber: 1,
    },
    {
      id: `hist_${asg1.id}`,
      userId: testUserId,
      type: 'mock_exam',
      title: 'Mock Exam #1',
      summary: 'Score: 120/270',
      durationSeconds: 3000,
      timestamp: new Date().toISOString(),
    }
  );

  // Now trigger resetMockCycle
  const newCycle = await repo.resetMockCycle(testUserId);
  assert.equal(newCycle, 2, 'New cycle must be 2');

  const cycleAfter = await repo.getMockCycle(testUserId);
  assert.equal(cycleAfter, 2);

  // Verify historical attempt is still preserved in database!
  const userAttempts = await repo.getMockAttempts(testUserId);
  assert.equal(userAttempts.length, 1, 'Historical attempts must not be deleted on cycle reset');
  assert.equal(userAttempts[0].totalScore, 120);

  // Start exam in Cycle 2: must have 90 questions
  const history = await repo.getMockAssignments(testUserId);
  const selCycle2 = selectMockExamQuestions(allQ, history, 2);
  assert.equal(selCycle2.questions.length, 90, 'Cycle 2 must provide a full 90 questions');
  assert.equal(selCycle2.summary.cycleNumber, 2);
});

test('11. Proportional timer and scoring verification for Exam 5 (40 questions)', () => {
  const allQ = loadQuestions();
  // Simulate 40-question exam submissions (20 Math + 20 Reasoning)
  const mathQ = allQ.filter((q) => q.subject === 'Numerical and Mathematical Ability').slice(0, 20);
  const reasoningQ = allQ.filter((q) => q.subject === 'Reasoning Ability and Problem Solving').slice(0, 20);
  const exam5Questions = [...mathQ, ...reasoningQ];

  assert.equal(exam5Questions.length, 40);

  // Standard timer calculation: 60s per question -> 2400s (40 min)
  const standardSeconds = exam5Questions.length * 60;
  assert.equal(standardSeconds, 2400);

  // PwD compensatory timer calculation: 80s per question -> 3200s (53.33 min)
  const pwdSeconds = exam5Questions.length * 80;
  assert.equal(pwdSeconds, 3200);

  // Proportional scoring: 40 questions * 3 = 120 max marks
  const submissions = exam5Questions.map((q) => ({
    questionId: q.question_id,
    subject: q.subject,
    selectedOption: q.correct_answer, // Answer all correctly
    correctAnswer: q.correct_answer,
    timeSpentSeconds: 60,
  }));

  const result = evaluateSubmission(submissions);
  assert.equal(result.totalMax, 120, '40-question exam must have maximum marks of 120');
  assert.equal(result.totalScore, 120, 'All correct answers must achieve full 120 marks');
  assert.equal(result.session1Score, 120);
  assert.equal(result.session2Score, 0);
  assert.equal(result.totalPercentage, 100);
});

test('12. Complete 5-Exam Rotation Table: 90 -> 90 -> 90 -> 90 -> 40 = exactly 400 questions used', () => {
  const allQ = loadQuestions();
  const completedAssignments: MockExamAssignment[] = [];
  const cumulativeUsed = new Set<string>();

  const expectedCounts = [90, 90, 90, 90, 40];

  for (let i = 0; i < expectedCounts.length; i++) {
    const examNum = i + 1;
    const expectedQ = expectedCounts[i];

    const sel = selectMockExamQuestions(allQ, completedAssignments, 1);
    assert.equal(sel.questions.length, expectedQ, `Exam ${examNum} must have ${expectedQ} questions`);

    for (const q of sel.questions) {
      assert.ok(!cumulativeUsed.has(q.question_id), `Question ${q.question_id} repeated prematurely in Exam ${examNum}`);
      cumulativeUsed.add(q.question_id);
    }

    if (examNum === 5) {
      assert.equal(sel.isNearingExhaustion, true);
      assert.equal(sel.isExhausted, false);
    } else {
      assert.equal(sel.isNearingExhaustion, false);
      assert.equal(sel.isExhausted, false);
    }

    const asg = buildAssignment('usr_table_test', examNum, sel, 1);
    asg.status = 'COMPLETED';
    asg.completedAt = new Date().toISOString();
    completedAssignments.push(asg);
  }

  assert.equal(cumulativeUsed.size, 400, 'All 400 questions must be consumed after Exam 5');
});

