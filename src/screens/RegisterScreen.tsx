import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus,
  Shield,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Check,
  Mic,
  MicOff,
  Volume2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Edit3
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { VoiceInputButton } from '../components/VoiceInputButton.tsx';
import { normalizeSpokenCaptchaDigits } from '../utils/captchaUtils.ts';
import {
  VoiceRegistrationState,
  getStagePrompt,
  processVoiceRegistrationTurn,
  normalizeSpokenName,
  normalizeSpokenEmail,
  validateEmailSyntax,
  validatePasswordPolicy
} from '../utils/voiceRegistration.ts';

export function RegisterScreen() {
  const {
    navigateTo,
    announce,
    speakText,
    stopSpeaking,
    registerVoiceHandler,
    startVoiceListening,
    stopVoiceListening,
    playBeacon
  } = useAccessibility();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    pwdCategory: 'Visually Impaired',
    needScribe: true,
    examRegion: 'Northern Region (NR)',
    examLanguage: 'English',
    password: '',
    confirmPassword: ''
  });

  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaDigitCount, setCaptchaDigitCount] = useState(4);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const [voiceState, setVoiceState] = useState<VoiceRegistrationState>('IDLE');
  const [voiceConsentGranted, setVoiceConsentGranted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [registeredRollNumber, setRegisteredRollNumber] = useState<string | null>(null);

  // Refs for stage-isolated async voice callbacks and duplicate-submit prevention
  const voiceStateRef = useRef<VoiceRegistrationState>('IDLE');
  const formDataRef = useRef(formData);
  const captchaTokenRef = useRef(captchaToken);
  const captchaInputRef = useRef(captchaInput);
  const captchaSpeechRef = useRef('');
  const captchaFieldElRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef(false);
  const isPromptSpeakingRef = useRef(false);
  const lastTranscriptRef = useRef<{ text: string; at: number } | null>(null);

  formDataRef.current = formData;
  captchaTokenRef.current = captchaToken;
  captchaInputRef.current = captchaInput;

  const setVoiceStage = useCallback((next: VoiceRegistrationState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
    if (import.meta.env.DEV) {
      console.debug(`[REGISTRATION] ${next}`);
    }
  }, []);

  const clearSensitiveState = useCallback(() => {
    setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    setCaptchaInput('');
    captchaSpeechRef.current = '';
  }, []);

  const loadCaptchaChallenge = useCallback(async (previousToken?: string, announceNew = false) => {
    setCaptchaLoading(true);
    try {
      const qs = previousToken ? `?previousToken=${encodeURIComponent(previousToken)}` : '';
      const res = await fetch(`/api/auth/captcha${qs}`);
      const data = await res.json();
      if (res.ok && data?.challengeToken && data?.speechPrompt) {
        setCaptchaToken(data.challengeToken);
        setCaptchaDigitCount(data.digitCount || 4);
        captchaSpeechRef.current = data.speechPrompt;
        if (announceNew) {
          announce('New audio CAPTCHA ready. Select Listen to CAPTCHA to hear the digits.', 'polite');
        }
      }
    } catch {
      announce('Unable to load audio CAPTCHA challenge.', 'assertive');
    } finally {
      setCaptchaLoading(false);
    }
  }, [announce]);

  useEffect(() => {
    void loadCaptchaChallenge();
    return () => {
      // Clear sensitive temporary state on unmount
      captchaSpeechRef.current = '';
    };
  }, [loadCaptchaChallenge]);

  const instructions =
    'Candidate Registration Form for Staff Selection Commission MTS 2026. You can complete registration using Voice Registration or standard keyboard input. Provide your full name, email address, password, password confirmation, and audio CAPTCHA.';

  const speakAndListen = useCallback(
    (promptText: string, speakingStage: VoiceRegistrationState, listenStage: VoiceRegistrationState) => {
      isPromptSpeakingRef.current = true;
      stopVoiceListening();
      setVoiceStage(speakingStage);
      speakText(promptText, () => {
        isPromptSpeakingRef.current = false;
        if (voiceStateRef.current === 'IDLE' || voiceStateRef.current === 'REGISTRATION_COMPLETE') {
          return;
        }
        setVoiceStage(listenStage);
        playBeacon('listening');
        startVoiceListening();
      });
    },
    [playBeacon, setVoiceStage, speakText, startVoiceListening, stopVoiceListening]
  );

  const promptStage = useCallback(
    (stage: VoiceRegistrationState) => {
      const info = getStagePrompt(stage, {
        captchaSpeechPrompt: captchaSpeechRef.current
      });
      if (!info) {
        setVoiceStage(stage);
        return;
      }
      speakAndListen(info.prompt, stage, info.listenState);
    },
    [setVoiceStage, speakAndListen]
  );

  const stopVoiceRegistration = useCallback(() => {
    isPromptSpeakingRef.current = false;
    stopSpeaking();
    stopVoiceListening();
    setVoiceStage('IDLE');
    announce('Voice registration stopped. You can continue using keyboard or restart voice registration anytime.', 'polite');
  }, [announce, setVoiceStage, stopSpeaking, stopVoiceListening]);

  const startVoiceRegistration = useCallback(async () => {
    setError(null);
    setMicError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setVoiceConsentGranted(true);
      promptStage('ASKING_NAME');
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access or complete registration manually with keyboard.'
          : err?.message || 'Could not access microphone. Please use manual keyboard registration.';
      setMicError(msg);
      announce(msg, 'assertive');
      speakText(msg);
    }
  }, [announce, promptStage, speakText]);

  const submitRegistration = useCallback(async () => {
    if (submittingRef.current || loading) return;

    const current = formDataRef.current;
    const sanitizedCaptcha = normalizeSpokenCaptchaDigits(captchaInputRef.current);

    if (!current.name.trim() || !validateEmailSyntax(current.email)) {
      const msg = 'Valid Full Name and Email address are required.';
      setError(msg);
      announce(msg, 'assertive');
      if (voiceStateRef.current !== 'IDLE') {
        speakText(msg);
      }
      return;
    }

    const pwdCheck = validatePasswordPolicy(current.password);
    if (!pwdCheck.valid) {
      const msg = pwdCheck.error || 'Password must be at least 6 characters long.';
      setError(msg);
      announce(msg, 'assertive');
      if (voiceStateRef.current !== 'IDLE') {
        promptStage('ASKING_PASSWORD');
      }
      return;
    }

    if (current.password !== current.confirmPassword) {
      const msg = 'Passwords do not match. Please re-enter your confirmation password.';
      setError(msg);
      announce(msg, 'assertive');
      if (voiceStateRef.current !== 'IDLE') {
        promptStage('ASKING_CONFIRM_PASSWORD');
      }
      return;
    }

    if (!sanitizedCaptcha) {
      const msg = 'Invalid CAPTCHA code. Please listen and try again.';
      setError(msg);
      announce(msg, 'assertive');
      setCaptchaInput('');
      captchaFieldElRef.current?.focus();
      if (voiceStateRef.current !== 'IDLE') {
        promptStage('ASKING_CAPTCHA');
      }
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    if (voiceStateRef.current !== 'IDLE') {
      setVoiceStage('SUBMITTING_REGISTRATION');
    }

    try {
      const isVision = current.pwdCategory === 'Visually Impaired' || Boolean(current.needScribe);
      const payload = {
        name: current.name.trim(),
        email: current.email.trim(),
        phone: current.phone.trim(),
        pwdCategory: current.pwdCategory,
        needScribe: current.needScribe,
        examRegion: current.examRegion,
        examLanguage: current.examLanguage,
        password: current.password,
        captchaToken: captchaTokenRef.current,
        captchaAnswer: sanitizedCaptcha,
        isBlindMode: isVision,
        autoReadAloud: isVision
      };

      if (isVision) {
        try {
          localStorage.setItem('accessprep_vision_mode', 'true');
          localStorage.setItem('accessprep_blind_mode', 'true');
        } catch {}
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'INVALID_CAPTCHA' || res.status === 400) {
          if (String(data.error || '').toLowerCase().includes('captcha')) {
            setCaptchaInput('');
            void loadCaptchaChallenge(captchaTokenRef.current, false);
            setTimeout(() => captchaFieldElRef.current?.focus(), 0);
            if (voiceStateRef.current !== 'IDLE') {
              speakText('Invalid CAPTCHA code. Please listen to the new CAPTCHA and try again.', () => {
                promptStage('ASKING_CAPTCHA');
              });
            }
          }
        }
        throw new Error(data.error || 'Registration failed.');
      }

      const rollNumber: string = data.user.rollNumber;
      setRegisteredRollNumber(rollNumber);
      const msg = `Registration successful! Your Roll Number is ${rollNumber}. Redirecting to login.`;
      setSuccessMsg(msg);
      announce(msg, 'assertive');
      clearSensitiveState();
      stopVoiceListening();
      setVoiceStage('REGISTRATION_COMPLETE');
      speakText(`Registration complete. Your roll number is ${rollNumber}. Redirecting to login.`);

      setTimeout(() => {
        navigateTo('login');
      }, 2500);
    } catch (err: any) {
      const errMsg = err.message || 'Registration failed.';
      setError(errMsg);
      announce(`Registration error: ${errMsg}`, 'assertive');
      if (voiceStateRef.current === 'SUBMITTING_REGISTRATION') {
        setVoiceStage('WAITING_FOR_FINAL_CONFIRMATION');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [
    announce,
    clearSensitiveState,
    loadCaptchaChallenge,
    loading,
    navigateTo,
    promptStage,
    setVoiceStage,
    speakText,
    stopVoiceListening
  ]);

  const isVoiceActive = voiceState !== 'IDLE' && voiceState !== 'REGISTRATION_COMPLETE';
  const submitRegistrationRef = useRef(submitRegistration);
  const speakAndListenRef = useRef(speakAndListen);
  const stopVoiceRegistrationRef = useRef(stopVoiceRegistration);
  submitRegistrationRef.current = submitRegistration;
  speakAndListenRef.current = speakAndListen;
  stopVoiceRegistrationRef.current = stopVoiceRegistration;

  // Register stage-isolated voice handler ONCE while Voice Registration is active
  // (keyed only on boolean isVoiceActive so re-renders never tear down or restart prompts)
  useEffect(() => {
    if (!isVoiceActive) {
      return;
    }

    const unregister = registerVoiceHandler(async (transcript: string) => {
      const stage = voiceStateRef.current;
      if (
        stage === 'IDLE' ||
        stage === 'SUBMITTING_REGISTRATION' ||
        stage === 'REGISTRATION_COMPLETE' ||
        isPromptSpeakingRef.current
      ) {
        return false;
      }

      const trimmed = transcript.trim();
      if (!trimmed) return false;

      const now = Date.now();
      if (
        lastTranscriptRef.current &&
        lastTranscriptRef.current.text === trimmed.toLowerCase() &&
        now - lastTranscriptRef.current.at < 1200
      ) {
        return true;
      }
      lastTranscriptRef.current = { text: trimmed.toLowerCase(), at: now };

      const turn = processVoiceRegistrationTurn(
        {
          state: stage,
          name: formDataRef.current.name,
          email: formDataRef.current.email,
          password: formDataRef.current.password,
          confirmPassword: formDataRef.current.confirmPassword,
          captchaInput: captchaInputRef.current,
          captchaSpeechPrompt: captchaSpeechRef.current
        },
        trimmed
      );

      if (turn.patch.name !== undefined || turn.patch.email !== undefined || turn.patch.password !== undefined || turn.patch.confirmPassword !== undefined) {
        setFormData((prev) => ({
          ...prev,
          ...(turn.patch.name !== undefined ? { name: turn.patch.name } : {}),
          ...(turn.patch.email !== undefined ? { email: turn.patch.email } : {}),
          ...(turn.patch.password !== undefined ? { password: turn.patch.password } : {}),
          ...(turn.patch.confirmPassword !== undefined ? { confirmPassword: turn.patch.confirmPassword } : {})
        }));
      }
      if (turn.patch.captchaInput !== undefined) {
        setCaptchaInput(turn.patch.captchaInput);
      }

      if (turn.shouldStop) {
        stopVoiceRegistrationRef.current();
        return true;
      }

      if (turn.shouldSubmit) {
        setVoiceStage('VALIDATING_FIELDS');
        void submitRegistrationRef.current();
        return true;
      }

      if (turn.spokenPrompt && turn.listenAfterPrompt) {
        speakAndListenRef.current(turn.spokenPrompt, turn.nextState, turn.listenAfterPrompt);
      } else {
        setVoiceStage(turn.nextState);
      }

      return true;
    });

    return unregister;
  }, [isVoiceActive, registerVoiceHandler, setVoiceStage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRegistration();
  };

  const handleListenCaptcha = () => {
    if (!captchaSpeechRef.current) {
      announce('Audio CAPTCHA is loading. Please try again in a moment.', 'polite');
      return;
    }
    speakText(captchaSpeechRef.current);
  };

  const handleRefreshCaptcha = () => {
    setCaptchaInput('');
    setError(null);
    void loadCaptchaChallenge(captchaToken, true);
  };

  const handleMoveField = (direction: 'prev' | 'next') => {
    const order: VoiceRegistrationState[] = [
      'ASKING_NAME',
      'ASKING_EMAIL',
      'ASKING_PASSWORD',
      'ASKING_CONFIRM_PASSWORD',
      'ASKING_CAPTCHA',
      'WAITING_FOR_FINAL_CONFIRMATION'
    ];
    const currentGroup = order.findIndex((s) => voiceState.includes(s.replace('ASKING_', '')));
    const idx = currentGroup === -1 ? 0 : currentGroup;
    const nextIdx = direction === 'next' ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
    promptStage(order[nextIdx]);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" id="main-content">
      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div>
          <button
            type="button"
            onClick={() => navigateTo('login')}
            className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Candidate Registration · Screen 3 of 16
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Official Staff Selection Commission (MTS) Examination Application &amp; PwD Enrolment
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={instructions} label="Read registration instructions" />
        </div>
      </div>

      {/* Voice Registration Consent & Control Bar */}
      <div className="p-4 sm:p-5 bg-[#EEF4FF] border-2 border-[#C7D7FE] rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-[#172033]">
                Hands-Free Voice Registration (Vision Mode Compatible)
              </h2>
              <span
                role="status"
                aria-live="polite"
                className="px-2 py-0.5 text-[11px] font-bold rounded bg-white text-[#1749E8] border border-[#C7D7FE]"
              >
                {voiceState}
              </span>
            </div>
            <p className="text-xs text-[#334155] mt-0.5">
              Complete registration step by step by speaking your name, email, masked password, and audio CAPTCHA.
              {voiceConsentGranted ? ' Microphone consent granted.' : ' Microphone permission is requested only when you start.'}
            </p>
          </div>

          {voiceState === 'IDLE' || voiceState === 'REGISTRATION_COMPLETE' ? (
            <button
              type="button"
              onClick={startVoiceRegistration}
              className="px-4 py-2.5 text-xs font-bold text-white bg-[#1749E8] hover:bg-[#123BB8] rounded-lg inline-flex items-center gap-2 shadow-sm shrink-0 focus:ring-2 focus:ring-[#6241C8]"
            >
              <Mic className="w-4 h-4" aria-hidden="true" />
              <span>Start Voice Registration</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopVoiceRegistration}
              className="px-4 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg inline-flex items-center gap-2 shadow-sm shrink-0 focus:ring-2 focus:ring-red-500"
            >
              <MicOff className="w-4 h-4" aria-hidden="true" />
              <span>Stop Voice Registration</span>
            </button>
          )}
        </div>

        {micError && (
          <div role="alert" className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 font-medium">
            {micError}
          </div>
        )}

        {voiceState !== 'IDLE' && voiceState !== 'REGISTRATION_COMPLETE' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#C7D7FE]">
            <button
              type="button"
              onClick={() => promptStage(voiceState.startsWith('LISTENING_') ? (`ASKING_${voiceState.replace('LISTENING_', '')}` as VoiceRegistrationState) : voiceState)}
              className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Repeat Prompt</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (voiceState.includes('NAME')) {
                  setFormData((p) => ({ ...p, name: '' }));
                  promptStage('ASKING_NAME');
                } else if (voiceState.includes('EMAIL')) {
                  setFormData((p) => ({ ...p, email: '' }));
                  promptStage('ASKING_EMAIL');
                } else if (voiceState.includes('CONFIRM_PASSWORD')) {
                  setFormData((p) => ({ ...p, confirmPassword: '' }));
                  promptStage('ASKING_CONFIRM_PASSWORD');
                } else if (voiceState.includes('PASSWORD')) {
                  setFormData((p) => ({ ...p, password: '' }));
                  promptStage('ASKING_PASSWORD');
                } else if (voiceState.includes('CAPTCHA')) {
                  setCaptchaInput('');
                  promptStage('ASKING_CAPTCHA');
                }
              }}
              className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Correct Current Field</span>
            </button>
            <button
              type="button"
              onClick={() => handleMoveField('prev')}
              className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Previous Field</span>
            </button>
            <button
              type="button"
              onClick={() => handleMoveField('next')}
              className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1"
            >
              <span>Next Field</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {(voiceState === 'CONFIRMING_NAME' || voiceState === 'CONFIRMING_EMAIL') && (
              <span className="text-xs font-semibold text-[#1749E8]">
                Awaiting confirmation for {voiceState === 'CONFIRMING_NAME' ? 'name' : 'email'} (say Confirm or Repeat)
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Registration Form Container */}
      <div className="p-6 sm:p-8 bg-white border-2 border-slate-300 rounded-2xl shadow-sm space-y-6">
        {successMsg && (
          <div
            role="status"
            aria-live="assertive"
            className="p-4 bg-emerald-50 border-l-4 border-emerald-600 rounded-r-lg text-emerald-950 text-sm flex items-start gap-3"
          >
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Account Created</p>
              <p>{successMsg}</p>
              {registeredRollNumber && (
                <p className="text-xs font-mono mt-1">Roll Number: {registeredRollNumber}</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 bg-red-50 border-l-4 border-red-600 rounded-r-lg text-red-900 text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Validation Incomplete</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Candidate Credentials */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
              1. Candidate Identity &amp; Contact
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-xs font-bold text-slate-900 mb-1">
                  Full Name (As per Matriculation Certificate) <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Aarav Sharma"
                    className="flex-1 px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                  />
                  <VoiceInputButton
                    onTranscriptConfirmed={(t) => {
                      const cleaned = normalizeSpokenName(t);
                      if (cleaned) setFormData((prev) => ({ ...prev, name: cleaned }));
                    }}
                    label="Speak Name"
                    contextHint="Say your full name clearly"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-900 mb-1">
                  Email Address (For Admit Card &amp; Notifications) <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. candidate@example.com"
                    className="flex-1 px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                  />
                  <VoiceInputButton
                    onTranscriptConfirmed={(t) => {
                      const normalized = normalizeSpokenEmail(t);
                      if (normalized) setFormData((prev) => ({ ...prev, email: normalized }));
                    }}
                    label="Speak Email"
                    contextHint="Say your email using at and dot, e.g. name at gmail dot com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-xs font-bold text-slate-900 mb-1">
                  Mobile Number (10 Digits)
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-900 mb-1">
                  Create Accessibility PIN / Password <span className="text-red-600">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Minimum 6 characters or PIN"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="confirmPassword" className="block text-xs font-bold text-slate-900 mb-1">
                  Confirm Accessibility PIN / Password <span className="text-red-600">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Re-enter your password or PIN"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Assistive & PwD Details */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
              2. Assistive Technology &amp; PwD Accommodations
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pwdCategory" className="block text-xs font-bold text-slate-900 mb-1">
                  Benchmarked Disability Category (RPwD Act)
                </label>
                <select
                  id="pwdCategory"
                  value={formData.pwdCategory}
                  onChange={(e) => setFormData({ ...formData, pwdCategory: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-700 focus:outline-hidden"
                >
                  <option value="Visually Impaired">Visually Impaired (Blindness)</option>
                  <option value="Low Vision">Low Vision (Photophobia / Partial)</option>
                  <option value="Locomotor">Locomotor / Cerebral Palsy</option>
                  <option value="None">None (General Candidate)</option>
                </select>
              </div>

              <div>
                <label htmlFor="examRegion" className="block text-xs font-bold text-slate-900 mb-1">
                  Examination Region Center
                </label>
                <select
                  id="examRegion"
                  value={formData.examRegion}
                  onChange={(e) => setFormData({ ...formData, examRegion: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-700 focus:outline-hidden"
                >
                  <option value="Northern Region (NR)">Northern Region (Delhi, Rajasthan, Uttarakhand)</option>
                  <option value="Central Region (CR)">Central Region (Uttar Pradesh, Bihar)</option>
                  <option value="Eastern Region (ER)">Eastern Region (West Bengal, Odisha, Jharkhand)</option>
                  <option value="Western Region (WR)">Western Region (Maharashtra, Gujarat, Goa)</option>
                  <option value="Southern Region (SR)">Southern Region (Tamil Nadu, Andhra Pradesh)</option>
                </select>
              </div>
            </div>

            {/* Scribe & Compensatory Time Notice */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.needScribe}
                  onChange={(e) => setFormData({ ...formData, needScribe: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded text-blue-700 border-2 border-slate-400 focus:ring-blue-600"
                />
                <div>
                  <span className="text-sm font-bold text-blue-950">
                    Scribe Facility &amp; Compensatory Time Requested
                  </span>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Eligible candidates are allocated compensatory time of 20 minutes per hour (60 minutes per 45-minute examination session) and scribe assistance.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section: Audio CAPTCHA Verification */}
          <div className="p-4 bg-[#F8FAFF] border border-[#D9E1EF] rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label htmlFor="register-captcha-input" className="block text-xs font-bold text-[#172033]">
                Audio Verification ({captchaDigitCount} digits) <span className="text-red-600">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleListenCaptcha}
                  disabled={captchaLoading || !captchaToken}
                  className="px-2.5 py-1.5 text-xs font-bold bg-[#1749E8] hover:bg-[#123BB8] text-white rounded-md inline-flex items-center gap-1.5 focus:ring-2 focus:ring-[#6241C8] disabled:opacity-50"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Listen to CAPTCHA</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefreshCaptcha}
                  disabled={captchaLoading}
                  aria-label="Refresh CAPTCHA"
                  className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${captchaLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Refresh CAPTCHA</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={captchaFieldElRef}
                id="register-captcha-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter the numbers you hear"
                className="flex-1 px-3.5 py-2.5 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-mono font-bold tracking-widest focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none"
              />
              <VoiceInputButton
                onTranscriptConfirmed={(t) => {
                  const digits = normalizeSpokenCaptchaDigits(t);
                  if (digits) {
                    setCaptchaInput(digits);
                    announce(`Entered ${digits.length} CAPTCHA digits.`, 'polite');
                  } else {
                    announce('No digits recognized. Please speak each number clearly.', 'assertive');
                  }
                }}
                label="Speak CAPTCHA"
                contextHint="Speak each number clearly, for example four two one"
              />
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                clearSensitiveState();
                navigateTo('login');
              }}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              aria-label="Confirm Registration and Enroll"
              className="px-6 sm:px-8 py-3 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-lg shadow-md inline-flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 max-w-full text-center whitespace-normal focus:ring-2 focus:ring-[#6241C8]"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{loading ? 'Submitting Registration...' : 'Confirm Registration and Enroll'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
