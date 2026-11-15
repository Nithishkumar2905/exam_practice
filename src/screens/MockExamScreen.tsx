import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  AlertCircle,
  HelpCircle,
  Flag,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Volume2,
  ShieldAlert,
  X,
  Mic,
  Pause,
  Play,
  Square,
  List
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { VoiceInputButton } from '../components/VoiceInputButton.tsx';
import { Question } from '../db/database.ts';
import { parseSpokenAnswer } from '../utils/answerParser.ts';
import {
  formatFullQuestionPrompt,
  formatAllOptionsPrompt,
  formatSingleOptionPrompt
} from '../utils/repeatQuestionHelper.ts';

export function MockExamScreen() {
  const {
    navigateTo,
    user,
    settings,
    speakText,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    isPausedSpeaking,
    slowDownSpeech,
    isSpeaking,
    announce,
    isBlindMode,
    playBeacon,
    startVoiceListening,
    registerVoiceHandler,
    setIsExamActive
  } = useAccessibility();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [assignmentId, setAssignmentId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('mockExamAssignmentId');
    } catch {
      return null;
    }
  });
  const [sequenceNumber, setSequenceNumber] = useState<number | null>(() => {
    try {
      const s = sessionStorage.getItem('mockExamSequenceNumber');
      return s ? Number(s) : null;
    } catch {
      return null;
    }
  });

  // Rotation & Cycle States
  const [cycleNumber, setCycleNumber] = useState<number>(1);
  const [isNearingExhaustion, setIsNearingExhaustion] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);
  const [isResettingCycle, setIsResettingCycle] = useState(false);
  const [rotationStats, setRotationStats] = useState<{
    completedQuestionsInCycle: number;
    remainingUnusedQuestions: number;
    isNearingExhaustion: boolean;
    isExhausted: boolean;
    cycleNumber: number;
  } | null>(null);

  // Exam answers map: questionId -> { selectedOption, timeSpent, markedForReview }
  const [answers, setAnswers] = useState<
    Record<string, { selectedOption: string | null; timeSpent: number; markedForReview: boolean }>
  >({});

  // Countdown Timer in seconds
  // Standard: 90 min (5400s), PwD: 120 min (7200s)
  const isPwD = user?.pwdCategory !== 'None' || settings.compensatoryTimeEnabled;
  const initialSeconds = isPwD ? 7200 : 5400;
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentIdxRef = useRef<number>(currentIdx);
  currentIdxRef.current = currentIdx;

  const questionsRef = useRef<Question[]>(questions);
  questionsRef.current = questions;

  const secondsRemainingRef = useRef<number>(secondsRemaining);
  secondsRemainingRef.current = secondsRemaining;

  const assignmentIdRef = useRef<string | null>(assignmentId);
  assignmentIdRef.current = assignmentId;

  const sequenceNumberRef = useRef<number | null>(sequenceNumber);
  sequenceNumberRef.current = sequenceNumber;

  // Session storage recovery: restore exam progress on mount
  useEffect(() => {
    const savedAnswers = sessionStorage.getItem('mockExamAnswers');
    const savedTimer = sessionStorage.getItem('mockExamTimer');
    const savedIndex = sessionStorage.getItem('mockExamIndex');
    if (savedAnswers && savedTimer) {
      try {
        const parsed = JSON.parse(savedAnswers);
        setAnswers(parsed);
        setSecondsRemaining(Number(savedTimer));
        setCurrentIdx(Number(savedIndex) || 0);
        announce('Exam session restored. Your progress has been recovered.', 'polite');
      } catch {}
    }
  }, [announce]);

  // Session storage persistence: save exam progress whenever answers/timer/index change
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sessionStorage.setItem('mockExamAnswers', JSON.stringify(answers));
      sessionStorage.setItem('mockExamTimer', String(secondsRemaining));
      sessionStorage.setItem('mockExamIndex', String(currentIdx));
    }
  }, [answers, secondsRemaining, currentIdx]);

  // Register active exam status with global NavigationController so it can intercept navigation
  useEffect(() => {
    if (!loading && questions.length > 0 && !isExhausted) {
      setIsExamActive(true);
    }
    return () => {
      // Deregister when component unmounts (submit or navigate away)
      setIsExamActive(false);
    };
  }, [loading, questions.length, isExhausted, setIsExamActive]);

  const loadMockExam = useCallback(() => {
    setLoading(true);
    const uid = user?.id || 'usr_candidate_01';

    // Fetch student's current cycle rotation metrics
    fetch(`/api/mock/rotation-status?userId=${encodeURIComponent(uid)}`)
      .then((r) => r.json())
      .then((statData) => {
        if (statData.success) {
          setRotationStats({
            completedQuestionsInCycle: statData.completedQuestionsInCycle,
            remainingUnusedQuestions: statData.remainingUnusedQuestions,
            isNearingExhaustion: statData.isNearingExhaustion,
            isExhausted: statData.isExhausted,
            cycleNumber: statData.cycleNumber
          });
        }
      })
      .catch((e) => console.warn('Rotation status load failed:', e));

    fetch('/api/mock/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.isExhausted) {
          setIsExhausted(true);
          setCycleNumber(data.cycleNumber || 1);
          setQuestions([]);
          setLoading(false);
          announce('You have completed all available Mock Examination questions. Would you like to start a new question cycle?', 'assertive');
          speakText('You have completed all available Mock Examination questions. Would you like to start a new question cycle? Say "Start new cycle" or press the button.');
          return;
        }

        if (!data.success || !Array.isArray(data.questions)) {
          throw new Error(data.error || 'Failed to load mock examination questions.');
        }

        const qList: Question[] = data.questions;
        const asgId = data.assignment?.id || null;
        const seq = data.assignment?.sequenceNumber || 1;
        const activeCycle = data.cycleNumber || 1;

        setQuestions(qList);
        setAssignmentId(asgId);
        setSequenceNumber(seq);
        setCycleNumber(activeCycle);
        setIsNearingExhaustion(Boolean(data.isNearingExhaustion));
        setIsExhausted(false);
        assignmentIdRef.current = asgId;
        sequenceNumberRef.current = seq;

        if (asgId) sessionStorage.setItem('mockExamAssignmentId', asgId);
        if (seq) sessionStorage.setItem('mockExamSequenceNumber', String(seq));

        // Restore saved answers if present in sessionStorage, or initialize
        const savedAnswersRaw = sessionStorage.getItem('mockExamAnswers');
        const savedTimer = sessionStorage.getItem('mockExamTimer');
        let parsedSaved: Record<string, any> = {};
        if (savedAnswersRaw) {
          try {
            parsedSaved = JSON.parse(savedAnswersRaw);
          } catch {}
        }

        const initialAnswers: Record<string, any> = {};
        qList.forEach((q: Question) => {
          if (parsedSaved[q.question_id]) {
            initialAnswers[q.question_id] = parsedSaved[q.question_id];
          } else {
            initialAnswers[q.question_id] = { selectedOption: null, timeSpent: 0, markedForReview: false };
          }
        });
        setAnswers(initialAnswers);

        // Proportional timer calculation when no prior session timer exists:
        // 60s per question (standard) or 80s per question (PwD compensatory time)
        if (!savedTimer) {
          const baseRate = isPwD ? 80 : 60;
          const proportionalSeconds = qList.length * baseRate;
          setSecondsRemaining(proportionalSeconds);
        }

        if (data.resumed) {
          announce(`Resumed Mock Examination #${seq}. Progress recovered.`, 'polite');
        } else if (data.isNearingExhaustion) {
          announce(`Notice: Nearing question bank exhaustion. Only ${qList.length} unused questions remain in cycle ${activeCycle}.`, 'assertive');
          speakText(`Notice: Nearing question bank exhaustion. Only ${qList.length} unused questions remain in question cycle ${activeCycle}. This examination will contain ${qList.length} questions.`);
        } else {
          announce(`Mock Examination #${seq} loaded with ${qList.length} fresh questions.`, 'polite');
        }
      })
      .catch((e) => {
        console.warn('Mock rotation start failed, falling back to static questions:', e);
        fetch('/api/questions?limit=400')
          .then((r) => r.json())
          .then((data) => {
            const allQ: Question[] = data.questions || [];
            const mathQ = allQ.filter((q) => q.subject === 'Numerical and Mathematical Ability').slice(0, 20);
            const reasoningQ = allQ.filter((q) => q.subject === 'Reasoning Ability and Problem Solving').slice(0, 20);
            const gaQ = allQ.filter((q) => q.subject === 'General Awareness').slice(0, 25);
            const englishQ = allQ.filter((q) => q.subject === 'English Language and Comprehension').slice(0, 25);

            const balanced90 = [...mathQ, ...reasoningQ, ...gaQ, ...englishQ];
            const qList = balanced90.length === 90 ? balanced90 : allQ.slice(0, 90);

            setQuestions(qList);
            const initialAnswers: Record<string, any> = {};
            qList.forEach((q: Question) => {
              initialAnswers[q.question_id] = { selectedOption: null, timeSpent: 0, markedForReview: false };
            });
            setAnswers(initialAnswers);
          })
          .catch((err) => console.warn('Mock questions error:', err));
      })
      .finally(() => setLoading(false));
  }, [user?.id, isPwD, announce, speakText]);

  useEffect(() => {
    loadMockExam();
  }, [loadMockExam]);

  const handleResetCycle = useCallback(async () => {
    setIsResettingCycle(true);
    try {
      const uid = user?.id || 'usr_candidate_01';
      const res = await fetch('/api/mock/reset-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem('mockExamAnswers');
        sessionStorage.removeItem('mockExamTimer');
        sessionStorage.removeItem('mockExamIndex');
        sessionStorage.removeItem('mockExamAssignmentId');
        sessionStorage.removeItem('mockExamSequenceNumber');
        setIsExhausted(false);
        setCycleNumber(data.cycleNumber);
        announce(`Started question cycle ${data.cycleNumber}. Loading fresh examination.`, 'polite');
        speakText(`Started question cycle ${data.cycleNumber}. Loading fresh examination.`);
        loadMockExam();
      }
    } catch (err) {
      console.error('Reset cycle error:', err);
      announce('Failed to reset question cycle. Please try again.', 'assertive');
    } finally {
      setIsResettingCycle(false);
    }
  }, [user?.id, announce, speakText, loadMockExam]);

  const handleFinalSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const submissions = questionsRef.current.map((q) => ({
        questionId: q.question_id,
        subject: q.subject,
        selectedOption: answers[q.question_id]?.selectedOption || null,
        timeSpentSeconds: answers[q.question_id]?.timeSpent || 40
      }));

      const res = await fetch('/api/mock/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          assignmentId: assignmentIdRef.current,
          examTitle: `SSC MTS 2026 Official Pattern Mock Examination #${sequenceNumberRef.current || 1}`,
          submissions,
          answers
        })
      });

      await res.json();
      sessionStorage.removeItem('mockExamAnswers');
      sessionStorage.removeItem('mockExamTimer');
      sessionStorage.removeItem('mockExamIndex');
      sessionStorage.removeItem('mockExamAssignmentId');
      sessionStorage.removeItem('mockExamSequenceNumber');
      setIsExamActive(false); // Deregister before navigating to results
      announce('Examination submitted successfully. Reviewing results...', 'assertive');
      speakText('Examination submitted successfully. Loading scorecard and results analysis.', () => {
        navigateTo('results');
      });
    } catch (e) {
      console.error('Submit exam error:', e);
    } finally {
      setIsSubmitting(false);
      setShowSubmitModal(false);
    }
  }, [answers, user?.id, announce, speakText, navigateTo]);

  // Timer interval with high-priority spoken compensatory time announcements
  useEffect(() => {
    if (secondsRemaining <= 0) {
      handleFinalSubmit();
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === 900) {
          playBeacon('alert');
          announce('15 minutes remaining in examination.', 'assertive');
          speakText('Attention candidate: 15 minutes remaining in examination.');
        } else if (prev === 300) {
          playBeacon('alert');
          announce('5 minutes remaining. Please review your answers.', 'assertive');
          speakText('Attention candidate: 5 minutes remaining. Please review your answers.');
        } else if (prev === 60) {
          playBeacon('alert');
          announce('1 minute remaining. Exam will automatically submit.', 'assertive');
          speakText('Attention candidate: 1 minute remaining. The exam will automatically submit.');
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, announce, speakText, playBeacon, handleFinalSubmit]);

  const currentQ = questions[currentIdx];

  // Step A: Read question and options aloud automatically
  const readQuestionAloud = useCallback((q: Question, idx: number, total: number) => {
    if (!q) return;
    const prompt = formatFullQuestionPrompt(q, idx, total);
    announce(`Reading Question ${idx + 1} of ${total}`, 'polite');
    speakText(prompt, () => {
      playBeacon('listening');
      startVoiceListening();
    });
  }, [speakText, playBeacon, startVoiceListening, announce]);

  const repeatOptionsAloud = useCallback((q: Question) => {
    if (!q) return;
    const prompt = formatAllOptionsPrompt(q);
    announce('Reading question options', 'polite');
    speakText(prompt, () => {
      playBeacon('listening');
      startVoiceListening();
    });
  }, [speakText, playBeacon, startVoiceListening, announce]);

  const repeatSingleOptionAloud = useCallback((q: Question, opt: 'A' | 'B' | 'C' | 'D') => {
    if (!q) return;
    const prompt = formatSingleOptionPrompt(q, opt);
    announce(`Reading Option ${opt}`, 'polite');
    speakText(prompt, () => {
      playBeacon('listening');
      startVoiceListening();
    });
  }, [speakText, playBeacon, startVoiceListening, announce]);

  // Read aloud on mount or question index change
  useEffect(() => {
    if (currentQ && (isBlindMode || settings.autoReadAloud)) {
      readQuestionAloud(currentQ, currentIdx, questions.length);
    }
  }, [currentIdx, currentQ?.question_id, isBlindMode, settings.autoReadAloud, readQuestionAloud, questions.length]);

  // Record an answer and auto-advance
  const handleRecordOption = useCallback((optKey: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.question_id]: {
        ...prev[currentQ.question_id],
        selectedOption: optKey
      }
    }));
    playBeacon('success');
    announce(`Selected Option ${optKey}`, 'polite');

    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < questionsRef.current.length) {
      speakText(`Recorded Option ${optKey}. Moving to next question.`, () => {
        setCurrentIdx(nextIdx);
      });
    } else {
      speakText(`Recorded Option ${optKey}. You have reached the end of the test. Say 'Submit' to submit your exam, or 'Review' to go back.`);
    }
  }, [currentQ, playBeacon, announce, speakText]);

  const handleSelectOption = (optKey: string) => {
    handleRecordOption(optKey);
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.question_id]: {
        ...prev[currentQ.question_id],
        selectedOption: null
      }
    }));
    announce('Cleared response for current question.', 'polite');
    speakText('Response cleared for this question.');
  };

  const handleToggleMarkForReview = useCallback(() => {
    if (!currentQ) return;
    const curState = answers[currentQ.question_id]?.markedForReview;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.question_id]: {
        ...prev[currentQ.question_id],
        markedForReview: !curState
      }
    }));

    if (!curState) {
      announce('Marked question for review', 'polite');
      speakText('Marked question for review. Moving to next question.', () => {
        if (currentIdxRef.current < questionsRef.current.length - 1) {
          setCurrentIdx((prev) => prev + 1);
        }
      });
    } else {
      announce('Unmarked question from review', 'polite');
      speakText('Unmarked question from review.');
    }
  }, [currentQ, answers, announce, speakText]);

  // Step C: Spoken Answer Parsing & Voice Navigation Handler
  useEffect(() => {
    if (!currentQ) return;

    const unregister = registerVoiceHandler((transcript: string) => {
      const optionsMap = {
        A: currentQ.option_a,
        B: currentQ.option_b,
        C: currentQ.option_c,
        D: currentQ.option_d
      };

      const parsed = parseSpokenAnswer(transcript, optionsMap);

      if (parsed) {
        if (parsed.type === 'control') {
          if (parsed.command === 'repeat') {
            readQuestionAloud(currentQ, currentIdxRef.current, questionsRef.current.length);
            return true;
          }
          if (parsed.command === 'repeat_options') {
            repeatOptionsAloud(currentQ);
            return true;
          }
          if (parsed.command === 'repeat_option_a') {
            repeatSingleOptionAloud(currentQ, 'A');
            return true;
          }
          if (parsed.command === 'repeat_option_b') {
            repeatSingleOptionAloud(currentQ, 'B');
            return true;
          }
          if (parsed.command === 'repeat_option_c') {
            repeatSingleOptionAloud(currentQ, 'C');
            return true;
          }
          if (parsed.command === 'repeat_option_d') {
            repeatSingleOptionAloud(currentQ, 'D');
            return true;
          }
          if (parsed.command === 'read_slower') {
            slowDownSpeech();
            return true;
          }
          if (parsed.command === 'pause_reading') {
            pauseSpeaking();
            announce('Audio paused', 'polite');
            return true;
          }
          if (parsed.command === 'resume_reading') {
            resumeSpeaking();
            announce('Audio resumed', 'polite');
            return true;
          }
          if (parsed.command === 'stop_speaking') {
            stopSpeaking();
            announce('Audio stopped', 'polite');
            return true;
          }
          if (parsed.command === 'skip') {
            if (currentIdxRef.current < questionsRef.current.length - 1) {
              speakText('Skipping to next question.', () => {
                setCurrentIdx((prev) => prev + 1);
              });
            } else {
              speakText("You are at the final question. Say 'Submit' to submit your exam, or 'Review' to go back.");
            }
            return true;
          }
          if (parsed.command === 'previous') {
            if (currentIdxRef.current > 0) {
              setCurrentIdx((prev) => prev - 1);
            }
            return true;
          }
          if (parsed.command === 'mark_review') {
            handleToggleMarkForReview();
            return true;
          }
          if (parsed.command === 'timer') {
            const mins = Math.ceil(secondsRemainingRef.current / 60);
            speakText(`You have ${mins} minutes remaining in the examination.`);
            return true;
          }
          if (parsed.command === 'submit') {
            handleFinalSubmit();
            return true;
          }
          if (parsed.command === 'review') {
            speakText('Returning to first question for review.', () => {
              setCurrentIdx(0);
            });
            return true;
          }
        }

        if (parsed.type === 'option') {
          handleRecordOption(parsed.option);
          return true;
        }
      }

      return false; // Global fallback
    });

    return () => unregister();
  }, [currentQ, registerVoiceHandler, readQuestionAloud, handleToggleMarkForReview, handleRecordOption, handleFinalSubmit, speakText]);

  // Voice handler when question repository is exhausted
  useEffect(() => {
    if (!isExhausted) return;

    const unregister = registerVoiceHandler((transcript: string) => {
      const t = transcript.toLowerCase();
      if (
        t.includes('start new cycle') ||
        t.includes('start cycle') ||
        t.includes('reset cycle') ||
        t.includes('new cycle') ||
        t.includes('yes') ||
        t.includes('confirm')
      ) {
        handleResetCycle();
        return true;
      }
      if (t.includes('dashboard') || t.includes('home') || t.includes('go back')) {
        navigateTo('dashboard');
        return true;
      }
      return false;
    });

    return () => unregister();
  }, [isExhausted, registerVoiceHandler, handleResetCycle, navigateTo]);

  // Single-key WCAG keyboard accessibility backup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        e.preventDefault();
        handleRecordOption(key);
      } else if (['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        handleRecordOption(map[key]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (currentQ) readQuestionAloud(currentQ, currentIdx, questions.length);
      } else if (e.altKey && key === 'H') {
        e.preventDefault();
        handleToggleMarkForReview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQ, currentIdx, questions.length, handleRecordOption, readQuestionAloud, handleToggleMarkForReview]);

  // Format Timer
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (isExhausted) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6" id="main-content">
        <div className="bg-white border-2 border-blue-600 rounded-2xl p-8 shadow-lg space-y-6">
          <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto">
            <RotateCcw className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
              Question Cycle {cycleNumber} Complete
            </span>
            <h1 className="text-2xl font-black text-slate-900">
              All Mock Examination Questions Completed
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              You have completed all 400 available Mock Examination questions across your current cycle (Cycle {cycleNumber}). All your past attempts, scores, and analytics are preserved.
            </p>
            <p className="text-sm font-semibold text-blue-900">
              Would you like to start a new question cycle?
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleResetCycle}
              disabled={isResettingCycle}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${isResettingCycle ? 'animate-spin' : ''}`} />
              <span>{isResettingCycle ? 'Initializing Cycle...' : 'Start New Question Cycle'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-xl border border-slate-300 transition-all"
            >
              Return to Dashboard
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Tip: You can also say &quot;Start new cycle&quot; or &quot;Dashboard&quot; using voice commands.
          </p>
        </div>
      </div>
    );
  }

  if (loading || !currentQ) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-600" id="main-content">
        Initializing Official SSC MTS Mock Examination...
      </div>
    );
  }

  // Question stats summary
  let answeredCount = 0;
  let markedCount = 0;
  Object.values(answers).forEach((a) => {
    if (a.selectedOption) answeredCount++;
    if (a.markedForReview) markedCount++;
  });

  const questionSpeech = `Question ${currentIdx + 1}: ${currentQ.question_text}. Option A: ${currentQ.option_a}. Option B: ${currentQ.option_b}. Option C: ${currentQ.option_c}. Option D: ${currentQ.option_d}.`;

  const options = [
    { key: 'A', text: currentQ.option_a },
    { key: 'B', text: currentQ.option_b },
    { key: 'C', text: currentQ.option_c },
    { key: 'D', text: currentQ.option_d }
  ];

  const currentSelection = answers[currentQ.question_id]?.selectedOption;
  const isMarked = answers[currentQ.question_id]?.markedForReview;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" id="main-content">
      {/* 0. Rotation Status & Progress Bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 font-medium">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold px-2 py-0.5 bg-blue-700 text-white rounded">
            Cycle {cycleNumber}
          </span>
          <span>
            Examination: <strong>#{sequenceNumber || 1}</strong>
          </span>
          <span>·</span>
          <span>
            Questions in Exam: <strong>{questions.length}</strong>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Completed in Cycle: <strong>{rotationStats ? rotationStats.completedQuestionsInCycle : ((sequenceNumber || 1) - 1) * 90}</strong> / 400
          </span>
          <span>·</span>
          <span>
            Remaining Unused: <strong>{rotationStats ? rotationStats.remainingUnusedQuestions : Math.max(0, 400 - ((sequenceNumber || 1) - 1) * 90)}</strong>
          </span>
        </div>
      </div>

      {/* 0b. Nearing Exhaustion Alert Banner */}
      {isNearingExhaustion && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-400 p-4 rounded-xl flex items-center gap-3 text-amber-950 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs sm:text-sm">
            <strong className="font-bold">Notice: Nearing Question Bank Exhaustion. </strong>
            <span>
              Only {questions.length} unused questions remain in Cycle {cycleNumber}. All remaining unused questions have been selected for this exam. Timer ({formatTime(secondsRemaining)}) and maximum marks ({questions.length * 3} marks) have been adjusted proportionally.
            </span>
          </div>
        </div>
      )}

      {/* 1. Examination Countdown & PwD Timer Header */}
      <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 uppercase">
              Official Simulation · Screen 7 of 16
            </span>
            {isBlindMode && (
              <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-400 text-slate-900 rounded-md flex items-center gap-1">
                <Mic className="w-3 h-3 text-red-700 animate-pulse" />
                Hands-Free Voice Active
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold">
            SSC MTS 2026 Tier-I Mock Examination {sequenceNumber ? `#${sequenceNumber}` : ''}
          </h1>
          <p className="text-xs text-slate-300">
            Session I (Math/Reasoning: No Negative) &amp; Session II (GK/English: -1 Mark Penalty)
          </p>
        </div>

        {/* Pinned Accessible Timer */}
        <div
          role="timer"
          aria-live="polite"
          aria-label={`Time Remaining: ${formatTime(secondsRemaining)}`}
          className="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700"
        >
          <Clock className={`w-5 h-5 ${secondsRemaining < 600 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Time Remaining</span>
            <span className="text-xl font-mono font-black tracking-widest text-white">
              {formatTime(secondsRemaining)}
            </span>
          </div>
          {isPwD && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-400 text-slate-900 rounded ml-2">
              PwD +20m/h Compensatory Time
            </span>
          )}
        </div>
      </div>

      {/* 2. Main Exam Grid Layout: Left Question Area (8 cols) + Right Palette (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Question Box */}
        <div className="lg:col-span-8 bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          {/* Question Header & Speech Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <span className="mx-2 text-slate-400">·</span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-900 rounded">
                {currentQ.subject}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-action="repeat-question"
                onClick={() => readQuestionAloud(currentQ, currentIdx, questions.length)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors focus:ring-2 focus:ring-[#1749E8]"
                aria-label="Repeat exam question and options aloud (Keyboard shortcut: Alt+R)"
                title="Repeat question & options (Alt+R)"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Repeat Question (Alt+R)</span>
              </button>

              <button
                type="button"
                data-action="repeat-options"
                onClick={() => repeatOptionsAloud(currentQ)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors focus:ring-2 focus:ring-[#1749E8]"
                aria-label="Repeat all four options aloud (Keyboard shortcut: Alt+O)"
                title="Repeat options only (Alt+O)"
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Repeat Options (Alt+O)</span>
              </button>

              {isSpeaking && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (isPausedSpeaking) {
                        resumeSpeaking();
                        announce('Speech resumed', 'polite');
                      } else {
                        pauseSpeaking();
                        announce('Speech paused', 'polite');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#D97706] bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                    aria-label={isPausedSpeaking ? 'Resume audio' : 'Pause audio'}
                  >
                    {isPausedSpeaking ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>{isPausedSpeaking ? 'Resume' : 'Pause'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      stopSpeaking();
                      announce('Speech stopped', 'polite');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    aria-label="Stop audio"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                </>
              )}

              <AudioToolbar textToRead={questionSpeech} label="Read exam question aloud (Alt+R)" />
              <VoiceInputButton
                onTranscriptConfirmed={(txt) => {
                  const parsed = parseSpokenAnswer(txt, {
                    A: currentQ.option_a,
                    B: currentQ.option_b,
                    C: currentQ.option_c,
                    D: currentQ.option_d
                  });
                  if (parsed && parsed.type === 'option') {
                    handleRecordOption(parsed.option);
                  }
                }}
                label="Voice Answer"
              />
            </div>
          </div>

          {/* Question Text */}
          <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed max-w-prose">
            {currentQ.question_text}
          </div>

          {/* Answer Options Radio Group */}
          <div role="radiogroup" aria-label="Multiple choice options" className="space-y-3">
            {options.map((opt) => {
              const isSelected = currentSelection === opt.key;
              return (
                <div
                  key={opt.key}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => handleSelectOption(opt.key)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectOption(opt.key)}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'border-blue-700 bg-blue-50/70 ring-2 ring-blue-600 shadow-xs'
                      : 'border-slate-300 hover:border-slate-400 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {opt.key}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{opt.text}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      title={`Read Option ${opt.key} aloud`}
                      aria-label={`Read Option ${opt.key} aloud: ${opt.text}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        repeatSingleOptionAloud(currentQ, opt.key as any);
                      }}
                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600"
                    >
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-700" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearResponse}
                disabled={!currentSelection}
                className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 disabled:opacity-30"
              >
                Clear Response
              </button>
              <button
                type="button"
                onClick={handleToggleMarkForReview}
                className={`px-3 py-2 text-xs font-bold rounded-lg border flex items-center gap-1.5 ${
                  isMarked
                    ? 'bg-purple-100 text-purple-900 border-purple-400'
                    : 'bg-white text-purple-700 hover:bg-purple-50 border-purple-300'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{isMarked ? 'Marked for Review' : 'Mark for Review & Next (Alt+H)'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => currentIdx > 0 && setCurrentIdx(currentIdx - 1)}
                disabled={currentIdx === 0}
                className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-30"
              >
                Previous (Alt+P)
              </button>
              <button
                type="button"
                onClick={() => currentIdx < questions.length - 1 && setCurrentIdx(currentIdx + 1)}
                disabled={currentIdx === questions.length - 1}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-xs disabled:opacity-30"
              >
                Save &amp; Next (Alt+N)
              </button>
            </div>
          </div>
        </div>

        {/* Right: Question Navigation Palette */}
        <div className="lg:col-span-4 bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm h-fit">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Question Palette</h2>
            <span className="text-xs font-bold text-blue-700">
              {answeredCount}/{questions.length} Attempted
            </span>
          </div>

          {/* Palette Legend */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-emerald-600"></span>
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-purple-600"></span>
              <span>Marked for Review ({markedCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-slate-200 border border-slate-300"></span>
              <span>Not Answered ({questions.length - answeredCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded border-2 border-blue-700"></span>
              <span>Current</span>
            </div>
          </div>

          {/* Question Grid Buttons */}
          <div
            role="region"
            aria-label="Question Navigator Grid"
            className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 max-h-80 overflow-y-auto p-1 border border-slate-200 rounded-lg"
          >
            {questions.map((q, idx) => {
              const a = answers[q.question_id];
              const isCurrent = idx === currentIdx;
              let bg = 'bg-slate-100 text-slate-800 border-slate-300';
              if (a?.selectedOption && a?.markedForReview) {
                bg = 'bg-purple-600 text-white border-purple-700';
              } else if (a?.selectedOption) {
                bg = 'bg-emerald-600 text-white border-emerald-700';
              } else if (a?.markedForReview) {
                bg = 'bg-purple-200 text-purple-900 border-purple-400';
              }

              return (
                <button
                  key={q.question_id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  aria-label={`Jump to Question ${idx + 1}. ${a?.selectedOption ? 'Answered' : 'Not answered'}`}
                  className={`h-9 text-xs font-bold rounded flex items-center justify-center border transition-all ${bg} ${
                    isCurrent ? 'ring-2 ring-blue-700 ring-offset-1 font-black scale-105' : 'hover:opacity-80'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Big Final Submit Button */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Submit Full Examination</span>
          </button>
        </div>
      </div>

      {/* 3. Final Submission Confirmation Dialog */}
      {showSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-submit-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border-2 border-emerald-600 max-w-md w-full p-6 shadow-2xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 id="confirm-submit-title" className="text-lg font-bold flex items-center gap-2 text-slate-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Confirm Final Submission
              </h3>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Total Questions:</span>
                <strong className="text-slate-900">{questions.length}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Answered Questions:</span>
                <strong className="text-emerald-700">{answeredCount}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Marked for Review:</span>
                <strong className="text-purple-700">{markedCount}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Unanswered Questions:</span>
                <strong className="text-red-600">{questions.length - answeredCount}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Are you sure you want to finish the examination? Once submitted, your scores for Session I (Qualifying) and Session II (Merit) will be calculated and answers locked.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300"
              >
                Return to Exam
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs"
              >
                {isSubmitting ? 'Evaluating...' : 'Yes, Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
