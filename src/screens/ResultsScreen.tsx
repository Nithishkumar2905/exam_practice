import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Brain,
  Calendar,
  RotateCcw,
  Check,
  AlertTriangle,
  HelpCircle,
  FileText
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { MockExamAttempt, Question } from '../db/database.ts';
import { QuestionReview, QuestionReviewItem } from '../components/results/QuestionReview.tsx';

export function ResultsScreen() {
  const { navigateTo, user, speakText, announce } = useAccessibility();

  const [attempt, setAttempt] = useState<MockExamAttempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = user?.id || 'usr_candidate_01';
    fetch(`/api/mock/attempts?userId=${uid}`)
      .then((r) => r.json())
      .then((attempts: MockExamAttempt[]) => {
        if (attempts && attempts.length > 0) {
          setAttempt(attempts[0]); // most recent attempt
        }
      })
      .catch((e) => console.warn('Fetch mock attempt error:', e));

    fetch('/api/questions?limit=400')
      .then((r) => r.json())
      .then((data) => setQuestions(data.questions || []))
      .catch((e) => console.warn('Fetch questions error:', e))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const resultsSpeech = attempt
    ? `Examination Results Summary: Total score is ${attempt.totalScore} out of ${attempt.totalMax}, which is ${attempt.percentage} percent. In Session I, you scored ${attempt.session1Score} marks and are ${attempt.qualified ? 'Qualified' : 'Not Qualified'}. In Session II, you scored ${attempt.session2Score} marks.`
    : 'No examination attempt found.';

  const handleAddToRevision = async (questionId: string) => {
    try {
      await fetch('/api/revision/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, questionId, quality: 2 })
      });
      announce('Question added to Spaced Repetition Revision Planner.', 'polite');
    } catch (e) {
      console.error('Add to revision error:', e);
    }
  };

  if (loading || !attempt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-600" id="main-content">
        <p className="text-base font-bold">No completed examination attempt on record.</p>
        <button
          type="button"
          onClick={() => navigateTo('mock_exam')}
          className="mt-4 px-6 py-2.5 bg-blue-700 text-white font-bold text-xs rounded-lg"
        >
          Attempt Full Mock Exam
        </button>
      </div>
    );
  }

  // Build normalized question review items for the shared QuestionReview component
  const reviewItems: QuestionReviewItem[] = Object.entries(attempt.answers)
    .map(([qid, ans], index) => {
      const q = questions.find((item) => item.question_id === qid);
      if (!q) return null;
      const isAnswered = ans.selectedOption !== null;
      const isCorrect =
        isAnswered && ans.selectedOption?.toUpperCase() === q.correct_answer.toUpperCase();
      const status = !isAnswered ? 'unattempted' : isCorrect ? 'correct' : 'incorrect';
      const isSession1 =
        q.subject === 'Numerical and Mathematical Ability' ||
        q.subject === 'Reasoning Ability and Problem Solving';
      const marksDelta =
        status === 'correct' ? 3 : status === 'incorrect' ? (isSession1 ? 0 : -1) : 0;

      return {
        questionNumber: index + 1,
        questionId: qid,
        questionText: q.question_text,
        subject: q.subject,
        topic: q.topic,
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d,
        },
        selectedOption: ans.selectedOption,
        correctOption: q.correct_answer,
        status,
        marksDelta,
        timeSpentSeconds:
          typeof (ans as { timeSpentSeconds?: number }).timeSpentSeconds === 'number'
            ? (ans as { timeSpentSeconds?: number }).timeSpentSeconds
            : null,
        explanation: q.explanation,
        sourceReference: q.source_reference,
        sourceName: q.source_name,
        markedForReview: Boolean(ans.markedForReview),
      } as QuestionReviewItem;
    })
    .filter((item): item is QuestionReviewItem => item !== null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8" id="main-content">
      {/* 1. Header & Audio Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div>
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
            Screen 8 of 16 · Academic Evaluation
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Examination Results &amp; Step-by-Step Explanations
          </h1>
          <p className="text-sm text-slate-600">
            {attempt.examTitle} · Completed on {new Date(attempt.completedAt).toLocaleDateString()}
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={resultsSpeech} label="Listen to results summary" />
        </div>
      </div>

      {/* 2. Official Sectional Scoreboards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Score */}
        <div className="p-6 bg-white border-2 border-slate-300 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Overall Aggregate</span>
            <Award className="w-5 h-5 text-blue-700" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-blue-900">{attempt.totalScore}</span>
            <span className="text-sm font-semibold text-slate-500">/ {attempt.totalMax}</span>
          </div>
          <div className="pt-2 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Percentage: {attempt.percentage}%</span>
            <span>Duration: {Math.round(attempt.totalTimeSeconds / 60)} min</span>
          </div>
        </div>

        {/* Session I (Qualifying) */}
        <div className="p-6 bg-blue-50/70 border-2 border-blue-400 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-blue-900">
            <span className="text-xs font-bold uppercase tracking-wider">Session-I (Math + Reasoning)</span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-bold ${
                attempt.qualified ? 'bg-emerald-200 text-emerald-950' : 'bg-red-200 text-red-950'
              }`}
            >
              {attempt.qualified ? 'QUALIFIED' : 'NOT QUALIFIED'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-blue-950">{attempt.session1Score}</span>
            <span className="text-sm font-semibold text-slate-500">/ 120</span>
          </div>
          <p className="text-xs text-slate-600">
            Official Rule: Qualifying session only. No negative marking applied.
          </p>
        </div>

        {/* Session II (Merit) */}
        <div className="p-6 bg-purple-50/70 border-2 border-purple-400 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-purple-900">
            <span className="text-xs font-bold uppercase tracking-wider">Session-II (GK + English)</span>
            <span className="text-xs font-bold px-2 py-0.5 bg-purple-200 text-purple-950 rounded">
              MERIT RANKING
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-purple-950">{attempt.session2Score}</span>
            <span className="text-sm font-semibold text-slate-500">/ 150</span>
          </div>
          <p className="text-xs text-slate-600">
            Official Rule: Determines final selection. -1 negative marking deducted per wrong answer.
          </p>
        </div>
      </div>

      {/* 3. Shared Detailed Question Review */}
      <QuestionReview
        items={reviewItems}
        onAddToRevision={handleAddToRevision}
        onAskAiTutor={() => navigateTo('ai_tutor')}
      />
    </div>
  );
}
