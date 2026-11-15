import {
  User,
  AccessibilitySettings,
  Question,
  PracticeAttempt,
  MockExamAttempt,
  DiagnosticAttempt,
  RevisionItem,
  TopicMasteryRecord,
  LearningHistoryEntry,
  loadQuestions,
  getDb,
  saveDatabase
} from './database.ts';
import { query, withTransaction, isPostgresConnected, checkPostgresConnection } from './db_pool.ts';
import { updateBKT, classifyMasteryTier } from '../utils/bkt.ts';
import { calculateSM2, getNextReviewDate } from '../utils/sm2.ts';
import type { MockExamAssignment, MockAssignmentStatus } from '../utils/mockExamRotation.ts';

export interface SubjectAnalyticsBreakdown {
  subject: string;
  session: 'Session I' | 'Session II';
  attempted: number;
  correct: number;
  accuracy: number;
  avgTimeSeconds: number;
  speed: string;
  trend: string;
  status: 'Mastered' | 'Proficient' | 'Developing' | 'Novice' | 'No Data';
}

export interface ProgressAnalyticsResult {
  totalPracticeQuestions: number;
  practiceAccuracy: number;
  avgTimePerQuestionSeconds: number;
  totalMocksAttempted: number;
  recentMocks: MockExamAttempt[];
  overallReadinessScore: number;
  subjects: SubjectAnalyticsBreakdown[];
}

export interface QuestionFilter {
  subject?: string;
  topic?: string;
  difficulty?: string;
  search?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

export interface IDataRepository {
  readonly engineName: 'PostgreSQL' | 'File JSON Store';
  getUserById(id: string): Promise<User | null>;
  getUserByIdentifier(identifier: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUserProfile(id: string, updates: Partial<User>): Promise<User>;
  getAccessibilitySettings(userId: string): Promise<AccessibilitySettings>;
  saveAccessibilitySettings(settings: AccessibilitySettings): Promise<AccessibilitySettings>;
  getQuestions(filter: QuestionFilter): Promise<{ total: number; questions: Question[] }>;
  getQuestionById(id: string): Promise<Question | null>;
  recordPracticeAttempt(
    attempt: PracticeAttempt,
    bktUpdate: TopicMasteryRecord,
    sm2Update: RevisionItem,
    historyEntry: LearningHistoryEntry
  ): Promise<void>;
  recordMockAttempt(attempt: MockExamAttempt, historyEntry: LearningHistoryEntry): Promise<void>;
  getMockAttempts(userId: string): Promise<MockExamAttempt[]>;
  getMockAttemptById(id: string): Promise<MockExamAttempt | null>;
  // Mock Examination Non-Repeating Question Rotation
  getMockAssignments(userId: string): Promise<MockExamAssignment[]>;
  getMockAssignmentById(id: string): Promise<MockExamAssignment | null>;
  getMockCycle(userId: string): Promise<number>;
  resetMockCycle(userId: string): Promise<number>;
  /** Persists a new IN_PROGRESS assignment. Returns the existing active one instead if a race created it first. */
  createMockAssignment(assignment: MockExamAssignment): Promise<MockExamAssignment>;
  setMockAssignmentStatus(id: string, status: MockAssignmentStatus): Promise<void>;
  /** Atomically records the mock attempt + history and marks the assignment COMPLETED. */
  completeMockAssignment(
    assignmentId: string,
    submittedQuestionIds: string[],
    attempt: MockExamAttempt,
    historyEntry: LearningHistoryEntry
  ): Promise<void>;
  recordDiagnosticAttempt(
    attempt: DiagnosticAttempt,
    bktUpdates: TopicMasteryRecord[],
    historyEntry: LearningHistoryEntry
  ): Promise<DiagnosticAttempt>;
  getDiagnosticAttempts(userId: string): Promise<DiagnosticAttempt[]>;
  getDiagnosticAttemptById(id: string): Promise<DiagnosticAttempt | null>;
  getRevisionItems(userId: string): Promise<{
    totalCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    dueItems: any[];
    upcomingItems: any[];
  }>;
  reviewRevisionItem(userId: string, questionId: string, quality: number): Promise<RevisionItem>;
  getTopicMastery(userId: string): Promise<any[]>;
  getLearningHistory(userId: string): Promise<LearningHistoryEntry[]>;
  recordLearningHistory(entry: LearningHistoryEntry): Promise<void>;
  getProgressAnalytics(userId: string): Promise<ProgressAnalyticsResult>;
}

// -------------------------------------------------------------
// POSTGRESQL REPOSITORY IMPLEMENTATION (Parameterized SQL)
// -------------------------------------------------------------
export class PostgresRepository implements IDataRepository {
  readonly engineName = 'PostgreSQL' as const;

  async getUserById(id: string): Promise<User | null> {
    const res = await query<any>(
      `SELECT id, roll_number as "rollNumber", name, email, password_hash as "passwordHash",
              role, pwd_category as "pwdCategory", need_scribe as "needScribe",
              exam_region as "examRegion", exam_language as "examLanguage", created_at as "createdAt"
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getUserByIdentifier(identifier: string): Promise<User | null> {
    const clean = (identifier || '').toLowerCase();
    const res = await query<any>(
      `SELECT id, roll_number as "rollNumber", name, email, password_hash as "passwordHash",
              role, pwd_category as "pwdCategory", need_scribe as "needScribe",
              exam_region as "examRegion", exam_language as "examLanguage", created_at as "createdAt"
       FROM users
       WHERE LOWER(roll_number) = $1 OR LOWER(email) = $1
       LIMIT 1`,
      [clean]
    );
    return res.rows[0] || null;
  }

  async createUser(user: User): Promise<User> {
    await query(
      `INSERT INTO users (id, roll_number, name, email, password_hash, role, pwd_category, need_scribe, exam_region, exam_language, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        user.id,
        user.rollNumber,
        user.name,
        user.email,
        user.passwordHash,
        user.role,
        user.pwdCategory,
        Boolean(user.needScribe),
        user.examRegion,
        user.examLanguage,
        user.createdAt
      ]
    );
    return user;
  }

  async updateUserProfile(id: string, updates: Partial<User>): Promise<User> {
    const current = await this.getUserById(id);
    if (!current) throw new Error('User not found');

    const updated: User = {
      ...current,
      ...updates,
      id // preserve ID
    };

    await query(
      `UPDATE users
       SET name = $1, exam_region = $2, exam_language = $3, pwd_category = $4, need_scribe = $5
       WHERE id = $6`,
      [updated.name, updated.examRegion, updated.examLanguage, updated.pwdCategory, Boolean(updated.needScribe), id]
    );

    return updated;
  }

  async getAccessibilitySettings(userId: string): Promise<AccessibilitySettings> {
    const res = await query<any>(
      `SELECT user_id as "userId", theme, font_scale as "fontScale", dyslexia_font as "dyslexiaFont",
              speech_rate as "speechRate", speech_pitch as "speechPitch", voice_uri as "voiceURI",
              auto_read_aloud as "autoReadAloud", high_contrast_borders as "highContrastBorders",
              reduce_motion as "reduceMotion", compensatory_time_enabled as "compensatoryTimeEnabled",
              whisper_model_size as "whisperModelSize"
       FROM accessibility_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        ...row,
        fontScale: Number(row.fontScale) || 125,
        speechRate: Number(row.speechRate) || 1.0,
        speechPitch: Number(row.speechPitch) || 1.0,
        isBlindMode: row.theme === 'high_contrast_yellow'
      };
    }

    // Default settings if not yet saved in DB
    return {
      userId,
      theme: 'sapphire',
      fontScale: 125,
      dyslexiaFont: false,
      speechRate: 1.0,
      speechPitch: 1.0,
      voiceURI: 'default',
      autoReadAloud: true,
      highContrastBorders: true,
      reduceMotion: false,
      compensatoryTimeEnabled: true,
      whisperModelSize: 'base'
    };
  }

  async saveAccessibilitySettings(settings: AccessibilitySettings): Promise<AccessibilitySettings> {
    await query(
      `INSERT INTO accessibility_settings (user_id, theme, font_scale, dyslexia_font, speech_rate, speech_pitch, voice_uri, auto_read_aloud, high_contrast_borders, reduce_motion, compensatory_time_enabled, whisper_model_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         theme = EXCLUDED.theme,
         font_scale = EXCLUDED.font_scale,
         dyslexia_font = EXCLUDED.dyslexia_font,
         speech_rate = EXCLUDED.speech_rate,
         speech_pitch = EXCLUDED.speech_pitch,
         voice_uri = EXCLUDED.voice_uri,
         auto_read_aloud = EXCLUDED.auto_read_aloud,
         high_contrast_borders = EXCLUDED.high_contrast_borders,
         reduce_motion = EXCLUDED.reduce_motion,
         compensatory_time_enabled = EXCLUDED.compensatory_time_enabled,
         whisper_model_size = EXCLUDED.whisper_model_size`,
      [
        settings.userId,
        settings.theme || 'sapphire',
        settings.fontScale || 125,
        Boolean(settings.dyslexiaFont),
        settings.speechRate || 1.0,
        settings.speechPitch || 1.0,
        settings.voiceURI || 'default',
        settings.autoReadAloud !== false,
        settings.highContrastBorders !== false,
        Boolean(settings.reduceMotion),
        settings.compensatoryTimeEnabled !== false,
        settings.whisperModelSize || 'base'
      ]
    );
    return settings;
  }

  async getQuestions(filter: QuestionFilter): Promise<{ total: number; questions: Question[] }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filter.subject) {
      conditions.push(`LOWER(subject) = LOWER($${idx++})`);
      params.push(filter.subject);
    }
    if (filter.topic) {
      conditions.push(`LOWER(topic) = LOWER($${idx++})`);
      params.push(filter.topic);
    }
    if (filter.difficulty) {
      conditions.push(`LOWER(difficulty_label) = LOWER($${idx++})`);
      params.push(filter.difficulty);
    }
    if (filter.search) {
      conditions.push(`(LOWER(question_text) LIKE $${idx} OR LOWER(topic) LIKE $${idx} OR LOWER(subtopic) LIKE $${idx})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) as count FROM questions ${whereClause}`, params);
    const total = Number(countRes.rows[0]?.count) || 0;

    const limit = Number(filter.limit) || 20;
    const offset = Number(filter.offset) || 0;

    params.push(limit, offset);
    const listSql = `SELECT * FROM questions ${whereClause} ORDER BY question_id ASC LIMIT $${idx++} OFFSET $${idx++}`;
    const listRes = await query<Question>(listSql, params);

    return { total, questions: listRes.rows };
  }

  async getQuestionById(id: string): Promise<Question | null> {
    const res = await query<Question>(`SELECT * FROM questions WHERE question_id = $1 LIMIT 1`, [id]);
    return res.rows[0] || null;
  }

  // TRANSACTIONAL PRACTICE ATTEMPT (Inserts attempt, updates BKT, updates SM-2, records history)
  async recordPracticeAttempt(
    attempt: PracticeAttempt,
    bktUpdate: TopicMasteryRecord,
    sm2Update: RevisionItem,
    historyEntry: LearningHistoryEntry
  ): Promise<void> {
    await withTransaction(async (client) => {
      // 1. Insert practice attempt
      await client.query(
        `INSERT INTO practice_attempts (id, user_id, question_id, selected_option, is_correct, time_spent_seconds, mode, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [attempt.id, attempt.userId, attempt.questionId, attempt.selectedOption, attempt.isCorrect, attempt.timeSpentSeconds, attempt.mode, attempt.timestamp]
      );

      // 2. Upsert BKT Topic Mastery
      await client.query(
        `INSERT INTO topic_mastery (id, user_id, subject, topic, p_known, mastery_percentage, tier, attempts_count, correct_count, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, topic) DO UPDATE SET
           p_known = EXCLUDED.p_known,
           mastery_percentage = EXCLUDED.mastery_percentage,
           tier = EXCLUDED.tier,
           attempts_count = EXCLUDED.attempts_count,
           correct_count = EXCLUDED.correct_count,
           updated_at = EXCLUDED.updated_at`,
        [bktUpdate.id, bktUpdate.userId, bktUpdate.subject, bktUpdate.topic, bktUpdate.p_known, bktUpdate.masteryPercentage, bktUpdate.tier, bktUpdate.attemptsCount, bktUpdate.correctCount, bktUpdate.updatedAt]
      );

      // 3. Upsert SM-2 Revision Item
      await client.query(
        `INSERT INTO revision_items (id, user_id, question_id, repetitions, interval_days, easiness_factor, last_reviewed_at, next_review_due, mastery_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           repetitions = EXCLUDED.repetitions,
           interval_days = EXCLUDED.interval_days,
           easiness_factor = EXCLUDED.easiness_factor,
           last_reviewed_at = EXCLUDED.last_reviewed_at,
           next_review_due = EXCLUDED.next_review_due,
           mastery_level = EXCLUDED.mastery_level`,
        [sm2Update.id, sm2Update.userId, sm2Update.questionId, sm2Update.repetitions, sm2Update.intervalDays, sm2Update.easinessFactor, sm2Update.lastReviewedAt, sm2Update.nextReviewDue, sm2Update.masteryLevel]
      );

      // 4. Record Learning History Log
      await client.query(
        `INSERT INTO learning_history (id, user_id, type, title, summary, score, max_score, duration_seconds, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [historyEntry.id, historyEntry.userId, historyEntry.type, historyEntry.title, historyEntry.summary, historyEntry.score ?? null, historyEntry.maxScore ?? null, historyEntry.durationSeconds, historyEntry.timestamp]
      );
    });
  }

  // TRANSACTIONAL MOCK ATTEMPT (Inserts mock attempt + history entry)
  async recordMockAttempt(attempt: MockExamAttempt, historyEntry: LearningHistoryEntry): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO mock_attempts (id, user_id, exam_title, session1_score, session2_score, total_score, total_max, percentage, qualified, total_time_seconds, answers, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          attempt.id,
          attempt.userId,
          attempt.examTitle,
          attempt.session1Score,
          attempt.session2Score,
          attempt.totalScore,
          attempt.totalMax,
          attempt.percentage,
          attempt.qualified,
          attempt.totalTimeSeconds,
          JSON.stringify(attempt.answers),
          attempt.completedAt
        ]
      );

      await client.query(
        `INSERT INTO learning_history (id, user_id, type, title, summary, score, max_score, duration_seconds, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [historyEntry.id, historyEntry.userId, historyEntry.type, historyEntry.title, historyEntry.summary, historyEntry.score ?? null, historyEntry.maxScore ?? null, historyEntry.durationSeconds, historyEntry.timestamp]
      );
    });
  }

  async getMockAttempts(userId: string): Promise<MockExamAttempt[]> {
    const res = await query<any>(
      `SELECT id, user_id as "userId", exam_title as "examTitle", session1_score as "session1Score",
              session2_score as "session2Score", total_score as "totalScore", total_max as "totalMax",
              percentage, qualified, total_time_seconds as "totalTimeSeconds", answers,
              completed_at as "completedAt"
       FROM mock_attempts WHERE user_id = $1 ORDER BY completed_at DESC`,
      [userId]
    );
    return res.rows.map((r) => ({
      ...r,
      percentage: Number(r.percentage) || 0,
      answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers
    }));
  }

  async getMockAttemptById(id: string): Promise<MockExamAttempt | null> {
    const res = await query<any>(
      `SELECT id, user_id as "userId", exam_title as "examTitle", session1_score as "session1Score",
              session2_score as "session2Score", total_score as "totalScore", total_max as "totalMax",
              percentage, qualified, total_time_seconds as "totalTimeSeconds", answers,
              completed_at as "completedAt"
       FROM mock_attempts WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      ...r,
      percentage: Number(r.percentage) || 0,
      answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers
    };
  }

  // -------------------------------------------------------------
  // MOCK EXAM QUESTION ROTATION (PostgreSQL)
  // -------------------------------------------------------------
  private async loadAssignments(whereSql: string, params: any[]): Promise<MockExamAssignment[]> {
    const aRes = await query<any>(
      `SELECT id, user_id, sequence_number, status, assigned_at, completed_at, mock_attempt_id, rotation_summary
       FROM mock_exam_assignments WHERE ${whereSql} ORDER BY sequence_number ASC`,
      params
    );
    if (aRes.rows.length === 0) return [];
    const ids = aRes.rows.map((r) => r.id);
    const uRes = await query<any>(
      `SELECT assignment_id, question_id, subject, position, question_submitted
       FROM mock_exam_question_usage WHERE assignment_id = ANY($1) ORDER BY position ASC`,
      [ids]
    );
    const byAssignment = new Map<string, MockExamAssignment['questions']>();
    for (const u of uRes.rows) {
      const list = byAssignment.get(u.assignment_id) || [];
      list.push({
        questionId: u.question_id,
        subject: u.subject,
        position: Number(u.position),
        submitted: Boolean(u.question_submitted)
      });
      byAssignment.set(u.assignment_id, list);
    }
    return aRes.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      sequenceNumber: Number(r.sequence_number),
      cycleNumber: Number(r.cycle_number ?? 1),
      status: r.status,
      questions: byAssignment.get(r.id) || [],
      assignedAt: new Date(r.assigned_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      mockAttemptId: r.mock_attempt_id,
      rotationSummary:
        typeof r.rotation_summary === 'string' ? JSON.parse(r.rotation_summary) : r.rotation_summary
    }));
  }

  async getMockCycle(userId: string): Promise<number> {
    try {
      const res = await query<any>(`SELECT current_cycle FROM mock_exam_cycles WHERE user_id = $1 LIMIT 1`, [userId]);
      if (res.rows[0]) return Number(res.rows[0].current_cycle) || 1;
    } catch {}
    return 1;
  }

  async resetMockCycle(userId: string): Promise<number> {
    try {
      const res = await query<any>(
        `INSERT INTO mock_exam_cycles (user_id, current_cycle, updated_at)
         VALUES ($1, 2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET current_cycle = mock_exam_cycles.current_cycle + 1, updated_at = NOW()
         RETURNING current_cycle`,
        [userId]
      );
      if (res.rows[0]) return Number(res.rows[0].current_cycle);
    } catch {}
    return 2;
  }

  async getMockAssignments(userId: string): Promise<MockExamAssignment[]> {
    return this.loadAssignments('user_id = $1', [userId]);
  }

  async getMockAssignmentById(id: string): Promise<MockExamAssignment | null> {
    const rows = await this.loadAssignments('id = $1', [id]);
    return rows[0] || null;
  }

  async createMockAssignment(assignment: MockExamAssignment): Promise<MockExamAssignment> {
    try {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO mock_exam_assignments (id, user_id, sequence_number, cycle_number, status, assigned_at, rotation_summary)
           VALUES ($1, $2, $3, $4, 'IN_PROGRESS', $5, $6)`,
          [
            assignment.id,
            assignment.userId,
            assignment.sequenceNumber,
            assignment.cycleNumber || 1,
            assignment.assignedAt,
            JSON.stringify(assignment.rotationSummary || {})
          ]
        );
        for (const q of assignment.questions) {
          await client.query(
            `INSERT INTO mock_exam_question_usage
               (assignment_id, user_id, question_id, subject, position, sequence_number, assigned_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [assignment.id, assignment.userId, q.questionId, q.subject, q.position, assignment.sequenceNumber, assignment.assignedAt]
          );
        }
      });
      return assignment;
    } catch (err: any) {
      // Unique violation: another request already created the active assignment / sequence.
      if (err?.code === '23505') {
        const existing = (await this.getMockAssignments(assignment.userId)).find((a) => a.status === 'IN_PROGRESS');
        if (existing) return existing;
      }
      throw err;
    }
  }

  async setMockAssignmentStatus(id: string, status: MockAssignmentStatus): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(`UPDATE mock_exam_assignments SET status = $2 WHERE id = $1`, [id, status]);
      await client.query(`UPDATE mock_exam_question_usage SET attempt_status = $2 WHERE assignment_id = $1`, [id, status]);
    });
  }

  async completeMockAssignment(
    assignmentId: string,
    submittedQuestionIds: string[],
    attempt: MockExamAttempt,
    historyEntry: LearningHistoryEntry
  ): Promise<void> {
    await withTransaction(async (client) => {
      // Lock the assignment row and only transition IN_PROGRESS -> COMPLETED once.
      const upd = await client.query(
        `UPDATE mock_exam_assignments
           SET status = 'COMPLETED', completed_at = $2, mock_attempt_id = $3
         WHERE id = $1 AND status = 'IN_PROGRESS'`,
        [assignmentId, attempt.completedAt, attempt.id]
      );
      if (upd.rowCount === 0) {
        throw new Error('MOCK_ASSIGNMENT_NOT_ACTIVE');
      }
      await client.query(
        `UPDATE mock_exam_question_usage
           SET attempt_status = 'COMPLETED', exam_completed = TRUE,
               question_submitted = (question_id = ANY($2))
         WHERE assignment_id = $1`,
        [assignmentId, submittedQuestionIds]
      );
      await client.query(
        `INSERT INTO mock_attempts (id, user_id, exam_title, session1_score, session2_score, total_score, total_max, percentage, qualified, total_time_seconds, answers, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          attempt.id,
          attempt.userId,
          attempt.examTitle,
          attempt.session1Score,
          attempt.session2Score,
          attempt.totalScore,
          attempt.totalMax,
          attempt.percentage,
          attempt.qualified,
          attempt.totalTimeSeconds,
          JSON.stringify(attempt.answers),
          attempt.completedAt
        ]
      );
      await client.query(
        `INSERT INTO learning_history (id, user_id, type, title, summary, score, max_score, duration_seconds, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [historyEntry.id, historyEntry.userId, historyEntry.type, historyEntry.title, historyEntry.summary, historyEntry.score ?? null, historyEntry.maxScore ?? null, historyEntry.durationSeconds, historyEntry.timestamp]
      );
    });
  }

  // TRANSACTIONAL DIAGNOSTIC ATTEMPT (Idempotent insert + BKT updates + history entry)
  async recordDiagnosticAttempt(
    attempt: DiagnosticAttempt,
    bktUpdates: TopicMasteryRecord[],
    historyEntry: LearningHistoryEntry
  ): Promise<DiagnosticAttempt> {
    if (attempt.clientSubmissionId) {
      const existing = await query<any>(
        `SELECT id FROM diagnostic_attempts WHERE client_submission_id = $1 AND user_id = $2 LIMIT 1`,
        [attempt.clientSubmissionId, attempt.userId]
      );
      if (existing.rows[0]?.id) {
        const found = await this.getDiagnosticAttemptById(existing.rows[0].id);
        if (found) return found;
      }
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO diagnostic_attempts (
           id, client_submission_id, user_id, exam_title, status,
           total_questions, attempted_count, correct_count, incorrect_count, unanswered_count,
           session1_score, session2_score, total_score, total_max,
           percentage, accuracy_percentage, total_time_seconds,
           responses, subject_breakdown, topic_breakdown,
           acceptance_status, acceptance_method, accepted_at, exam_started_at, completed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         ON CONFLICT (id) DO NOTHING`,
        [
          attempt.id,
          attempt.clientSubmissionId || null,
          attempt.userId,
          attempt.examTitle,
          attempt.status,
          attempt.totalQuestions,
          attempt.attemptedCount,
          attempt.correctCount,
          attempt.incorrectCount,
          attempt.unansweredCount,
          attempt.session1Score,
          attempt.session2Score,
          attempt.totalScore,
          attempt.totalMax,
          attempt.percentage,
          attempt.accuracyPercentage,
          attempt.totalTimeSeconds,
          JSON.stringify(attempt.responses),
          JSON.stringify(attempt.subjectBreakdown),
          JSON.stringify(attempt.topicBreakdown),
          attempt.acceptanceStatus || 'ACCEPTED',
          attempt.acceptanceMethod || 'CHECKBOX',
          attempt.acceptedAt || null,
          attempt.examStartedAt || null,
          attempt.completedAt
        ]
      );

      for (const bktUpdate of bktUpdates) {
        await client.query(
          `INSERT INTO topic_mastery (id, user_id, subject, topic, p_known, mastery_percentage, tier, attempts_count, correct_count, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, topic) DO UPDATE SET
             p_known = EXCLUDED.p_known,
             mastery_percentage = EXCLUDED.mastery_percentage,
             tier = EXCLUDED.tier,
             attempts_count = EXCLUDED.attempts_count,
             correct_count = EXCLUDED.correct_count,
             updated_at = EXCLUDED.updated_at`,
          [
            bktUpdate.id,
            bktUpdate.userId,
            bktUpdate.subject,
            bktUpdate.topic,
            bktUpdate.p_known,
            bktUpdate.masteryPercentage,
            bktUpdate.tier,
            bktUpdate.attemptsCount,
            bktUpdate.correctCount,
            bktUpdate.updatedAt
          ]
        );
      }

      await client.query(
        `INSERT INTO learning_history (id, user_id, type, title, summary, score, max_score, duration_seconds, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          historyEntry.id,
          historyEntry.userId,
          historyEntry.type,
          historyEntry.title,
          historyEntry.summary,
          historyEntry.score ?? null,
          historyEntry.maxScore ?? null,
          historyEntry.durationSeconds,
          historyEntry.timestamp
        ]
      );
    });

    return attempt;
  }

  async getDiagnosticAttempts(userId: string): Promise<DiagnosticAttempt[]> {
    const res = await query<any>(
      `SELECT id, client_submission_id as "clientSubmissionId", user_id as "userId",
              exam_title as "examTitle", status, total_questions as "totalQuestions",
              attempted_count as "attemptedCount", correct_count as "correctCount",
              incorrect_count as "incorrectCount", unanswered_count as "unansweredCount",
              session1_score as "session1Score", session2_score as "session2Score",
              total_score as "totalScore", total_max as "totalMax",
              percentage, accuracy_percentage as "accuracyPercentage",
              total_time_seconds as "totalTimeSeconds",
              responses, subject_breakdown as "subjectBreakdown",
              topic_breakdown as "topicBreakdown",
              acceptance_status as "acceptanceStatus", acceptance_method as "acceptanceMethod",
              accepted_at as "acceptedAt", exam_started_at as "examStartedAt",
              completed_at as "completedAt"
       FROM diagnostic_attempts
       WHERE user_id = $1
       ORDER BY completed_at DESC`,
      [userId]
    );
    return res.rows.map((r) => ({
      ...r,
      percentage: Number(r.percentage) || 0,
      accuracyPercentage: Number(r.accuracyPercentage) || 0,
      responses: typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses || [],
      subjectBreakdown:
        typeof r.subjectBreakdown === 'string' ? JSON.parse(r.subjectBreakdown) : r.subjectBreakdown || [],
      topicBreakdown:
        typeof r.topicBreakdown === 'string' ? JSON.parse(r.topicBreakdown) : r.topicBreakdown || []
    }));
  }

  async getDiagnosticAttemptById(id: string): Promise<DiagnosticAttempt | null> {
    const res = await query<any>(
      `SELECT id, client_submission_id as "clientSubmissionId", user_id as "userId",
              exam_title as "examTitle", status, total_questions as "totalQuestions",
              attempted_count as "attemptedCount", correct_count as "correctCount",
              incorrect_count as "incorrectCount", unanswered_count as "unansweredCount",
              session1_score as "session1Score", session2_score as "session2Score",
              total_score as "totalScore", total_max as "totalMax",
              percentage, accuracy_percentage as "accuracyPercentage",
              total_time_seconds as "totalTimeSeconds",
              responses, subject_breakdown as "subjectBreakdown",
              topic_breakdown as "topicBreakdown",
              acceptance_status as "acceptanceStatus", acceptance_method as "acceptanceMethod",
              accepted_at as "acceptedAt", exam_started_at as "examStartedAt",
              completed_at as "completedAt"
       FROM diagnostic_attempts
       WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      ...r,
      percentage: Number(r.percentage) || 0,
      accuracyPercentage: Number(r.accuracyPercentage) || 0,
      responses: typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses || [],
      subjectBreakdown:
        typeof r.subjectBreakdown === 'string' ? JSON.parse(r.subjectBreakdown) : r.subjectBreakdown || [],
      topicBreakdown:
        typeof r.topicBreakdown === 'string' ? JSON.parse(r.topicBreakdown) : r.topicBreakdown || []
    };
  }

  async getRevisionItems(userId: string): Promise<{
    totalCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    dueItems: any[];
    upcomingItems: any[];
  }> {
    const res = await query<any>(
      `SELECT r.id, r.user_id as "userId", r.question_id as "questionId", r.repetitions,
              r.interval_days as "intervalDays", r.easiness_factor as "easinessFactor",
              r.last_reviewed_at as "lastReviewedAt", r.next_review_due as "nextReviewDue",
              r.mastery_level as "masteryLevel",
              q.subject, q.topic, q.question_text as "question_text", q.correct_answer, q.explanation, q.difficulty_label
       FROM revision_items r
       LEFT JOIN questions q ON r.question_id = q.question_id
       WHERE r.user_id = $1
       ORDER BY r.next_review_due ASC`,
      [userId]
    );

    const now = new Date();
    const enriched = res.rows.map((row) => {
      const isDue = new Date(row.nextReviewDue) <= now;
      return {
        id: row.id,
        userId: row.userId,
        questionId: row.questionId,
        repetitions: row.repetitions,
        intervalDays: row.intervalDays,
        easinessFactor: Number(row.easinessFactor),
        lastReviewedAt: row.lastReviewedAt,
        nextReviewDue: row.nextReviewDue,
        masteryLevel: row.masteryLevel,
        isDue,
        question: row.question_text
          ? {
              question_id: row.questionId,
              subject: row.subject,
              topic: row.topic,
              question_text: row.question_text,
              correct_answer: row.correct_answer,
              explanation: row.explanation,
              difficulty_label: row.difficulty_label
            }
          : null
      };
    });

    const dueToday = enriched.filter((i) => i.isDue);
    const upcoming = enriched.filter((i) => !i.isDue);

    return {
      totalCount: enriched.length,
      dueTodayCount: dueToday.length,
      upcomingCount: upcoming.length,
      dueItems: dueToday,
      upcomingItems: upcoming
    };
  }

  async reviewRevisionItem(userId: string, questionId: string, quality: number): Promise<RevisionItem> {
    const currentRes = await query<any>(
      `SELECT * FROM revision_items WHERE user_id = $1 AND question_id = $2 LIMIT 1`,
      [userId, questionId]
    );

    let item: RevisionItem;
    if (currentRes.rows[0]) {
      const r = currentRes.rows[0];
      item = {
        id: r.id,
        userId: r.user_id,
        questionId: r.question_id,
        repetitions: r.repetitions,
        intervalDays: r.interval_days,
        easinessFactor: Number(r.easiness_factor),
        lastReviewedAt: r.last_reviewed_at,
        nextReviewDue: r.next_review_due,
        masteryLevel: r.mastery_level
      };
    } else {
      item = {
        id: `rev_${Date.now()}`,
        userId,
        questionId,
        repetitions: 0,
        intervalDays: 1,
        easinessFactor: 2.5,
        lastReviewedAt: new Date().toISOString(),
        nextReviewDue: getNextReviewDate(1),
        masteryLevel: 'Novice'
      };
    }

    const sm2 = calculateSM2(item, Number(quality) || 3);
    item.repetitions = sm2.repetitions;
    item.intervalDays = sm2.intervalDays;
    item.easinessFactor = sm2.easinessFactor;
    item.masteryLevel = sm2.masteryLevel;
    item.lastReviewedAt = new Date().toISOString();
    item.nextReviewDue = getNextReviewDate(sm2.intervalDays);

    await query(
      `INSERT INTO revision_items (id, user_id, question_id, repetitions, interval_days, easiness_factor, last_reviewed_at, next_review_due, mastery_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         repetitions = EXCLUDED.repetitions,
         interval_days = EXCLUDED.interval_days,
         easiness_factor = EXCLUDED.easiness_factor,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         next_review_due = EXCLUDED.next_review_due,
         mastery_level = EXCLUDED.mastery_level`,
      [item.id, item.userId, item.questionId, item.repetitions, item.intervalDays, item.easinessFactor, item.lastReviewedAt, item.nextReviewDue, item.masteryLevel]
    );

    return item;
  }

  async getTopicMastery(userId: string): Promise<any[]> {
    // Join distinct topics from questions with candidate topic_mastery
    const res = await query<any>(
      `SELECT q.topic, q.subject, COUNT(q.question_id) as total_questions,
              COALESCE(tm.attempts_count, 0) as attempts_count,
              COALESCE(tm.correct_count, 0) as correct_count,
              COALESCE(tm.p_known, 0.250) as p_known,
              COALESCE(tm.mastery_percentage, 25) as mastery_percentage,
              COALESCE(tm.tier, 'Novice') as tier,
              tm.updated_at as last_updated
       FROM questions q
       LEFT JOIN topic_mastery tm ON q.topic = tm.topic AND tm.user_id = $1
       GROUP BY q.topic, q.subject, tm.attempts_count, tm.correct_count, tm.p_known, tm.mastery_percentage, tm.tier, tm.updated_at
       ORDER BY q.subject ASC, q.topic ASC`,
      [userId]
    );

    return res.rows.map((r) => ({
      topic: r.topic,
      subject: r.subject,
      totalQuestions: Number(r.total_questions) || 0,
      attemptsCount: Number(r.attempts_count) || 0,
      correctCount: Number(r.correct_count) || 0,
      p_known: Number(r.p_known) || 0.25,
      masteryPercentage: Number(r.mastery_percentage) || 25,
      tier: r.tier || 'Novice',
      lastUpdated: r.last_updated
    }));
  }

  async getLearningHistory(userId: string): Promise<LearningHistoryEntry[]> {
    const res = await query<any>(
      `SELECT id, user_id as "userId", type, title, summary, score, max_score as "maxScore",
              duration_seconds as "durationSeconds", timestamp
       FROM learning_history WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 100`,
      [userId]
    );
    return res.rows;
  }

  async recordLearningHistory(entry: LearningHistoryEntry): Promise<void> {
    await query(
      `INSERT INTO learning_history (id, user_id, type, title, summary, score, max_score, duration_seconds, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [entry.id, entry.userId, entry.type, entry.title, entry.summary, entry.score ?? null, entry.maxScore ?? null, entry.durationSeconds || 0, entry.timestamp]
    );
  }

  async getProgressAnalytics(userId: string): Promise<ProgressAnalyticsResult> {
    // 1. Practice questions aggregate
    const practiceAgg = await query<any>(
      `SELECT COUNT(*) as total_attempts,
              COUNT(CASE WHEN is_correct THEN 1 END) as correct_attempts,
              AVG(time_spent_seconds) as avg_time
       FROM practice_attempts WHERE user_id = $1`,
      [userId]
    );

    const totalPracticeQuestions = Number(practiceAgg.rows[0]?.total_attempts) || 0;
    const correctCount = Number(practiceAgg.rows[0]?.correct_attempts) || 0;
    const practiceAccuracy = totalPracticeQuestions > 0 ? Math.round((correctCount / totalPracticeQuestions) * 100) : 0;
    const avgTimePerQuestionSeconds = Math.round(Number(practiceAgg.rows[0]?.avg_time) || 35);

    // 2. Mocks aggregate
    const mocks = await this.getMockAttempts(userId);

    // 3. Exam Readiness Index
    // Formula: 60% weight on practice accuracy + 40% on latest mock score (or baseline 30%)
    const latestMockPct = mocks.length > 0 ? Number(mocks[0].percentage) || 50 : 30;
    const overallReadinessScore = Math.min(
      100,
      Math.round(practiceAccuracy * 0.6 + latestMockPct * 0.4)
    );

    // 4. Per-Subject Performance Breakdown
    const subjectList = [
      { name: 'Numerical and Mathematical Ability', session: 'Session I' as const },
      { name: 'Reasoning Ability and Problem Solving', session: 'Session I' as const },
      { name: 'General Awareness', session: 'Session II' as const },
      { name: 'English Language and Comprehension', session: 'Session II' as const }
    ];

    const subjectStatsRes = await query<any>(
      `SELECT q.subject,
              COUNT(p.id) as attempted,
              COUNT(CASE WHEN p.is_correct THEN 1 END) as correct,
              AVG(p.time_spent_seconds) as avg_speed
       FROM practice_attempts p
       JOIN questions q ON p.question_id = q.question_id
       WHERE p.user_id = $1
       GROUP BY q.subject`,
      [userId]
    );

    const statsMap: Record<string, any> = {};
    subjectStatsRes.rows.forEach((r) => {
      statsMap[r.subject] = r;
    });

    const subjects: SubjectAnalyticsBreakdown[] = subjectList.map((s) => {
      const stat = statsMap[s.name];
      const attempted = Number(stat?.attempted) || 0;
      const correct = Number(stat?.correct) || 0;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const avgSpeed = Math.round(Number(stat?.avg_speed) || 0);

      let status: SubjectAnalyticsBreakdown['status'] = 'No Data';
      if (attempted > 0) {
        if (accuracy >= 80) status = 'Mastered';
        else if (accuracy >= 65) status = 'Proficient';
        else if (accuracy >= 45) status = 'Developing';
        else status = 'Novice';
      }

      return {
        subject: s.name,
        session: s.session,
        attempted,
        correct,
        accuracy,
        avgTimeSeconds: avgSpeed,
        speed: avgSpeed > 0 ? `${avgSpeed}s` : '—',
        trend: attempted > 5 ? (accuracy >= 65 ? '↑ Improving' : '→ Steady') : '—',
        status
      };
    });

    return {
      totalPracticeQuestions,
      practiceAccuracy,
      avgTimePerQuestionSeconds,
      totalMocksAttempted: mocks.length,
      recentMocks: mocks.slice(0, 5),
      overallReadinessScore,
      subjects
    };
  }
}

// -------------------------------------------------------------
// FILE JSON STORE REPOSITORY (Graceful Fallback & Idempotency)
// -------------------------------------------------------------
export class JsonRepository implements IDataRepository {
  readonly engineName = 'File JSON Store' as const;

  async getUserById(id: string): Promise<User | null> {
    const db = getDb();
    return db.users.find((u) => u.id === id) || null;
  }

  async getUserByIdentifier(identifier: string): Promise<User | null> {
    const db = getDb();
    const clean = (identifier || '').toLowerCase();
    return (
      db.users.find(
        (u) =>
          u.rollNumber.toLowerCase() === clean ||
          u.email.toLowerCase() === clean
      ) || null
    );
  }

  async createUser(user: User): Promise<User> {
    const db = getDb();
    db.users.push(user);
    saveDatabase(db);
    return user;
  }

  async updateUserProfile(id: string, updates: Partial<User>): Promise<User> {
    const db = getDb();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new Error('User not found');
    Object.assign(user, updates);
    saveDatabase(db);
    return user;
  }

  async getAccessibilitySettings(userId: string): Promise<AccessibilitySettings> {
    const db = getDb();
    return (
      db.accessibilitySettings[userId] || {
        userId,
        theme: 'sapphire',
        fontScale: 125,
        dyslexiaFont: false,
        speechRate: 1.0,
        speechPitch: 1.0,
        voiceURI: 'default',
        autoReadAloud: true,
        highContrastBorders: true,
        reduceMotion: false,
        compensatoryTimeEnabled: true,
        whisperModelSize: 'base'
      }
    );
  }

  async saveAccessibilitySettings(settings: AccessibilitySettings): Promise<AccessibilitySettings> {
    const db = getDb();
    db.accessibilitySettings[settings.userId] = {
      ...(db.accessibilitySettings[settings.userId] || {}),
      ...settings
    };
    saveDatabase(db);
    return db.accessibilitySettings[settings.userId];
  }

  async getQuestions(filter: QuestionFilter): Promise<{ total: number; questions: Question[] }> {
    let list = [...loadQuestions()];
    if (filter.subject && filter.subject !== 'all') {
      list = list.filter((q) => q.subject.toLowerCase() === filter.subject!.toLowerCase());
    }
    if (filter.topic && filter.topic !== 'all') {
      list = list.filter((q) => q.topic.toLowerCase() === filter.topic!.toLowerCase());
    }
    if (filter.difficulty && filter.difficulty !== 'all') {
      list = list.filter((q) => (q.difficulty_label || '').toLowerCase() === filter.difficulty!.toLowerCase());
    }
    if (filter.search) {
      const s = filter.search.toLowerCase();
      list = list.filter(
        (q) =>
          q.question_id.toLowerCase().includes(s) ||
          q.question_text.toLowerCase().includes(s) ||
          q.topic.toLowerCase().includes(s) ||
          q.subtopic.toLowerCase().includes(s)
      );
    }
    const total = list.length;
    const limit = Number(filter.limit) || 20;
    const offset = Number(filter.offset) || 0;
    return { total, questions: list.slice(offset, offset + limit) };
  }

  async getQuestionById(id: string): Promise<Question | null> {
    return loadQuestions().find((q) => q.question_id === id) || null;
  }

  async recordPracticeAttempt(
    attempt: PracticeAttempt,
    bktUpdate: TopicMasteryRecord,
    sm2Update: RevisionItem,
    historyEntry: LearningHistoryEntry
  ): Promise<void> {
    const db = getDb();
    db.practiceAttempts.push(attempt);

    const tmIndex = db.topicMastery.findIndex((m) => m.userId === bktUpdate.userId && m.topic === bktUpdate.topic);
    if (tmIndex >= 0) {
      db.topicMastery[tmIndex] = bktUpdate;
    } else {
      db.topicMastery.push(bktUpdate);
    }

    const revIndex = db.revisionItems.findIndex((r) => r.userId === sm2Update.userId && r.questionId === sm2Update.questionId);
    if (revIndex >= 0) {
      db.revisionItems[revIndex] = sm2Update;
    } else {
      db.revisionItems.push(sm2Update);
    }

    db.learningHistory.unshift(historyEntry);
    saveDatabase(db);
  }

  async recordMockAttempt(attempt: MockExamAttempt, historyEntry: LearningHistoryEntry): Promise<void> {
    const db = getDb();
    db.mockAttempts.unshift(attempt);
    db.learningHistory.unshift(historyEntry);
    saveDatabase(db);
  }

  async getMockAttempts(userId: string): Promise<MockExamAttempt[]> {
    const db = getDb();
    return db.mockAttempts.filter((m) => m.userId === userId);
  }

  async getMockAttemptById(id: string): Promise<MockExamAttempt | null> {
    const db = getDb();
    return db.mockAttempts.find((m) => m.id === id) || null;
  }

  // -------------------------------------------------------------
  // MOCK EXAM QUESTION ROTATION (File JSON Store)
  // -------------------------------------------------------------
  private assignmentsStore(): MockExamAssignment[] {
    const db = getDb();
    if (!Array.isArray(db.mockExamAssignments)) db.mockExamAssignments = [];
    return db.mockExamAssignments;
  }

  async getMockCycle(userId: string): Promise<number> {
    const db = getDb();
    return db.mockExamCycles?.[userId] || 1;
  }

  async resetMockCycle(userId: string): Promise<number> {
    const db = getDb();
    if (!db.mockExamCycles || typeof db.mockExamCycles !== 'object') {
      db.mockExamCycles = {};
    }
    const current = db.mockExamCycles[userId] || 1;
    const next = current + 1;
    db.mockExamCycles[userId] = next;
    saveDatabase(db);
    return next;
  }

  async getMockAssignments(userId: string): Promise<MockExamAssignment[]> {
    return this.assignmentsStore()
      .filter((a) => a.userId === userId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((a) => ({ ...a, questions: a.questions.map((q) => ({ ...q })) }));
  }

  async getMockAssignmentById(id: string): Promise<MockExamAssignment | null> {
    const found = this.assignmentsStore().find((a) => a.id === id);
    return found ? { ...found, questions: found.questions.map((q) => ({ ...q })) } : null;
  }

  async createMockAssignment(assignment: MockExamAssignment): Promise<MockExamAssignment> {
    const store = this.assignmentsStore();
    // Synchronous check-and-insert (single Node event loop tick) prevents duplicate active exams.
    const active = store.find((a) => a.userId === assignment.userId && a.status === 'IN_PROGRESS');
    if (active) return { ...active, questions: active.questions.map((q) => ({ ...q })) };
    if (store.some((a) => a.userId === assignment.userId && a.sequenceNumber === assignment.sequenceNumber)) {
      throw new Error('MOCK_ASSIGNMENT_SEQUENCE_CONFLICT');
    }
    store.push({ ...assignment, questions: assignment.questions.map((q) => ({ ...q })) });
    saveDatabase(getDb());
    return assignment;
  }

  async setMockAssignmentStatus(id: string, status: MockAssignmentStatus): Promise<void> {
    const found = this.assignmentsStore().find((a) => a.id === id);
    if (!found) return;
    found.status = status;
    saveDatabase(getDb());
  }

  async completeMockAssignment(
    assignmentId: string,
    submittedQuestionIds: string[],
    attempt: MockExamAttempt,
    historyEntry: LearningHistoryEntry
  ): Promise<void> {
    const db = getDb();
    const found = this.assignmentsStore().find((a) => a.id === assignmentId);
    if (!found || found.status !== 'IN_PROGRESS') {
      throw new Error('MOCK_ASSIGNMENT_NOT_ACTIVE');
    }
    const submitted = new Set(submittedQuestionIds);
    found.status = 'COMPLETED';
    found.completedAt = attempt.completedAt;
    found.mockAttemptId = attempt.id;
    found.questions = found.questions.map((q) => ({ ...q, submitted: submitted.has(q.questionId) }));
    db.mockAttempts.unshift(attempt);
    db.learningHistory.unshift(historyEntry);
    saveDatabase(db);
  }

  async recordDiagnosticAttempt(
    attempt: DiagnosticAttempt,
    bktUpdates: TopicMasteryRecord[],
    historyEntry: LearningHistoryEntry
  ): Promise<DiagnosticAttempt> {
    const db = getDb();
    if (!Array.isArray(db.diagnosticAttempts)) {
      db.diagnosticAttempts = [];
    }

    // Idempotency check: prevent duplicate attempts from repeated submit requests
    if (attempt.clientSubmissionId) {
      const existing = db.diagnosticAttempts.find(
        (d) => d.userId === attempt.userId && d.clientSubmissionId === attempt.clientSubmissionId
      );
      if (existing) {
        return existing;
      }
    }
    const existingById = db.diagnosticAttempts.find((d) => d.id === attempt.id);
    if (existingById) {
      return existingById;
    }

    db.diagnosticAttempts.unshift(attempt);

    for (const bktUpdate of bktUpdates) {
      const tmIndex = db.topicMastery.findIndex(
        (m) => m.userId === bktUpdate.userId && m.topic === bktUpdate.topic
      );
      if (tmIndex >= 0) {
        db.topicMastery[tmIndex] = bktUpdate;
      } else {
        db.topicMastery.push(bktUpdate);
      }
    }

    db.learningHistory.unshift(historyEntry);
    saveDatabase(db);
    return attempt;
  }

  async getDiagnosticAttempts(userId: string): Promise<DiagnosticAttempt[]> {
    const db = getDb();
    if (!Array.isArray(db.diagnosticAttempts)) {
      return [];
    }
    return db.diagnosticAttempts
      .filter((d) => d.userId === userId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  async getDiagnosticAttemptById(id: string): Promise<DiagnosticAttempt | null> {
    const db = getDb();
    if (!Array.isArray(db.diagnosticAttempts)) {
      return null;
    }
    return db.diagnosticAttempts.find((d) => d.id === id) || null;
  }

  async getRevisionItems(userId: string): Promise<{
    totalCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    dueItems: any[];
    upcomingItems: any[];
  }> {
    const db = getDb();
    const allQuestions = loadQuestions();
    const userItems = db.revisionItems.filter((i) => i.userId === userId);
    const now = new Date();

    const enriched = userItems.map((item) => {
      const q = allQuestions.find((ques) => ques.question_id === item.questionId);
      const dueDate = new Date(item.nextReviewDue);
      const isDue = dueDate <= now;
      return {
        ...item,
        isDue,
        question: q || null
      };
    });

    const dueToday = enriched.filter((i) => i.isDue);
    const upcoming = enriched.filter((i) => !i.isDue);

    return {
      totalCount: enriched.length,
      dueTodayCount: dueToday.length,
      upcomingCount: upcoming.length,
      dueItems: dueToday,
      upcomingItems: upcoming
    };
  }

  async reviewRevisionItem(userId: string, questionId: string, quality: number): Promise<RevisionItem> {
    const db = getDb();
    let item = db.revisionItems.find((i) => i.userId === userId && i.questionId === questionId);
    if (!item) {
      item = {
        id: `rev_${Date.now()}`,
        userId,
        questionId,
        repetitions: 0,
        intervalDays: 1,
        easinessFactor: 2.5,
        lastReviewedAt: new Date().toISOString(),
        nextReviewDue: getNextReviewDate(1),
        masteryLevel: 'Novice'
      };
      db.revisionItems.push(item);
    }

    const sm2 = calculateSM2(item, Number(quality) || 3);
    item.repetitions = sm2.repetitions;
    item.intervalDays = sm2.intervalDays;
    item.easinessFactor = sm2.easinessFactor;
    item.masteryLevel = sm2.masteryLevel;
    item.lastReviewedAt = new Date().toISOString();
    item.nextReviewDue = getNextReviewDate(sm2.intervalDays);

    saveDatabase(db);
    return item;
  }

  async getTopicMastery(userId: string): Promise<any[]> {
    const db = getDb();
    const allQuestions = loadQuestions();

    const topicsMap: Record<string, { subject: string; topic: string; totalQuestions: number }> = {};
    allQuestions.forEach((q) => {
      if (!topicsMap[q.topic]) {
        topicsMap[q.topic] = { subject: q.subject, topic: q.topic, totalQuestions: 0 };
      }
      topicsMap[q.topic].totalQuestions += 1;
    });

    const userMastery = db.topicMastery.filter((m) => m.userId === userId);

    return Object.values(topicsMap).map((t) => {
      const m = userMastery.find((item) => item.topic === t.topic);
      return {
        topic: t.topic,
        subject: t.subject,
        totalQuestions: t.totalQuestions,
        attemptsCount: m ? m.attemptsCount : 0,
        correctCount: m ? m.correctCount : 0,
        p_known: m ? m.p_known : 0.25,
        masteryPercentage: m ? m.masteryPercentage : 25,
        tier: m ? m.tier : 'Novice',
        lastUpdated: m ? m.updatedAt : null
      };
    });
  }

  async getLearningHistory(userId: string): Promise<LearningHistoryEntry[]> {
    const db = getDb();
    return db.learningHistory.filter((h) => h.userId === userId);
  }

  async recordLearningHistory(entry: LearningHistoryEntry): Promise<void> {
    const db = getDb();
    db.learningHistory.unshift(entry);
    saveDatabase(db);
  }

  async getProgressAnalytics(userId: string): Promise<ProgressAnalyticsResult> {
    const db = getDb();
    const allQuestions = loadQuestions();
    const practice = db.practiceAttempts.filter((p) => p.userId === userId);
    const mocks = db.mockAttempts.filter((m) => m.userId === userId);

    const totalPracticeQuestions = practice.length;
    const correctPractice = practice.filter((p) => p.isCorrect).length;
    const practiceAccuracy = totalPracticeQuestions > 0 ? Math.round((correctPractice / totalPracticeQuestions) * 100) : 0;

    const avgTimePerQuestionSeconds =
      totalPracticeQuestions > 0
        ? Math.round(practice.reduce((acc, curr) => acc + (curr.timeSpentSeconds || 30), 0) / totalPracticeQuestions)
        : 35;

    const latestMockPct = mocks.length > 0 ? (mocks[0].percentage || 50) : 30;
    const overallReadinessScore = Math.min(100, Math.round(practiceAccuracy * 0.6 + latestMockPct * 0.4));

    // Calculate real per-subject statistics
    const subjectList = [
      { name: 'Numerical and Mathematical Ability', session: 'Session I' as const },
      { name: 'Reasoning Ability and Problem Solving', session: 'Session I' as const },
      { name: 'General Awareness', session: 'Session II' as const },
      { name: 'English Language and Comprehension', session: 'Session II' as const }
    ];

    // Map questionId -> subject
    const qMap = new Map<string, string>();
    allQuestions.forEach((q) => qMap.set(q.question_id, q.subject));

    const subjects: SubjectAnalyticsBreakdown[] = subjectList.map((s) => {
      const subjectAttempts = practice.filter((p) => qMap.get(p.questionId) === s.name);
      const attempted = subjectAttempts.length;
      const correct = subjectAttempts.filter((p) => p.isCorrect).length;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const avgSpeed =
        attempted > 0
          ? Math.round(subjectAttempts.reduce((acc, curr) => acc + (curr.timeSpentSeconds || 30), 0) / attempted)
          : 0;

      let status: SubjectAnalyticsBreakdown['status'] = 'No Data';
      if (attempted > 0) {
        if (accuracy >= 80) status = 'Mastered';
        else if (accuracy >= 65) status = 'Proficient';
        else if (accuracy >= 45) status = 'Developing';
        else status = 'Novice';
      }

      return {
        subject: s.name,
        session: s.session,
        attempted,
        correct,
        accuracy,
        avgTimeSeconds: avgSpeed,
        speed: avgSpeed > 0 ? `${avgSpeed}s` : '—',
        trend: attempted > 5 ? (accuracy >= 65 ? '↑ Improving' : '→ Steady') : '—',
        status
      };
    });

    return {
      totalPracticeQuestions,
      practiceAccuracy,
      avgTimePerQuestionSeconds,
      totalMocksAttempted: mocks.length,
      recentMocks: mocks.slice(0, 5),
      overallReadinessScore,
      subjects
    };
  }
}

// -------------------------------------------------------------
// REPOSITORY FACTORY WITH RUNTIME POSTGRES CONNECTION DETECTION
// -------------------------------------------------------------
let activeRepository: IDataRepository | null = null;
const postgresRepo = new PostgresRepository();
const jsonRepo = new JsonRepository();

export async function getRepository(): Promise<IDataRepository> {
  if (activeRepository) return activeRepository;

  const conn = await checkPostgresConnection();
  if (conn.isConnected) {
    console.log('[Database Engine]: Connected to live PostgreSQL database.');
    activeRepository = postgresRepo;
  } else {
    console.log(`[Database Engine]: PostgreSQL not reachable (${conn.error || 'no server'}). Operating on validated File JSON Store.`);
    activeRepository = jsonRepo;
  }
  return activeRepository;
}

