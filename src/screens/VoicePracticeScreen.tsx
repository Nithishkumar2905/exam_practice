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
  List
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
  formatSingleOptionPrompt
} from '../utils/repeatQuestionHelper.ts';

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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<{ isCorrect: boolean; explanation: string; correctAnswer?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionScore, setSessionScore] = useState({ correct: 0, total: 0 });

  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>(() => {
    try {
      return sessionStorage.getItem('practice_filter_subject') || 'all';
    } catch {
      return 'all';
    }
  });

  const questionStartTimeRef = useRef<number>(Date.now());
  const currentIndexRef = useRef<number>(currentIndex);
  currentIndexRef.current = currentIndex;

  const questionsRef = useRef<Question[]>(questions);
  questionsRef.current = questions;

  const hasSubmittedRef = useRef<boolean>(hasSubmitted);
  hasSubmittedRef.current = hasSubmitted;

  const subjects = [
    { name: 'All Subjects', value: 'all' },
    { name: 'Numerical & Mathematical Ability', value: 'Numerical and Mathematical Ability' },
    { name: 'Reasoning Ability & Problem Solving', value: 'Reasoning Ability and Problem Solving' },
    { name: 'General Awareness', value: 'General Awareness' },
    { name: 'English Language & Comprehension', value: 'English Language and Comprehension' }
  ];

  const fetchQuestions = (subjectToFetch: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '400' });
    if (subjectToFetch && subjectToFetch !== 'all') {
      params.append('subject', subjectToFetch);
    }
    const topicFilter = sessionStorage.getItem('practice_filter_topic');
    if (topicFilter && subjectToFetch !== 'all') {
      params.append('topic', topicFilter);
    }

    fetch(`/api/questions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const qList: Question[] = data.questions || [];
        setQuestions(qList);
        setCurrentIndex(0);
        setSelectedOption(null);
        setHasSubmitted(false);
        setEvaluation(null);
        questionStartTimeRef.current = Date.now();
      })
      .catch((e) => console.warn('Questions fetch error:', e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQuestions(selectedSubjectFilter);
  }, [selectedSubjectFilter]);

  const handleSubjectChange = (newSubject: string) => {
    try {
      sessionStorage.setItem('practice_filter_subject', newSubject);
      sessionStorage.removeItem('practice_filter_topic');
    } catch {}
    setSelectedSubjectFilter(newSubject);
    announce(`Switched practice topic filter to ${newSubject}`, 'polite');
  };

  const currentQ = questions[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndexRef.current < questionsRef.current.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setHasSubmitted(false);
      setEvaluation(null);
      questionStartTimeRef.current = Date.now();
    } else {
      speakText('You have reached the end of the practice set. Returning to dashboard.', () => {
        navigateTo('dashboard');
      });
    }
  }, [navigateTo, speakText]);

  const handlePrevious = useCallback(() => {
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => prev - 1);
      setSelectedOption(null);
      setHasSubmitted(false);
      setEvaluation(null);
      questionStartTimeRef.current = Date.now();
    }
  }, []);

  // Step A & Step B: Read Question & Options, then auto-listen
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

  // Read aloud question on mount or change when in blind mode or autoReadAloud
  useEffect(() => {
    if (currentQ && (isBlindMode || settings.autoReadAloud)) {
      readQuestionAloud(currentQ, currentIndex, questions.length);
    }
  }, [currentIndex, currentQ?.question_id, isBlindMode, settings.autoReadAloud, readQuestionAloud, questions.length]);

  // Step D: Evaluate Answer and speak immediate verbal feedback + auto-advance
  const evaluateAnswer = async (optKey: string) => {
    if (!currentQ || hasSubmittedRef.current) return;

    setSelectedOption(optKey);
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - questionStartTimeRef.current) / 1000));

    try {
      const res = await fetch('/api/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          questionId: currentQ.question_id,
          selectedOption: optKey,
          timeSpentSeconds: elapsedSeconds,
          mode: 'voice'
        })
      });

      const data = await res.json();
      setHasSubmitted(true);
      const isCorrect = Boolean(data.isCorrect);
      const correctAnswer = data.correctAnswer || currentQ.correct_answer;
      const explanation = data.explanation || currentQ.explanation;

      setEvaluation({
        isCorrect,
        explanation,
        correctAnswer
      });

      setSessionScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1
      }));

      const correctOptText = (currentQ as any)[`option_${correctAnswer.toLowerCase()}`] || '';

      if (isCorrect) {
        playBeacon('success');
        const feedback = `Correct! You earned three marks. ${explanation}. Moving to next question.`;
        announce('Correct! (+3 Marks)', 'assertive');
        speakText(feedback, () => {
          setTimeout(() => {
            handleNext();
          }, 1500);
        });
      } else {
        playBeacon('alert');
        const feedback = `Incorrect. You chose Option ${optKey}. The correct answer is Option ${correctAnswer}: ${correctOptText}. ${explanation}. Moving to next question.`;
        announce(`Incorrect. Correct is Option ${correctAnswer}`, 'assertive');
        speakText(feedback, () => {
          setTimeout(() => {
            handleNext();
          }, 1500);
        });
      }
    } catch (e) {
      console.error('Submission error:', e);
    }
  };

  const handleSelectOption = (optKey: string) => {
    if (hasSubmittedRef.current) return;
    evaluateAnswer(optKey);
  };

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
            readQuestionAloud(currentQ, currentIndexRef.current, questionsRef.current.length);
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
            handleNext();
            return true;
          }
          if (parsed.command === 'previous') {
            handlePrevious();
            return true;
          }
          if (parsed.command === 'timer') {
            speakText(`You have answered ${currentIndexRef.current} questions in this practice set.`);
            return true;
          }
        }

        if (parsed.type === 'option' && !hasSubmittedRef.current) {
          evaluateAnswer(parsed.option);
          return true;
        }
      }

      return false; // Fallback to global voice commands
    });

    return () => unregister();
  }, [currentQ, registerVoiceHandler, readQuestionAloud, handleNext, handlePrevious, evaluateAnswer]);

  // Voice transcript from fallback button
  const handleVoiceTranscript = (transcript: string) => {
    if (!currentQ) return;
    const parsed = parseSpokenAnswer(transcript, {
      A: currentQ.option_a,
      B: currentQ.option_b,
      C: currentQ.option_c,
      D: currentQ.option_d
    });

    if (parsed && parsed.type === 'option' && !hasSubmitted) {
      evaluateAnswer(parsed.option);
    } else if (parsed && parsed.type === 'control') {
      if (parsed.command === 'repeat') readQuestionAloud(currentQ, currentIndex, questions.length);
      else if (parsed.command === 'skip') handleNext();
      else if (parsed.command === 'previous') handlePrevious();
    } else {
      announce(`Heard: "${transcript}". Please speak Option A, B, C, or D.`, 'polite');
    }
  };

  // Single-key WCAG keyboard accessibility backup (1-4, A-D, Space to replay, Enter to confirm/next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        e.preventDefault();
        handleSelectOption(key);
      } else if (['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        handleSelectOption(map[key]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (currentQ) readQuestionAloud(currentQ, currentIndex, questions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (hasSubmitted) handleNext();
        else if (selectedOption) evaluateAnswer(selectedOption);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSubmitted, currentQ, currentIndex, questions.length, selectedOption, readQuestionAloud, handleNext]);

  const handleSubmit = () => {
    if (selectedOption && !hasSubmitted) {
      evaluateAnswer(selectedOption);
    }
  };

  if (loading || !currentQ) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-600" id="main-content">
        Loading Voice-First Practice Session...
      </div>
    );
  }

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
                Autonomous Voice Mode Active
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

      {/* 1B. Subject / Topic Filter Selector */}
      <div className="p-3 bg-white border border-[#D9E1EF] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="practice-subject-select" className="text-xs font-bold text-[#172033] whitespace-nowrap">
            Practice Subject:
          </label>
          <select
            id="practice-subject-select"
            value={selectedSubjectFilter}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-[#D9E1EF] rounded-lg text-[#172033] focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none"
          >
            {subjects.map((sub) => (
              <option key={sub.value} value={sub.value}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-medium text-[#53627A]">
          Showing <strong>{questions.length}</strong> questions in this section
        </div>
      </div>

      {/* 2. Question Progression Bar */}
      <div className="flex items-center justify-between text-xs font-semibold text-[#53627A]">
        <span>Question {currentIndex + 1} of {questions.length}</span>
        <div className="flex items-center gap-3">
          <span>Session Score: <strong className="text-emerald-700">{sessionScore.correct}</strong> / {sessionScore.total}</span>
          <span className="text-slate-400">·</span>
          <span>ID: {currentQ.question_id}</span>
        </div>
      </div>

      {/* 3. Central Question Card */}
      <div className="p-6 sm:p-8 bg-white border-2 border-[#D9E1EF] rounded-2xl shadow-sm space-y-6">
        {/* Visible Repeat Question Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8EBF0]">
          <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
            Audio &amp; Voice Controls
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-action="repeat-question"
              onClick={() => readQuestionAloud(currentQ, currentIndex, questions.length)}
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
              onClick={() => repeatOptionsAloud(currentQ)}
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

        <div className="text-base sm:text-lg font-bold text-[#172033] leading-relaxed max-w-prose">
          {currentQ.question_text}
        </div>

        {/* Multiple Choice Options */}
        <div
          role="radiogroup"
          aria-label="Answer Options"
          className="space-y-3"
        >
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
                onClick={() => !hasSubmitted && handleSelectOption(opt.key)}
                onKeyDown={(e) => {
                  if (!hasSubmitted && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleSelectOption(opt.key);
                  }
                }}
                className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 text-left ${borderStyle} ${
                  hasSubmitted ? 'cursor-default' : ''
                } focus:outline-hidden focus:ring-2 focus:ring-[#1749E8]`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? 'bg-[#1749E8] text-white'
                        : 'bg-slate-200 text-slate-800'
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
                      repeatSingleOptionAloud(currentQ, opt.key as any);
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
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Previous (Alt+P)
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === questions.length - 1}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Next (Alt+N)
            </button>
            <button
              type="button"
              onClick={() => readQuestionAloud(currentQ, currentIndex, questions.length)}
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
                onClick={handleSubmit}
                disabled={!selectedOption}
                className="px-6 py-2.5 text-sm font-bold text-white bg-[#1749E8] hover:bg-[#123BB8] rounded-lg shadow-sm disabled:opacity-40 transition-all active:scale-95 focus:ring-2 focus:ring-[#6241C8]"
              >
                Submit Answer (Enter)
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex === questions.length - 1}
                className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm inline-flex items-center gap-2 transition-all active:scale-95 focus:ring-2 focus:ring-emerald-500"
              >
                <span>Next Question</span>
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
            className={`p-5 rounded-xl border-2 space-y-3 transition-all ${
              evaluation.isCorrect
                ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                : 'bg-red-50 border-red-500 text-red-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-base">
                {evaluation.isCorrect ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>Correct Response! (+3 Marks)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-700 shrink-0" />
                    <span>Incorrect Option Selected. Correct Answer: Option {evaluation.correctAnswer || currentQ.correct_answer}</span>
                  </>
                )}
              </div>
              <AudioToolbar textToRead={evaluation.explanation} label="Read explanation aloud" />
            </div>

            <div className="text-xs sm:text-sm font-medium leading-relaxed bg-white/90 p-3.5 rounded-lg border border-slate-300">
              <strong className="block text-slate-900 mb-1">Academic Step-by-Step Derivation:</strong>
              {evaluation.explanation}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-700">
              <span>Source Provenance: {currentQ.source_reference} ({currentQ.source_name})</span>
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
