import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Volume2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Calendar,
  Brain,
  Award,
  Sparkles,
  HelpCircle,
  Check,
  Pause,
  Play,
  Square,
  List,
  RefreshCw,
  Calculator
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { VoiceInputButton } from '../components/VoiceInputButton.tsx';
import { Question } from '../db/database.ts';
import { parseSpokenAnswer } from '../utils/answerParser.ts';
import {
  formatFullQuestionPrompt,
  formatQuestionStemOnly,
  formatAllOptionsPrompt,
  formatSingleOptionPrompt,
  formatSourcePrompt
} from '../utils/repeatQuestionHelper.ts';
import {
  PRACTICE_MODULES,
  PracticeModuleId,
  parseVoicePracticeModuleChoice,
  filterQuestionsByModule,
  parseFeedbackControlCommand
} from '../utils/voicePracticeModules.ts';

export type PracticeSessionStep =
  | 'SELECTING_MODULE'
  | 'LOADING'
  | 'READING_QUESTION'
  | 'READING_OPTIONS'
  | 'LISTENING'
  | 'PROCESSING_ANSWER'
  | 'SPEAKING_FEEDBACK'
  | 'ADVANCING'
  | 'PAUSED'
  | 'COMPLETED';

export function VoicePracticeScreen() {
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
    registerVoiceHandler
  } = useAccessibility();

  // ---------------------------------------------------------------------------
  // Session State
  // ---------------------------------------------------------------------------
  const [selectedModule, setSelectedModule] = useState<PracticeModuleId | null>(() => {
    try {
      const savedSubject = sessionStorage.getItem('practice_filter_subject');
      const savedTopic = sessionStorage.getItem('practice_filter_topic');
      if (savedTopic && savedSubject === PRACTICE_MODULES.maths.subject) return 'maths';
      if (savedTopic && savedSubject === PRACTICE_MODULES.reasoning.subject) return 'reasoning';
      return null;
    } catch {
      return null;
    }
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStep, setSessionStep] = useState<PracticeSessionStep>(() =>
    selectedModule ? 'LOADING' : 'SELECTING_MODULE'
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    isCorrect: boolean;
    explanation: string;
    correctAnswer?: string;
    chosenOption?: string;
    chosenOptionText?: string;
    correctOptionText?: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(selectedModule));
  const [moduleEmptyError, setModuleEmptyError] = useState<string | null>(null);
  const [confirmingChangeModule, setConfirmingChangeModule] = useState(false);
  const [sessionScore, setSessionScore] = useState({ correct: 0, total: 0 });

  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>(() => {
    if (selectedModule) return PRACTICE_MODULES[selectedModule].subject;
    return 'all';
  });

  // ---------------------------------------------------------------------------
  // Synchronous State Guard Refs (Prevents Stale Closures & Duplicate Submissions)
  // ---------------------------------------------------------------------------
  const sessionStepRef = useRef<PracticeSessionStep>(selectedModule ? 'LOADING' : 'SELECTING_MODULE');
  sessionStepRef.current = sessionStep;

  const selectedModuleRef = useRef<PracticeModuleId | null>(selectedModule);
  selectedModuleRef.current = selectedModule;

  const currentIndexRef = useRef<number>(0);
  currentIndexRef.current = currentIndex;

  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;

  const isSubmittingRef = useRef<boolean>(false);
  const isAdvancingRef = useRef<boolean>(false);
  const hasAnsweredCurrentQuestionRef = useRef<boolean>(false);
  const questionStartTimeRef = useRef<number>(Date.now());
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenModulePromptRef = useRef<boolean>(false);

  const subjects = [
    { name: 'All Subjects', value: 'all' },
    { name: 'Numerical & Mathematical Ability', value: 'Numerical and Mathematical Ability' },
    { name: 'Reasoning Ability & Problem Solving', value: 'Reasoning Ability and Problem Solving' },
    { name: 'General Awareness', value: 'General Awareness' },
    { name: 'English Language & Comprehension', value: 'English Language and Comprehension' }
  ];

  // Current active question
  const currentQ = questions[currentIndex] || null;

  // ---------------------------------------------------------------------------
  // Question Reading Actions (Direct Transitions without passive Effect loops)
  // ---------------------------------------------------------------------------

  /**
   * Reads a given question aloud and transitions to LISTENING on end.
   */
  const readCurrentQuestion = useCallback(
    (q: Question, idx: number, total: number) => {
      if (!q) return;

      // Cancel any pending automatic advancement
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }

      setSessionStep('READING_QUESTION');
      sessionStepRef.current = 'READING_QUESTION';

      const prompt = formatFullQuestionPrompt(q, idx, total);
      announce(`Question ${idx + 1} of ${total}: ${q.subject}`, 'polite');

      speakText(prompt, () => {
        // Once reading completes, transition immediately to LISTENING
        setSessionStep('LISTENING');
        sessionStepRef.current = 'LISTENING';
        playBeacon('listening');
        startVoiceListening();
      });
    },
    [speakText, playBeacon, startVoiceListening, announce]
  );

  /**
   * Reads all four options for the current question aloud.
   */
  const repeatOptionsAloud = useCallback(() => {
    const curQ = questionsRef.current[currentIndexRef.current];
    if (!curQ) return;

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    setSessionStep('READING_OPTIONS');
    sessionStepRef.current = 'READING_OPTIONS';

    const prompt = formatAllOptionsPrompt(curQ);
    announce('Repeating all four options', 'polite');

    speakText(prompt, () => {
      setSessionStep('LISTENING');
      sessionStepRef.current = 'LISTENING';
      playBeacon('listening');
      startVoiceListening();
    });
  }, [announce, speakText, playBeacon, startVoiceListening]);

  /**
   * Reads a single specific option (A, B, C, or D) aloud.
   */
  const repeatSingleOptionAloud = useCallback(
    (opt: 'A' | 'B' | 'C' | 'D') => {
      const curQ = questionsRef.current[currentIndexRef.current];
      if (!curQ) return;

      const prompt = formatSingleOptionPrompt(curQ, opt);
      announce(`Reading Option ${opt}`, 'polite');

      speakText(prompt, () => {
        setSessionStep('LISTENING');
        sessionStepRef.current = 'LISTENING';
        playBeacon('listening');
        startVoiceListening();
      });
    },
    [announce, speakText, playBeacon, startVoiceListening]
  );

  // ---------------------------------------------------------------------------
  // Question Advancement & Completion Engine
  // ---------------------------------------------------------------------------

  /**
   * Advances cleanly to the next question or completes the session.
   */
  const advanceToNextQuestion = useCallback(() => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    const total = questionsRef.current.length;
    const curIdx = currentIndexRef.current;

    // Check if the current question is the final question
    if (curIdx >= total - 1) {
      setSessionStep('COMPLETED');
      sessionStepRef.current = 'COMPLETED';
      stopSpeaking();
      isAdvancingRef.current = false;

      const finalMsg = `Practice session complete! You completed all ${total} questions. Outstanding effort!`;
      announce(finalMsg, 'assertive');
      speakText(finalMsg);
      return;
    }

    // Advance to next index
    const nextIdx = curIdx + 1;
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);

    // Reset per-question guards and state
    setSelectedOption(null);
    setHasSubmitted(false);
    setEvaluation(null);
    isSubmittingRef.current = false;
    hasAnsweredCurrentQuestionRef.current = false;
    questionStartTimeRef.current = Date.now();
    isAdvancingRef.current = false;

    const nextQ = questionsRef.current[nextIdx];
    if (nextQ) {
      readCurrentQuestion(nextQ, nextIdx, total);
    }
  }, [stopSpeaking, announce, speakText, readCurrentQuestion]);

  /**
   * Returns to previous question if candidate explicitly clicks or requests.
   */
  const handlePreviousQuestion = useCallback(() => {
    if (currentIndexRef.current <= 0) return;

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    const prevIdx = currentIndexRef.current - 1;
    currentIndexRef.current = prevIdx;
    setCurrentIndex(prevIdx);

    setSelectedOption(null);
    setHasSubmitted(false);
    setEvaluation(null);
    isSubmittingRef.current = false;
    hasAnsweredCurrentQuestionRef.current = false;
    questionStartTimeRef.current = Date.now();

    const prevQ = questionsRef.current[prevIdx];
    if (prevQ) {
      readCurrentQuestion(prevQ, prevIdx, questionsRef.current.length);
    }
  }, [readCurrentQuestion]);

  // ---------------------------------------------------------------------------
  // Answer Submission Engine (Atomic Guarded Flow)
  // ---------------------------------------------------------------------------

  /**
   * Submits an answer with synchronous deduplication and progressive feedback.
   */
  const submitAnswer = useCallback(
    async (optKey: string) => {
      // 1. Synchronous Guard: reject duplicate calls or calls while already processing
      if (
        isSubmittingRef.current ||
        hasAnsweredCurrentQuestionRef.current ||
        sessionStepRef.current === 'PROCESSING_ANSWER' ||
        sessionStepRef.current === 'SPEAKING_FEEDBACK' ||
        sessionStepRef.current === 'ADVANCING' ||
        sessionStepRef.current === 'COMPLETED'
      ) {
        return;
      }

      const curQ = questionsRef.current[currentIndexRef.current];
      if (!curQ) return;

      // 2. Atomic Synchronous Lock
      isSubmittingRef.current = true;
      hasAnsweredCurrentQuestionRef.current = true;
      setSessionStep('PROCESSING_ANSWER');
      sessionStepRef.current = 'PROCESSING_ANSWER';

      // 3. Update UI Selection and mute speech recognition
      setSelectedOption(optKey);
      stopSpeaking();

      const elapsedSeconds = Math.max(
        1,
        Math.round((Date.now() - questionStartTimeRef.current) / 1000)
      );

      try {
        const res = await fetch('/api/practice/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id,
            questionId: curQ.question_id,
            selectedOption: optKey,
            timeSpentSeconds: elapsedSeconds,
            mode: 'voice'
          })
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        const isCorrect = Boolean(data.isCorrect);
        const correctAnswer = (data.correctAnswer || curQ.correct_answer || '').toUpperCase();
        const rawExplanation = typeof data.explanation === 'string' && data.explanation.trim()
          ? data.explanation.trim()
          : (typeof curQ.explanation === 'string' && curQ.explanation.trim() ? curQ.explanation.trim() : '');
        const explanationText = rawExplanation || 'Detailed explanation is not available for this question.';

        const chosenOptKey = `option_${optKey.toLowerCase()}` as keyof Question;
        const chosenOptText = String((curQ as any)[chosenOptKey] || '');
        const correctOptKey = `option_${correctAnswer.toLowerCase()}` as keyof Question;
        const correctOptText = String((curQ as any)[correctOptKey] || '');

        setHasSubmitted(true);
        setEvaluation({
          isCorrect,
          explanation: explanationText,
          correctAnswer,
          chosenOption: optKey,
          chosenOptionText: chosenOptText,
          correctOptionText: correctOptText
        });

        setSessionScore((prev) => ({
          correct: prev.correct + (isCorrect ? 1 : 0),
          total: prev.total + 1
        }));

        setSessionStep('SPEAKING_FEEDBACK');
        sessionStepRef.current = 'SPEAKING_FEEDBACK';

        const feedback = isCorrect
          ? `Correct! You earned three marks. ${explanationText}. Say Next or press Enter when you are ready.`
          : `Incorrect. You chose Option ${optKey}: ${chosenOptText}. The correct answer is Option ${correctAnswer}: ${correctOptText}. ${explanationText}. Say Next or press Enter when you are ready.`;

        announce(isCorrect ? 'Correct! (+3 Marks)' : `Incorrect. Correct is Option ${correctAnswer}`, 'assertive');
        playBeacon(isCorrect ? 'success' : 'alert');

        // Speak feedback and wait for the student's explicit Next / Enter command (no auto-advance)
        speakText(feedback, () => {
          if (sessionStepRef.current === 'SPEAKING_FEEDBACK') {
            startVoiceListening();
          }
        });
      } catch (err) {
        console.error('[VoicePractice] Submit error:', err);
        // Release guard so candidate can retry
        isSubmittingRef.current = false;
        hasAnsweredCurrentQuestionRef.current = false;
        setSessionStep('LISTENING');
        sessionStepRef.current = 'LISTENING';

        announce('Submission error. Please speak your answer again.', 'assertive');
        speakText(
          'Submission could not be saved due to a network error. Please speak your answer again.',
          () => {
            playBeacon('listening');
            startVoiceListening();
          }
        );
      }
    },
    [user?.id, stopSpeaking, announce, playBeacon, speakText, startVoiceListening, advanceToNextQuestion]
  );

  // ---------------------------------------------------------------------------
  // Data Fetching & Initial Sequence Start
  // ---------------------------------------------------------------------------

  const fetchQuestionsForModule = useCallback(
    (moduleId: PracticeModuleId, options?: { waitForConfirmationSpeech?: boolean }) => {
      const mod = PRACTICE_MODULES[moduleId];
      setLoading(true);
      setModuleEmptyError(null);
      setSessionStep('LOADING');
      sessionStepRef.current = 'LOADING';

      const params = new URLSearchParams({ limit: '400', subject: mod.subject });
      try {
        const topicFilter = sessionStorage.getItem('practice_filter_topic');
        if (topicFilter) {
          params.append('topic', topicFilter);
        }
      } catch {}

      let speechDone = !options?.waitForConfirmationSpeech;
      let loadedQuestions: Question[] | null = null;
      let fetchFailed = false;

      const tryStartFirstQuestion = () => {
        if (!speechDone || loadedQuestions === null) return;
        if (fetchFailed) return;
        if (loadedQuestions.length === 0) {
          const msg = `No questions are currently available for ${mod.title}. Please choose another module.`;
          setModuleEmptyError(msg);
          setSessionStep('SELECTING_MODULE');
          sessionStepRef.current = 'SELECTING_MODULE';
          setSelectedModule(null);
          selectedModuleRef.current = null;
          announce(msg, 'assertive');
          speakText(msg, () => {
            if (sessionStepRef.current === 'SELECTING_MODULE') {
              startVoiceListening();
            }
          });
          return;
        }
        readCurrentQuestion(loadedQuestions[0], 0, loadedQuestions.length);
      };

      if (options?.waitForConfirmationSpeech) {
        const confirmMsg = `You selected ${mod.confirmationName}. Let's begin your practice.`;
        announce(confirmMsg, 'polite');
        speakText(confirmMsg, () => {
          speechDone = true;
          tryStartFirstQuestion();
        });
      }

      fetch(`/api/questions?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          const filtered = filterQuestionsByModule(data.questions || [], moduleId);
          setQuestions(filtered);
          questionsRef.current = filtered;

          setCurrentIndex(0);
          currentIndexRef.current = 0;
          setSelectedOption(null);
          setHasSubmitted(false);
          setEvaluation(null);
          isSubmittingRef.current = false;
          isAdvancingRef.current = false;
          hasAnsweredCurrentQuestionRef.current = false;
          questionStartTimeRef.current = Date.now();

          loadedQuestions = filtered;
        })
        .catch((e) => {
          console.warn('Questions fetch error:', e);
          fetchFailed = true;
          const errMsg = `Could not load questions for ${mod.title}. Please try again.`;
          setModuleEmptyError(errMsg);
          setSessionStep('SELECTING_MODULE');
          sessionStepRef.current = 'SELECTING_MODULE';
          setSelectedModule(null);
          selectedModuleRef.current = null;
          loadedQuestions = [];
        })
        .finally(() => {
          setLoading(false);
          tryStartFirstQuestion();
        });
    },
    [readCurrentQuestion, announce, speakText, startVoiceListening]
  );

  const handleSelectModule = useCallback(
    (moduleId: PracticeModuleId) => {
      const mod = PRACTICE_MODULES[moduleId];
      stopSpeaking();
      hasSpokenModulePromptRef.current = false;
      setConfirmingChangeModule(false);
      setSessionScore({ correct: 0, total: 0 });
      setSelectedModule(moduleId);
      selectedModuleRef.current = moduleId;
      setSelectedSubjectFilter(mod.subject);
      try {
        sessionStorage.setItem('practice_filter_subject', mod.subject);
      } catch {}
      fetchQuestionsForModule(moduleId, { waitForConfirmationSpeech: true });
    },
    [stopSpeaking, fetchQuestionsForModule]
  );

  const resetToModuleSelection = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    stopSpeaking();
    hasSpokenModulePromptRef.current = false;
    setConfirmingChangeModule(false);
    setModuleEmptyError(null);
    setSelectedModule(null);
    selectedModuleRef.current = null;
    setQuestions([]);
    questionsRef.current = [];
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setSelectedOption(null);
    setHasSubmitted(false);
    setEvaluation(null);
    setSessionScore({ correct: 0, total: 0 });
    isSubmittingRef.current = false;
    isAdvancingRef.current = false;
    hasAnsweredCurrentQuestionRef.current = false;
    setSessionStep('SELECTING_MODULE');
    sessionStepRef.current = 'SELECTING_MODULE';
    try {
      sessionStorage.removeItem('practice_filter_subject');
      sessionStorage.removeItem('practice_filter_topic');
    } catch {}
  }, [stopSpeaking]);

  // Initial load: if a topic+module was pre-selected (e.g. from Weak Areas), fetch immediately;
  // otherwise speak the module selection prompt once.
  useEffect(() => {
    if (selectedModule) {
      if (questionsRef.current.length === 0 && sessionStepRef.current === 'LOADING') {
        fetchQuestionsForModule(selectedModule, { waitForConfirmationSpeech: false });
      }
      return;
    }

    if (!hasSpokenModulePromptRef.current) {
      hasSpokenModulePromptRef.current = true;
      const welcomePrompt =
        'Welcome to Voice Practice. Which module would you like to practice? Numerical and Mathematical Ability, Maths, or Reasoning Ability?';
      announce(welcomePrompt, 'polite');
      speakText(welcomePrompt, () => {
        if (sessionStepRef.current === 'SELECTING_MODULE') {
          startVoiceListening();
        }
      });
    }
  }, [selectedModule, fetchQuestionsForModule, announce, speakText, startVoiceListening]);

  // ---------------------------------------------------------------------------
  // Context-Aware Voice Command Handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unregister = registerVoiceHandler((transcript: string) => {
      // --- 0. Pre-Session Module Selection Voice Commands ---
      if (sessionStepRef.current === 'SELECTING_MODULE' || !selectedModuleRef.current) {
        const chosenModule = parseVoicePracticeModuleChoice(transcript);
        if (chosenModule) {
          handleSelectModule(chosenModule);
          return true;
        }
        return false;
      }

      const curQ = questionsRef.current[currentIndexRef.current];
      if (!curQ) return false;

      // --- 0B. Feedback-Stage Voice Commands (No auto-advance) ---
      if (hasAnsweredCurrentQuestionRef.current || sessionStepRef.current === 'SPEAKING_FEEDBACK') {
        const feedbackCmd = parseFeedbackControlCommand(transcript);
        if (feedbackCmd === 'next') {
          advanceToNextQuestion();
          return true;
        }
        if (feedbackCmd === 'repeat_explanation') {
          const expText =
            (curQ.explanation && curQ.explanation.trim()) ||
            'Detailed explanation is not available for this question.';
          speakText(`${expText}. Say Next or press Enter when you are ready.`, () => {
            if (sessionStepRef.current === 'SPEAKING_FEEDBACK') {
              startVoiceListening();
            }
          });
          return true;
        }
        if (feedbackCmd === 'repeat_question') {
          readCurrentQuestion(curQ, currentIndexRef.current, questionsRef.current.length);
          return true;
        }
        if (feedbackCmd === 'read_correct_answer') {
          const corrLetter = (curQ.correct_answer || '').toUpperCase();
          const corrText = String((curQ as any)[`option_${corrLetter.toLowerCase()}`] || '');
          speakText(
            `The correct answer is Option ${corrLetter}: ${corrText}. Say Next or press Enter when you are ready.`,
            () => {
              if (sessionStepRef.current === 'SPEAKING_FEEDBACK') {
                startVoiceListening();
              }
            }
          );
          return true;
        }
      }

      const lowerRaw = transcript.toLowerCase();
      if (lowerRaw.includes('read source') || lowerRaw.includes('source information')) {
        speakText(formatSourcePrompt(curQ));
        return true;
      }

      const optionsMap = {
        A: curQ.option_a,
        B: curQ.option_b,
        C: curQ.option_c,
        D: curQ.option_d
      };

      const parsed = parseSpokenAnswer(transcript, optionsMap);
      if (!parsed) return false;

      // --- 1. Audio and Repeat Controls ---
      if (parsed.type === 'control') {
        if (parsed.command === 'repeat') {
          // Explicit manual repeat: read current question without advancing
          readCurrentQuestion(curQ, currentIndexRef.current, questionsRef.current.length);
          return true;
        }

        if (parsed.command === 'repeat_options') {
          repeatOptionsAloud();
          return true;
        }

        if (parsed.command === 'repeat_option_a') {
          repeatSingleOptionAloud('A');
          return true;
        }
        if (parsed.command === 'repeat_option_b') {
          repeatSingleOptionAloud('B');
          return true;
        }
        if (parsed.command === 'repeat_option_c') {
          repeatSingleOptionAloud('C');
          return true;
        }
        if (parsed.command === 'repeat_option_d') {
          repeatSingleOptionAloud('D');
          return true;
        }

        if (parsed.command === 'read_slower') {
          slowDownSpeech();
          return true;
        }

        if (parsed.command === 'pause_reading') {
          pauseSpeaking();
          setSessionStep('PAUSED');
          sessionStepRef.current = 'PAUSED';
          announce('Audio paused', 'polite');
          return true;
        }

        if (parsed.command === 'resume_reading') {
          resumeSpeaking();
          setSessionStep('LISTENING');
          sessionStepRef.current = 'LISTENING';
          announce('Audio resumed', 'polite');
          return true;
        }

        if (parsed.command === 'stop_speaking') {
          stopSpeaking();
          announce('Audio stopped', 'polite');
          return true;
        }

        if (parsed.command === 'skip') {
          advanceToNextQuestion();
          return true;
        }

        if (parsed.command === 'previous') {
          handlePreviousQuestion();
          return true;
        }

        if (parsed.command === 'timer') {
          speakText(
            `You are on question ${currentIndexRef.current + 1} of ${questionsRef.current.length}.`
          );
          return true;
        }
      }

      // --- 2. Answering Option (A, B, C, D) ---
      if (parsed.type === 'option') {
        // Guard: only accept if not already submitting or already answered
        if (!isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
          submitAnswer(parsed.option);
          return true;
        }
      }

      return false; // Fallback to global navigation router
    });

    return () => unregister();
  }, [
    registerVoiceHandler,
    readCurrentQuestion,
    repeatOptionsAloud,
    repeatSingleOptionAloud,
    slowDownSpeech,
    pauseSpeaking,
    resumeSpeaking,
    stopSpeaking,
    advanceToNextQuestion,
    handlePreviousQuestion,
    speakText,
    announce,
    submitAnswer,
    handleSelectModule,
    startVoiceListening
  ]);

  // Fallback Voice Input Button Handler
  const handleVoiceTranscript = (transcript: string) => {
    const curQ = questionsRef.current[currentIndexRef.current];
    if (!curQ) return;

    const parsed = parseSpokenAnswer(transcript, {
      A: curQ.option_a,
      B: curQ.option_b,
      C: curQ.option_c,
      D: curQ.option_d
    });

    if (parsed && parsed.type === 'option') {
      if (!isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
        submitAnswer(parsed.option);
      }
    } else if (parsed && parsed.type === 'control') {
      if (parsed.command === 'repeat') {
        readCurrentQuestion(curQ, currentIndexRef.current, questionsRef.current.length);
      } else if (parsed.command === 'skip') {
        advanceToNextQuestion();
      } else if (parsed.command === 'previous') {
        handlePreviousQuestion();
      }
    } else {
      announce(`Heard: "${transcript}". Please speak Option A, B, C, or D.`, 'polite');
    }
  };

  // Keyboard accessibility handler (1-4, A-D, Space to replay, Enter to submit/advance)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        e.preventDefault();
        if (!isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
          submitAnswer(key);
        }
      } else if (['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        if (!isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
          submitAnswer(map[key]);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        const curQ = questionsRef.current[currentIndexRef.current];
        if (curQ) {
          readCurrentQuestion(curQ, currentIndexRef.current, questionsRef.current.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sessionStepRef.current === 'SPEAKING_FEEDBACK' || hasSubmitted) {
          advanceToNextQuestion();
        } else if (selectedOption && !isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
          submitAnswer(selectedOption);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSubmitted, selectedOption, readCurrentQuestion, advanceToNextQuestion, submitAnswer]);

  // Effect cleanup on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // ---------------------------------------------------------------------------
  // Render: Pre-Session Module Selection Screen
  // ---------------------------------------------------------------------------
  if (!selectedModule || sessionStep === 'SELECTING_MODULE') {
    const mathsMod = PRACTICE_MODULES.maths;
    const reasoningMod = PRACTICE_MODULES.reasoning;

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-8" id="main-content">
        <div className="bg-white border border-[#D9E1EF] rounded-2xl p-6 sm:p-10 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8EBF0] pb-5">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-[#1749E8] uppercase tracking-wider">
                Voice-First Practice · Pre-Session Setup
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#172033]">
                Choose Your Practice Module
              </h1>
              <p className="text-sm sm:text-base text-[#53627A]">
                Which module would you like to practice?
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AudioToolbar
                textToRead="Welcome to Voice Practice. Which module would you like to practice? Numerical and Mathematical Ability, Maths, or Reasoning Ability?"
                label="Read module choices aloud"
              />
              <VoiceInputButton
                onTranscriptConfirmed={(transcript) => {
                  const chosen = parseVoicePracticeModuleChoice(transcript);
                  if (chosen) {
                    handleSelectModule(chosen);
                  } else {
                    announce(
                      `Heard "${transcript}". Please say Maths or Reasoning Ability.`,
                      'polite'
                    );
                  }
                }}
                label="Speak Module Choice"
                contextHint='Say "Maths" or "Reasoning Ability"'
              />
            </div>
          </div>

          {moduleEmptyError && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold"
            >
              {moduleEmptyError}
            </div>
          )}

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            role="group"
            aria-label="Practice Module Selection"
          >
            {/* Card 1: Numerical and Mathematical Ability (Maths) */}
            <button
              type="button"
              data-module-id="maths"
              onClick={() => handleSelectModule('maths')}
              className="group text-left p-6 bg-white hover:bg-[#F8FAFF] border-2 border-[#D9E1EF] hover:border-[#1749E8] rounded-2xl shadow-xs transition-all flex flex-col justify-between gap-5 focus:outline-none focus:ring-2 focus:ring-[#1749E8] focus:ring-offset-2"
              aria-label={`${mathsMod.title} (${mathsMod.label}). ${mathsMod.description}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF4FF] text-[#1749E8] flex items-center justify-center border border-[#D9E1EF] group-hover:bg-[#1749E8] group-hover:text-white transition-colors">
                    <Calculator className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#EEF4FF] text-[#1749E8] border border-[#D9E1EF] text-xs font-bold uppercase tracking-wide">
                    {mathsMod.label}
                  </span>
                </div>

                <div>
                  <h2 className="text-lg font-extrabold text-[#172033]">
                    {mathsMod.title}
                  </h2>
                  <p className="text-sm text-[#53627A] mt-1.5 leading-relaxed">
                    {mathsMod.description}
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-[#F8F9FB] group-hover:bg-[#1749E8] text-[#172033] group-hover:text-white border border-[#E8EBF0] group-hover:border-[#1749E8] text-sm font-bold transition-colors">
                <span>{mathsMod.ctaLabel}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </div>
            </button>

            {/* Card 2: Reasoning Ability */}
            <button
              type="button"
              data-module-id="reasoning"
              onClick={() => handleSelectModule('reasoning')}
              className="group text-left p-6 bg-white hover:bg-[#F8FAFF] border-2 border-[#D9E1EF] hover:border-[#1749E8] rounded-2xl shadow-xs transition-all flex flex-col justify-between gap-5 focus:outline-none focus:ring-2 focus:ring-[#1749E8] focus:ring-offset-2"
              aria-label={`${reasoningMod.title} (${reasoningMod.label}). ${reasoningMod.description}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF4FF] text-[#1749E8] flex items-center justify-center border border-[#D9E1EF] group-hover:bg-[#1749E8] group-hover:text-white transition-colors">
                    <Brain className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#EEF4FF] text-[#1749E8] border border-[#D9E1EF] text-xs font-bold uppercase tracking-wide">
                    {reasoningMod.label}
                  </span>
                </div>

                <div>
                  <h2 className="text-lg font-extrabold text-[#172033]">
                    {reasoningMod.title}
                  </h2>
                  <p className="text-sm text-[#53627A] mt-1.5 leading-relaxed">
                    {reasoningMod.description}
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-[#F8F9FB] group-hover:bg-[#1749E8] text-[#172033] group-hover:text-white border border-[#E8EBF0] group-hover:border-[#1749E8] text-sm font-bold transition-colors">
                <span>{reasoningMod.ctaLabel}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </div>
            </button>
          </div>

          <p className="text-xs text-[#64748B] flex items-center gap-2 pt-2">
            <Mic className="w-4 h-4 text-[#1749E8] shrink-0" aria-hidden="true" />
            <span>
              Voice tip: Say <strong>&ldquo;Maths&rdquo;</strong>, <strong>&ldquo;Numerical and Mathematical Ability&rdquo;</strong>, or <strong>&ldquo;Reasoning Ability&rdquo;</strong> to begin.
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Loading State
  // ---------------------------------------------------------------------------
  if (loading || !currentQ) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-600" id="main-content">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded-md w-64 mx-auto" />
          <p className="text-sm font-semibold">Loading Voice-First Practice Session...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Completed Session View
  // ---------------------------------------------------------------------------
  if (sessionStep === 'COMPLETED') {
    const accuracy =
      sessionScore.total > 0
        ? Math.round((sessionScore.correct / sessionScore.total) * 100)
        : 0;

    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8" id="main-content">
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border-2 border-emerald-300">
            <Award className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#172033]">
              Practice Session Completed!
            </h1>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              You have answered all available questions in this practice set. Your progress has been
              recorded in your learning history.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto py-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 font-bold uppercase">Questions</span>
              <p className="text-2xl font-black text-[#172033] mt-1">{sessionScore.total}</p>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-xs text-emerald-800 font-bold uppercase">Correct</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">{sessionScore.correct}</p>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <span className="text-xs text-blue-800 font-bold uppercase">Accuracy</span>
              <p className="text-2xl font-black text-[#1749E8] mt-1">{accuracy}%</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => handleSelectModule(selectedModule)}
              className="px-6 py-3 rounded-xl bg-[#1749E8] text-white text-xs font-bold hover:bg-[#123BB8] transition-colors shadow-sm inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Practice Again</span>
            </button>

            <button
              type="button"
              onClick={resetToModuleSelection}
              className="px-6 py-3 rounded-xl bg-white text-[#172033] text-xs font-bold hover:bg-slate-50 border border-[#D9E1EF] transition-colors"
            >
              Change Module
            </button>

            <button
              type="button"
              onClick={() => navigateTo('progress')}
              className="px-6 py-3 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200 border border-slate-300 transition-colors"
            >
              View Progress Analytics
            </button>

            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className="px-6 py-3 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200 border border-slate-300 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Active Question Interface
  // ---------------------------------------------------------------------------
  const questionSpeech = `${currentQ.question_text}. Option A: ${currentQ.option_a}. Option B: ${currentQ.option_b}. Option C: ${currentQ.option_c}. Option D: ${currentQ.option_d}.`;

  const options = [
    { key: 'A', text: currentQ.option_a },
    { key: 'B', text: currentQ.option_b },
    { key: 'C', text: currentQ.option_c },
    { key: 'D', text: currentQ.option_d }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6" id="main-content">
      {/* 1. Header Toolbar & Topic Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D9E1EF]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#1749E8] uppercase tracking-wider">
              Screen 6 of 16 · Voice-First Practice
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-xs px-2 py-0.5 bg-[#EEF4FF] text-[#1749E8] font-bold rounded-md border border-[#D9E1EF]">
              {currentQ.subject}
            </span>
            <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-800 font-semibold rounded">
              {currentQ.difficulty_label}
            </span>
            {isBlindMode && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-md flex items-center gap-1">
                <Mic className="w-3 h-3 text-red-600 animate-pulse" />
                Autonomous Voice Mode
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#172033]">
            Topic: {currentQ.topic} {currentQ.subtopic ? `(${currentQ.subtopic})` : ''}
          </h1>
        </div>

        {/* Audio Toolbar & Voice Trigger */}
        <div className="flex flex-wrap items-center gap-2">
          <AudioToolbar textToRead={questionSpeech} label="Read question and options aloud" />
          <VoiceInputButton
            onTranscriptConfirmed={handleVoiceTranscript}
            label="Speak Answer Option"
            contextHint='Say "Option A", "Option B", "Option C", or "Option D"'
          />
        </div>
      </div>

      {/* 1B. Active Module Header & Safe Module Switcher */}
      <div className="p-3.5 bg-white border border-[#D9E1EF] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
            Active Module:
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#EEF4FF] text-[#1749E8] border border-[#D9E1EF] text-xs font-bold">
            {PRACTICE_MODULES[selectedModule].title} ({PRACTICE_MODULES[selectedModule].label})
          </span>
          <span className="text-xs font-medium text-[#53627A]">
            Question <strong>{currentIndex + 1}</strong> of <strong>{questions.length}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!confirmingChangeModule ? (
            <button
              type="button"
              onClick={() => {
                if (sessionScore.total > 0) {
                  setConfirmingChangeModule(true);
                  announce(
                    `You have answered ${sessionScore.total} questions. Confirm if you want to change module.`,
                    'polite'
                  );
                } else {
                  resetToModuleSelection();
                }
              }}
              className="px-3 py-1.5 text-xs font-bold text-[#172033] bg-slate-50 hover:bg-slate-100 border border-[#D9E1EF] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
            >
              Change Module
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-amber-900">
                Reset current session ({sessionScore.total} answered)?
              </span>
              <button
                type="button"
                onClick={resetToModuleSelection}
                className="px-2.5 py-1 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-md"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingChangeModule(false)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Question Progression Bar & Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#53627A]">
        <div className="flex items-center gap-3">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span className="text-slate-400">·</span>
          <span>
            Score: <strong className="text-emerald-700">{sessionScore.correct}</strong> / {sessionScore.total}
          </span>
        </div>

        {/* Dynamic Voice Session Status Badge */}
        <div className="flex items-center gap-2">
          {sessionStep === 'READING_QUESTION' && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1.5">
              <Volume2 className="w-3 h-3 animate-pulse" />
              Reading Question...
            </span>
          )}
          {sessionStep === 'READING_OPTIONS' && (
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold flex items-center gap-1.5">
              <List className="w-3 h-3" />
              Reading Options...
            </span>
          )}
          {sessionStep === 'LISTENING' && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
              Listening for your answer...
            </span>
          )}
          {sessionStep === 'PROCESSING_ANSWER' && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
              Recording Answer...
            </span>
          )}
          {sessionStep === 'SPEAKING_FEEDBACK' && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-bold flex items-center gap-1.5">
              <Volume2 className="w-3 h-3" />
              Explaining Solution...
            </span>
          )}
          {sessionStep === 'ADVANCING' && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3" />
              Loading Next Question...
            </span>
          )}
        </div>
      </div>

      {/* 3. Central Question Card */}
      <div className="p-6 sm:p-8 bg-white border-2 border-[#D9E1EF] rounded-2xl shadow-sm space-y-6">
        {/* Repeat Question Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8EBF0]">
          <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
            Audio &amp; Voice Controls
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-action="repeat-question"
              onClick={() => readCurrentQuestion(currentQ, currentIndex, questions.length)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors focus:ring-2 focus:ring-[#1749E8]"
              aria-label="Repeat current question and options aloud (Keyboard shortcut: Alt+R)"
              title="Repeat complete question and options (Alt+R)"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Repeat Question (Alt+R)</span>
            </button>

            <button
              type="button"
              data-action="repeat-options"
              onClick={repeatOptionsAloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors focus:ring-2 focus:ring-[#1749E8]"
              aria-label="Repeat all four options aloud (Keyboard shortcut: Alt+O)"
              title="Repeat only options (Alt+O)"
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
                  aria-label={isPausedSpeaking ? 'Resume audio reading' : 'Pause audio reading'}
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
                  aria-label="Stop audio reading"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Question Text */}
        <div className="text-base sm:text-lg font-bold text-[#172033] leading-relaxed max-w-prose">
          {currentQ.question_text}
        </div>

        {/* Multiple Choice Options */}
        <div role="radiogroup" aria-label="Answer Options" className="space-y-3">
          {options.map((opt) => {
            const isSelected = selectedOption === opt.key;
            let borderStyle = 'border-[#D9E1EF] hover:border-[#1749E8] bg-white';
            if (isSelected) {
              borderStyle = 'border-[#1749E8] bg-[#EEF4FF] ring-2 ring-[#1749E8] shadow-xs';
            }
            if (hasSubmitted) {
              if (opt.key === currentQ.correct_answer) {
                borderStyle = 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600 text-emerald-950';
              } else if (isSelected && !evaluation?.isCorrect) {
                borderStyle = 'border-red-600 bg-red-50 ring-2 ring-red-600 text-red-950';
              }
            }

            return (
              <div
                key={opt.key}
                id={`voice-option-${opt.key}`}
                data-testid={`voice-option-${opt.key}`}
                role="radio"
                aria-checked={isSelected}
                tabIndex={hasSubmitted ? -1 : 0}
                onClick={() => {
                  if (!isSubmittingRef.current && !hasAnsweredCurrentQuestionRef.current) {
                    submitAnswer(opt.key);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    !isSubmittingRef.current &&
                    !hasAnsweredCurrentQuestionRef.current &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault();
                    submitAnswer(opt.key);
                  }
                }}
                className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 text-left ${borderStyle} ${
                  hasSubmitted ? 'cursor-default' : ''
                } focus:outline-hidden focus:ring-2 focus:ring-[#1749E8]`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected ? 'bg-[#1749E8] text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {opt.key}
                  </span>
                  <span className="text-sm font-medium text-[#172033]">{opt.text}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    title={`Read Option ${opt.key} aloud`}
                    aria-label={`Read Option ${opt.key} aloud: ${opt.text}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      repeatSingleOptionAloud(opt.key as any);
                    }}
                    className="p-1.5 text-[#64748B] hover:text-[#1749E8] hover:bg-[#EEF2FF] rounded-lg transition-colors focus:ring-2 focus:ring-[#1749E8]"
                  >
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {hasSubmitted && opt.key === currentQ.correct_answer && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  {hasSubmitted && isSelected && !evaluation?.isCorrect && (
                    <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. Action Buttons */}
        <div className="pt-4 border-t border-[#D9E1EF] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviousQuestion}
              disabled={currentIndex === 0}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Previous (Alt+P)
            </button>
            <button
              type="button"
              onClick={advanceToNextQuestion}
              disabled={currentIndex === questions.length - 1}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Next (Alt+N)
            </button>
            <button
              type="button"
              onClick={() => readCurrentQuestion(currentQ, currentIndex, questions.length)}
              className="px-3.5 py-2 text-xs font-semibold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 rounded-lg border border-blue-200 inline-flex items-center gap-1.5"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Repeat Audio (Space)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!hasSubmitted ? (
              <button
                type="button"
                onClick={() => selectedOption && submitAnswer(selectedOption)}
                disabled={!selectedOption || isSubmittingRef.current}
                className="px-6 py-2.5 text-sm font-bold text-white bg-[#1749E8] hover:bg-[#123BB8] rounded-lg shadow-sm disabled:opacity-40 transition-all active:scale-95 focus:ring-2 focus:ring-[#1749E8]"
              >
                Submit Answer (Enter)
              </button>
            ) : (
              <button
                type="button"
                data-action="next-question"
                onClick={advanceToNextQuestion}
                className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm inline-flex items-center gap-2 transition-all active:scale-95 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <span>
                  {currentIndex === questions.length - 1 ? 'Finish Practice Session' : 'Next Question'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 5. Answer Verification Feedback & Academic Explanation */}
        {hasSubmitted && evaluation && (
          <div
            role="region"
            aria-live="polite"
            className={`p-5 sm:p-6 rounded-xl border-2 space-y-4 transition-all ${
              evaluation.isCorrect
                ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950'
                : 'bg-red-50/70 border-red-500 text-red-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-base">
                {evaluation.isCorrect ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>Correct Answer! (+3 Marks)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />
                    <span>Incorrect Answer (-1 Mark)</span>
                  </>
                )}
              </div>
              <AudioToolbar textToRead={evaluation.explanation} label="Read explanation aloud" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Your Answer */}
              <div
                className={`p-3.5 rounded-lg border-2 ${
                  evaluation.isCorrect
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : 'bg-red-50 border-red-400 text-red-950'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider mb-1">
                  {evaluation.isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
                  )}
                  <span>Your Answer</span>
                </div>
                <p className="text-sm font-semibold">
                  Option {evaluation.chosenOption || selectedOption}:{' '}
                  {evaluation.chosenOptionText ||
                    String((currentQ as any)[`option_${(evaluation.chosenOption || selectedOption || 'a').toLowerCase()}`] || '')}
                </p>
              </div>

              {/* Correct Answer */}
              <div className="p-3.5 rounded-lg border-2 bg-emerald-50 border-emerald-500 text-emerald-950">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>Correct Answer</span>
                </div>
                <p className="text-sm font-semibold">
                  Option {evaluation.correctAnswer || currentQ.correct_answer}:{' '}
                  {evaluation.correctOptionText ||
                    String((currentQ as any)[`option_${(evaluation.correctAnswer || currentQ.correct_answer || 'a').toLowerCase()}`] || '')}
                </p>
              </div>
            </div>

            <div className="text-xs sm:text-sm font-medium leading-relaxed bg-white p-4 rounded-lg border border-slate-300 text-slate-900">
              <strong className="block text-slate-900 mb-1">Explanation:</strong>
              {evaluation.explanation}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
              <p className="text-xs font-semibold text-slate-700">
                Say <strong>&ldquo;Next&rdquo;</strong> or press <strong>Enter</strong> when you are ready.
              </p>

              <button
                type="button"
                data-action="next-question-footer"
                onClick={advanceToNextQuestion}
                className="px-5 py-2.5 text-sm font-bold text-white bg-[#1749E8] hover:bg-[#123BB8] rounded-lg shadow-sm inline-flex items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-[#1749E8] focus:ring-offset-2"
              >
                <span>
                  {currentIndex === questions.length - 1 ? 'Finish Practice Session' : 'Next Question'}
                </span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-700">
              <span>
                Source Provenance: {currentQ.source_reference} ({currentQ.source_name})
              </span>
              <button
                type="button"
                onClick={() => navigateTo('ai_tutor')}
                className="font-bold text-[#1749E8] hover:underline inline-flex items-center gap-1"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Ask AI Tutor to elaborate (Alt+T)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
