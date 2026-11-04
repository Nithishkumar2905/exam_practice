import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

import {
  loadQuestions,
  resetQuestionsCache,
  User,
  PracticeAttempt,
  MockExamAttempt,
  RevisionItem,
  TopicMasteryRecord,
  AccessibilitySettings,
  LearningHistoryEntry
} from './src/db/database.ts';
import { getRepository, IDataRepository } from './src/db/repository.ts';
import { runDatabaseMigration, MigrationReport } from './src/db/migration.ts';
import { checkPostgresConnection, isPostgresConnected, getLastConnectionError } from './src/db/db_pool.ts';

// Password hashing helpers
function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd + 'accessprep_x_salt_2026').digest('hex');
}

function isHashedPassword(pwd: string): boolean {
  return /^[a-f0-9]{64}$/.test(pwd);
}

import { evaluateSubmission, QuestionSubmission } from './src/utils/scoring.ts';
import { calculateSM2, getNextReviewDate } from './src/utils/sm2.ts';
import { updateBKT, classifyMasteryTier } from './src/utils/bkt.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for audio files upload — use OS temp dir for cross-platform compatibility
const AUDIO_UPLOAD_DIR = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'accessprep_audio');
if (!fs.existsSync(AUDIO_UPLOAD_DIR)) {
  fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });
}
const upload = multer({
  dest: AUDIO_UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// Helper for Gemini AI
let geminiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenAI();
}

let latestMigrationReport: MigrationReport | null = null;

// -------------------------------------------------------------
// 1. HEALTH, READINESS & DATABASE STATUS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  const repo = await getRepository();
  const questions = loadQuestions();
  
  res.json({
    status: 'online',
    portal: 'ACCESSPREP-X Accessible SSC MTS Portal',
    databaseEngine: repo.engineName,
    postgresConnected: isPostgresConnected(),
    questionsCount: questions.length,
    mlModelArtifactAvailable: fs.existsSync('src/data/model_artifact.pkl'),
    validationReportAvailable: fs.existsSync('src/data/dataset_validation_report.json'),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db/status', async (req, res) => {
  const conn = await checkPostgresConnection();
  const repo = await getRepository();
  const questions = loadQuestions();

  res.json({
    activeEngine: repo.engineName,
    postgres: {
      configuredHost: process.env.PGHOST || (process.env.DATABASE_URL ? 'via DATABASE_URL' : 'localhost'),
      isConnected: conn.isConnected,
      lastError: conn.error || null
    },
    migrationReport: latestMigrationReport,
    totalVerifiedQuestions: questions.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/db/migrate', async (req, res) => {
  try {
    const report = await runDatabaseMigration();
    latestMigrationReport = report;
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 2. AUTHENTICATION & CANDIDATE REGISTRATION
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body;
  const repo = await getRepository();

  const user = await repo.getUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ error: 'Candidate / User not found with provided identifier.' });
  }

  // Password comparison with backward-compatible migration
  if (password) {
    const storedHash = user.passwordHash;
    if (isHashedPassword(storedHash)) {
      if (storedHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid password or PIN.' });
      }
    } else {
      if (storedHash !== password) {
        return res.status(401).json({ error: 'Invalid password or PIN.' });
      }
      // Migrate to hashed password on successful login
      user.passwordHash = hashPassword(password);
      await repo.updateUserProfile(user.id, { passwordHash: user.passwordHash });
    }
  }

  const settings = await repo.getAccessibilitySettings(user.id);

  res.json({
    success: true,
    user: {
      id: user.id,
      rollNumber: user.rollNumber,
      name: user.name,
      email: user.email,
      role: user.role,
      pwdCategory: user.pwdCategory,
      needScribe: user.needScribe,
      examRegion: user.examRegion,
      examLanguage: user.examLanguage
    },
    settings
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, rollNumber, password, pwdCategory, needScribe, examRegion, examLanguage } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are mandatory fields.' });
  }

  const repo = await getRepository();
  const existing = await repo.getUserByIdentifier(email);
  if (existing) {
    return res.status(400).json({ error: 'Candidate with this email already registered.' });
  }

  const newId = `usr_${Date.now()}`;
  const generatedRoll = rollNumber || `SSC-2026-MTS-${Date.now().toString().slice(-4)}`;

  const newUser: User = {
    id: newId,
    rollNumber: generatedRoll,
    name,
    email,
    passwordHash: hashPassword(password || 'candidate123'),
    role: 'candidate',
    pwdCategory: pwdCategory || 'None',
    needScribe: Boolean(needScribe),
    examRegion: examRegion || 'Northern Region (NR)',
    examLanguage: examLanguage || 'English',
    createdAt: new Date().toISOString()
  };

  await repo.createUser(newUser);

  const isBlind = pwdCategory === 'Visually Impaired' || Boolean(needScribe) || Boolean(req.body.isBlindMode);
  const initialSettings: AccessibilitySettings = {
    userId: newId,
    theme: isBlind ? 'high_contrast_yellow' : 'sapphire',
    fontScale: isBlind ? 150 : 125,
    dyslexiaFont: false,
    speechRate: 1.0,
    speechPitch: 1.0,
    voiceURI: 'default',
    autoReadAloud: true,
    highContrastBorders: true,
    reduceMotion: false,
    compensatoryTimeEnabled: newUser.pwdCategory !== 'None',
    whisperModelSize: 'base',
    isBlindMode: isBlind
  };

  await repo.saveAccessibilitySettings(initialSettings);

  res.status(201).json({
    success: true,
    user: newUser,
    settings: initialSettings
  });
});

app.get('/api/auth/me', async (req, res) => {
  const repo = await getRepository();
  const candidate = (await repo.getUserById('usr_candidate_01')) || {
    id: 'usr_candidate_01',
    rollNumber: 'SSC-2026-MTS-01',
    name: 'Aarav Sharma (Candidate)',
    email: 'candidate@accessprep.nic.in',
    passwordHash: 'candidate123',
    role: 'candidate',
    pwdCategory: 'Visually Impaired',
    needScribe: true,
    examRegion: 'Northern Region (NR)',
    examLanguage: 'English',
    createdAt: '2026-03-01T10:00:00Z'
  };
  const settings = await repo.getAccessibilitySettings(candidate.id);
  res.json({ user: candidate, settings });
});

// -------------------------------------------------------------
// 3. QUESTIONS API (Verified SSC MTS Dataset)
// -------------------------------------------------------------
app.get('/api/questions', async (req, res) => {
  const repo = await getRepository();
  const { total, questions } = await repo.getQuestions(req.query as any);
  const off = Number(req.query.offset) || 0;
  const lim = Number(req.query.limit) || 20;

  res.json({
    total,
    count: questions.length,
    offset: off,
    limit: lim,
    questions
  });
});

app.get('/api/questions/:id', async (req, res) => {
  const repo = await getRepository();
  const q = await repo.getQuestionById(req.params.id);
  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json(q);
});

// -------------------------------------------------------------
// 4. PRACTICE SESSION SUBMISSION & BKT MASTERY UPDATE
// -------------------------------------------------------------
app.post('/api/practice/submit', async (req, res) => {
  const { userId, questionId, selectedOption, timeSpentSeconds, mode } = req.body;
  const repo = await getRepository();
  const q = await repo.getQuestionById(questionId);

  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }

  const isCorrect = String(selectedOption).toUpperCase() === q.correct_answer.toUpperCase();
  const uid = userId || 'usr_candidate_01';

  // 1. Prepare Attempt
  const attempt: PracticeAttempt = {
    id: `att_${Date.now()}`,
    userId: uid,
    questionId,
    selectedOption: String(selectedOption).toUpperCase(),
    isCorrect,
    timeSpentSeconds: Number(timeSpentSeconds) || 30,
    mode: mode === 'voice' ? 'voice' : 'standard',
    timestamp: new Date().toISOString()
  };

  // 2. Compute BKT Topic Mastery update
  const currentMasteryList = await repo.getTopicMastery(uid);
  const current = currentMasteryList.find((m) => m.topic === q.topic);
  const prevP = current ? current.p_known : 0.25;
  const attemptsCount = (current ? current.attemptsCount : 0) + 1;
  const correctCount = (current ? current.correctCount : 0) + (isCorrect ? 1 : 0);
  const newP = updateBKT(prevP, isCorrect);

  const bktRecord: TopicMasteryRecord = {
    id: current?.id || `mst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: uid,
    subject: q.subject,
    topic: q.topic,
    p_known: newP,
    masteryPercentage: Math.round(newP * 100),
    tier: classifyMasteryTier(newP),
    attemptsCount,
    correctCount,
    updatedAt: new Date().toISOString()
  };

  // 3. Compute SM-2 Revision Schedule update
  const revisionResult = await repo.getRevisionItems(uid);
  const existingRev = [...revisionResult.dueItems, ...revisionResult.upcomingItems].find(
    (r) => r.questionId === questionId
  );
  const quality = isCorrect ? (Number(timeSpentSeconds) < 40 ? 5 : 4) : 1;

  const currentSM2State = existingRev || {
    repetitions: 0,
    intervalDays: 1,
    easinessFactor: 2.5
  };

  const sm2Calc = calculateSM2(currentSM2State, quality);
  const sm2Record: RevisionItem = {
    id: existingRev?.id || `rev_${Date.now()}`,
    userId: uid,
    questionId,
    repetitions: sm2Calc.repetitions,
    intervalDays: sm2Calc.intervalDays,
    easinessFactor: sm2Calc.easinessFactor,
    lastReviewedAt: new Date().toISOString(),
    nextReviewDue: getNextReviewDate(sm2Calc.intervalDays),
    masteryLevel: sm2Calc.masteryLevel
  };

  // 4. Learning History Entry
  const historyEntry: LearningHistoryEntry = {
    id: `hist_${Date.now()}`,
    userId: uid,
    type: 'practice',
    title: `Practice: ${q.topic}`,
    summary: `${q.subject} - Q: ${q.question_text.substring(0, 40)}... (Result: ${isCorrect ? 'Correct' : 'Incorrect'})`,
    score: isCorrect ? 3 : 0,
    maxScore: 3,
    durationSeconds: Number(timeSpentSeconds) || 30,
    timestamp: new Date().toISOString()
  };

  // Execute transactional write
  await repo.recordPracticeAttempt(attempt, bktRecord, sm2Record, historyEntry);

  res.json({
    success: true,
    isCorrect,
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
    mastery: bktRecord,
    nextReviewDue: sm2Record.nextReviewDue
  });
});

// -------------------------------------------------------------
// 5. MOCK EXAMINATION SUBMISSION & RESULTS
// -------------------------------------------------------------
app.post('/api/mock/submit', async (req, res) => {
  const { userId, examTitle, submissions, answers } = req.body;
  const repo = await getRepository();
  const allQuestions = loadQuestions();
  const uid = userId || 'usr_candidate_01';

  // Construct submissions array with verified correct answers
  const formattedSubmissions: QuestionSubmission[] = (submissions || []).map((s: any) => {
    const q = allQuestions.find((item) => item.question_id === s.questionId);
    return {
      questionId: s.questionId,
      subject: q ? q.subject : s.subject,
      selectedOption: s.selectedOption || null,
      correctAnswer: q ? q.correct_answer : 'A',
      timeSpentSeconds: Number(s.timeSpentSeconds) || 0
    };
  });

  const evalResult = evaluateSubmission(formattedSubmissions);

  const mockAttempt: MockExamAttempt = {
    id: `mock_${Date.now()}`,
    userId: uid,
    examTitle: examTitle || 'SSC MTS 2026 Full-Length Mock Exam #1',
    session1Score: evalResult.session1Score,
    session2Score: evalResult.session2Score,
    totalScore: evalResult.totalScore,
    totalMax: evalResult.totalMax,
    percentage: evalResult.totalPercentage,
    qualified: evalResult.session1Qualified,
    totalTimeSeconds: evalResult.totalTimeSeconds,
    answers: answers || {},
    completedAt: new Date().toISOString()
  };

  const historyEntry: LearningHistoryEntry = {
    id: `hist_mock_${Date.now()}`,
    userId: uid,
    type: 'mock_exam',
    title: mockAttempt.examTitle,
    summary: `Score: ${evalResult.totalScore}/${evalResult.totalMax} (${evalResult.totalPercentage}%). Session-I: ${evalResult.session1Qualified ? 'Qualified' : 'Not Qualified'}.`,
    score: evalResult.totalScore,
    maxScore: evalResult.totalMax,
    durationSeconds: evalResult.totalTimeSeconds,
    timestamp: new Date().toISOString()
  };

  await repo.recordMockAttempt(mockAttempt, historyEntry);

  res.json({
    success: true,
    attemptId: mockAttempt.id,
    evaluation: evalResult
  });
});

app.get('/api/mock/attempts', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const attempts = await repo.getMockAttempts(uid);
  res.json(attempts);
});

app.get('/api/mock/attempts/:id', async (req, res) => {
  const repo = await getRepository();
  const attempt = await repo.getMockAttemptById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: 'Mock attempt not found' });
  }
  res.json(attempt);
});

// -------------------------------------------------------------
// 6. REVISION PLANNER & SM-2
// -------------------------------------------------------------
app.get('/api/revision/items', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const result = await repo.getRevisionItems(uid);
  res.json(result);
});

app.get('/api/revision/queue', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const result = await repo.getRevisionItems(uid);

  const cards = [...result.dueItems, ...result.upcomingItems].map((item) => ({
    id: item.id,
    questionId: item.questionId,
    subject: item.question?.subject || 'Unknown',
    topic: item.question?.topic || 'Unknown',
    questionText: item.question?.question_text || '',
    correctAnswer: item.question?.correct_answer || '',
    explanation: item.question?.explanation || '',
    nextReviewDate: item.nextReviewDue,
    intervalDays: item.intervalDays,
    repetition: item.repetitions,
    easeFactor: item.easinessFactor,
    status: item.isDue ? 'due' : 'upcoming',
    isDue: item.isDue
  }));

  res.json({
    cards,
    totalCount: cards.length,
    dueTodayCount: result.dueTodayCount,
    upcomingCount: result.upcomingCount,
    dueItems: result.dueItems,
    upcomingItems: result.upcomingItems
  });
});

app.post('/api/revision/review', async (req, res) => {
  const { userId, questionId, quality } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  const item = await repo.reviewRevisionItem(uid, questionId, Number(quality) || 3);
  res.json({ success: true, item });
});

// -------------------------------------------------------------
// 7. KNOWLEDGE TOPIC MASTERY & PROGRESS ANALYTICS
// -------------------------------------------------------------
app.get('/api/mastery', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const mastery = await repo.getTopicMastery(uid);
  res.json(mastery);
});

app.get('/api/progress/analytics', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const analytics = await repo.getProgressAnalytics(uid);
  res.json(analytics);
});

app.get('/api/history', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const history = await repo.getLearningHistory(uid);
  res.json(history);
});

app.get('/api/history/detailed', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const allQuestions = loadQuestions();

  const attempts = (await repo.getProgressAnalytics(uid)).totalPracticeQuestions > 0
    ? (await repo.getQuestions({ limit: 1000 })).questions
    : [];

  // Return standard learning history entries formatted
  const history = await repo.getLearningHistory(uid);
  res.json(history);
});

// -------------------------------------------------------------
// 8. ACCESSIBILITY SETTINGS & PROFILE
// -------------------------------------------------------------
app.get('/api/settings/accessibility', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const settings = await repo.getAccessibilitySettings(uid);
  res.json(settings);
});

app.post('/api/settings/accessibility', async (req, res) => {
  const { userId, ...updates } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  const current = await repo.getAccessibilitySettings(uid);
  const updated = await repo.saveAccessibilitySettings({ ...current, ...updates, userId: uid });
  res.json({ success: true, settings: updated });
});

app.patch('/api/user/profile', async (req, res) => {
  const { userId, name, examRegion, examLanguage, pwdCategory, needScribe } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  try {
    const updated = await repo.updateUserProfile(uid, {
      name,
      examRegion,
      examLanguage,
      pwdCategory,
      needScribe: needScribe !== undefined ? Boolean(needScribe) : undefined
    });
    res.json({ success: true, user: updated });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// 9. DATASET SUMMARY & MODEL EVALUATION (Admin)
// -------------------------------------------------------------
app.get('/api/dataset/summary', (req, res) => {
  try {
    const reportPath = path.resolve(process.cwd(), 'src/data/dataset_validation_report.json');
    const dictPath = path.resolve(process.cwd(), 'src/data/data_dictionary.json');

    const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf-8')) : null;
    const dictionary = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf-8')) : null;
    const questions = loadQuestions();

    res.json({
      totalQuestions: questions.length,
      validationReport: report,
      dataDictionary: dictionary
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/model/evaluation', (req, res) => {
  try {
    const evalPath = path.resolve(process.cwd(), 'src/data/model_evaluation_report.json');
    if (!fs.existsSync(evalPath)) {
      return res.status(404).json({ error: 'Evaluation report not generated yet.' });
    }
    const report = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function getPythonExecutable(): string {
  const userPy = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe');
  if (fs.existsSync(userPy)) return userPy;
  return 'python3';
}

function getFFmpegDir(): string {
  try {
    const wingetBase = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetBase)) {
      const matches = fs.readdirSync(wingetBase).filter((d) => d.startsWith('Gyan.FFmpeg.Essentials'));
      for (const match of matches) {
        const subdirs = fs.readdirSync(path.join(wingetBase, match));
        for (const sub of subdirs) {
          const bin = path.join(wingetBase, match, sub, 'bin');
          if (fs.existsSync(path.join(bin, 'ffmpeg.exe'))) {
            return bin;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error finding ffmpeg dir:', e);
  }
  return '';
}

function getExecutionEnv(): NodeJS.ProcessEnv {
  const ffmpegDir = getFFmpegDir();
  const pyDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311');
  const pyScripts = path.join(pyDir, 'Scripts');
  const pathParts = [ffmpegDir, pyDir, pyScripts, process.env.PATH || ''].filter(Boolean);
  return {
    ...process.env,
    PATH: pathParts.join(path.delimiter)
  };
}

app.post('/api/model/predict', (req, res) => {
  const questionText = req.body.questionText || req.body.question_text;
  if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
    return res.status(400).json({ error: 'Question text is required for inference.' });
  }

  execFile(getPythonExecutable(), ['scripts/inference.py', questionText.trim()], { env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      console.error('Inference error:', error, stderr);
      return res.status(500).json({ error: 'Failed to run model inference', details: stderr });
    }
    try {
      const parsed = JSON.parse(stdout);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Invalid inference output format', raw: stdout });
    }
  });
});

app.post(['/api/model/train', '/api/model/retrain'], (req, res) => {
  execFile(getPythonExecutable(), ['scripts/train_model.py'], { env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      console.error('Training script error:', error, stderr);
      return res.status(500).json({ error: 'Model training pipeline failed', details: stderr });
    }
    const evalPath = path.resolve(process.cwd(), 'src/data/model_evaluation_report.json');
    const report = fs.existsSync(evalPath) ? JSON.parse(fs.readFileSync(evalPath, 'utf-8')) : null;
    res.json({
      success: true,
      logs: stdout,
      updatedReport: report
    });
  });
});

// -------------------------------------------------------------
// 10. AUDIO TRANSCRIPTION & WHISPER
// -------------------------------------------------------------
app.get('/api/audio/status', (req, res) => {
  execFile(getPythonExecutable(), ['-c', 'import whisper; print("ok")'], { timeout: 8000, env: getExecutionEnv() }, (err, stdout) => {
    if (!err && stdout.trim() === 'ok') {
      return res.json({ whisperAvailable: true, pythonAvailable: true });
    }
    execFile('python', ['-c', 'import whisper; print("ok")'], { timeout: 8000, env: getExecutionEnv() }, (err2, stdout2) => {
      const available = !err2 && stdout2.trim() === 'ok';
      res.json({ whisperAvailable: available, pythonAvailable: !err2 });
    });
  });
});

app.post('/api/audio/transcribe', upload.single('audio'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      error: 'No audio file received in upload payload.'
    });
  }

  const filePath = file.path;
  const scriptPath = path.resolve(process.cwd(), 'scripts/transcribe_audio.py');

  function cleanupTempFile() {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Error removing temp audio file:', e);
      }
    }
  }

  function handleWhisperUnavailable(lastError?: string) {
    cleanupTempFile();
    return res.json({
      success: false,
      whisperAvailable: false,
      error: 'Whisper speech recognition engine is not available on this server. Please use manual input.',
      details: lastError,
      requiresManualInput: true
    });
  }

  execFile(getPythonExecutable(), [scriptPath, filePath], { timeout: 45000, env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      execFile('python', [scriptPath, filePath], { timeout: 45000, env: getExecutionEnv() }, (err2, stdout2, stderr2) => {
        if (err2) {
          return handleWhisperUnavailable(err2.message || stderr2);
        }
        cleanupTempFile();
        try {
          const parsed = JSON.parse(stdout2);
          res.json({ ...parsed, whisperAvailable: true });
        } catch {
          res.json({ success: true, transcript: stdout2.trim(), confidence: 0.85, whisperAvailable: true });
        }
      });
      return;
    }

    cleanupTempFile();
    try {
      const parsed = JSON.parse(stdout);
      res.json({ ...parsed, whisperAvailable: true });
    } catch {
      res.json({ success: true, transcript: stdout.trim(), confidence: 0.85, whisperAvailable: true });
    }
  });
});

// -------------------------------------------------------------
// 11. AI SYLLABUS TUTOR WITH DETERMINISTIC PEDAGOGICAL FALLBACK
// -------------------------------------------------------------
app.post('/api/tutor/chat', async (req, res) => {
  const { message, query: queryTextParam, subject, topic } = req.body;
  const queryText = (message || queryTextParam || '').trim();

  if (!queryText) {
    return res.status(400).json({ error: 'Query message cannot be empty.' });
  }

  const allQuestions = loadQuestions();
  let relevant = allQuestions.filter((q) => {
    if (subject && q.subject.toLowerCase() !== subject.toLowerCase()) return false;
    if (topic && q.topic.toLowerCase() !== topic.toLowerCase()) return false;
    return true;
  });

  if (relevant.length === 0) {
    relevant = allQuestions.slice(0, 3);
  } else {
    relevant = relevant.slice(0, 3);
  }

  const repo = await getRepository();
  const uid = req.body.userId || 'usr_candidate_01';

  if (geminiClient) {
    try {
      const contextExcerpts = relevant
        .map(
          (q, idx) =>
            `Reference Item ${idx + 1} (${q.subject} - ${q.topic} - ${q.subtopic}):\n` +
            `Question: ${q.question_text}\nCorrect Answer: ${q.correct_answer}\nExplanation: ${q.explanation}\nSource: ${q.source_reference}`
        )
        .join('\n\n');

      const systemInstruction = `You are the official ACCESSPREP-X AI Syllabus Scribe and Pedagogical Tutor for candidates preparing for the Staff Selection Commission (SSC) Multi-Tasking Staff (MTS) Examination.
Your explanations MUST be:
1. Grounded strictly in the provided syllabus context and verified exam patterns.
2. Formatted for screen-reader accessibility: concise paragraphs, plain text formulas (e.g. Speed = Distance / Time), and step-by-step logic.
3. Supportive and encouraging for candidates with disabilities (PwD) under the RPwD Act 2016.
4. Conclude with a clear one-line "Takeaway Rule" for the exam.`;

      const prompt = `Candidate Syllabus Question:\n"${queryText}"\n\nVerified Curriculum Grounding Context:\n${contextExcerpts}\n\nPlease explain the concept, solve step-by-step, and state the relevant examination rule clearly.`;

      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
          }
        ]
      });

      const reply = response.text || 'Explanation unavailable.';
      try {
        await repo.recordLearningHistory({
          id: `hist_tutor_${Date.now()}`,
          userId: uid,
          type: 'ai_tutor',
          title: `${subject || 'SSC MTS'} - ${topic || 'Query'}`,
          summary: queryText.slice(0, 150),
          durationSeconds: 45,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Could not record AI tutor history:', e);
      }

      return res.json({
        success: true,
        reply,
        retrievedEvidence: relevant.map((r) => ({
          subject: r.subject,
          topic: r.topic,
          reference: r.source_reference
        }))
      });
    } catch (aiErr: any) {
      console.warn('Gemini API call failed, using deterministic syllabus guidance:', aiErr.message);
    }
  }

  // Deterministic pedagogical fallback based on syllabus repository
  let deterministicReply = `Here is the step-by-step explanation for your query on ${subject || 'SSC MTS'}:\n\n`;
  if (relevant.length > 0) {
    deterministicReply += `Key Principle (${relevant[0].topic} - ${relevant[0].subtopic}):\n${relevant[0].explanation}\n\n`;
    deterministicReply += `Example problem from official SSC MTS paper:\n"${relevant[0].question_text}"\nCorrect Answer: Option ${relevant[0].correct_answer}`;
  } else {
    deterministicReply += `In SSC MTS examinations, always solve by breaking the problem into foundational steps: identify the given quantities, apply the verified syllabus theorem or grammar rule, and double-check units and options.`;
  }

  try {
    await repo.recordLearningHistory({
      id: `hist_tutor_${Date.now()}`,
      userId: uid,
      type: 'ai_tutor',
      title: `${subject || 'SSC MTS'} - ${topic || 'Query'}`,
      summary: queryText.slice(0, 150),
      durationSeconds: 45,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Could not record AI tutor history:', e);
  }

  res.json({
    success: true,
    reply: deterministicReply,
    retrievedEvidence: relevant.map((r) => ({
      subject: r.subject,
      topic: r.topic,
      reference: r.source_reference
    }))
  });
});

// FIX 4: GET /api/subjects
app.get('/api/subjects', (req, res) => {
  const questions = loadQuestions();
  const subjectsMap: Record<string, { topics: Set<string>; count: number }> = {};
  questions.forEach((q) => {
    if (!subjectsMap[q.subject]) subjectsMap[q.subject] = { topics: new Set(), count: 0 };
    subjectsMap[q.subject].topics.add(q.topic);
    subjectsMap[q.subject].count++;
  });
  const subjects = Object.entries(subjectsMap).map(([name, data]) => ({
    name,
    topicCount: data.topics.size,
    questionCount: data.count,
    topics: [...data.topics].sort()
  }));
  res.json(subjects);
});

// FIX 3: POST /api/questions - add a new question
app.post('/api/questions', (req, res) => {
  const body = req.body;
  const question_id = body.question_id || `SSC-MTS-USR-${Date.now()}`;

  const required = ['subject', 'topic', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'explanation', 'difficulty_label', 'source_name', 'source_reference', 'source_type'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!['A', 'B', 'C', 'D'].includes(String(body.correct_answer).toUpperCase())) {
    return res.status(400).json({ error: 'correct_answer must be one of A, B, C, or D.' });
  }

  if (!['Easy', 'Medium', 'Hard'].includes(body.difficulty_label)) {
    return res.status(400).json({ error: 'difficulty_label must be Easy, Medium, or Hard.' });
  }

  const now = new Date().toISOString();
  const newQuestion = {
    question_id,
    subject: body.subject,
    topic: body.topic,
    subtopic: body.subtopic || '',
    question_text: body.question_text,
    question_type: body.question_type || 'multiple_choice',
    option_a: body.option_a,
    option_b: body.option_b,
    option_c: body.option_c,
    option_d: body.option_d,
    correct_answer: String(body.correct_answer).toUpperCase(),
    explanation: body.explanation,
    difficulty_label: body.difficulty_label,
    source_name: body.source_name,
    source_reference: body.source_reference,
    source_type: body.source_type,
    verification_status: body.verification_status || 'Pending',
    language: body.language || 'English',
    created_at: body.created_at || now,
    updated_at: body.updated_at || now,
    dataset_version: body.dataset_version || 'v1.0-mts-verified'
  };

  const questionsFilePath = path.resolve(process.cwd(), 'src/data/ssc_mts_questions.json');
  let questions: any[] = [];
  try {
    if (fs.existsSync(questionsFilePath)) {
      questions = JSON.parse(fs.readFileSync(questionsFilePath, 'utf-8'));
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load questions dataset.' });
  }

  if (questions.find((q) => q.question_id === question_id)) {
    return res.status(409).json({ error: `Duplicate question_id: ${question_id}` });
  }

  questions.push(newQuestion);

  try {
    fs.writeFileSync(questionsFilePath, JSON.stringify(questions, null, 2), 'utf-8');
    resetQuestionsCache();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save question to dataset.' });
  }

  res.status(201).json({
    success: true,
    questionId: question_id,
    message: 'Question added to dataset. Awaiting human verification before entering verified learning bank.'
  });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE / STATIC ASSET SERVING
// -------------------------------------------------------------
async function startServer() {
  // Safe database initialization
  try {
    latestMigrationReport = await runDatabaseMigration();
    console.log(`[Database Initialization]: ${latestMigrationReport.message} (Engine: ${latestMigrationReport.databaseEngine})`);
  } catch (migErr: any) {
    console.warn('[Database Migration Notice]:', migErr.message);
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ACCESSPREP-X Portal running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
