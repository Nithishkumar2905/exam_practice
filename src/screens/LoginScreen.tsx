import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LogIn,
  Key,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Keyboard,
  BookOpen,
  Clock,
  Sparkles,
  BarChart3,
  Accessibility,
  Volume2,
  RefreshCw
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { VoiceInputButton } from '../components/VoiceInputButton.tsx';
import { normalizeSpokenCaptchaDigits } from '../utils/captchaUtils.ts';
import { matchWakeWord } from '../voice/wakeWord.ts';
import {
  VoiceLoginState,
  getVoiceLoginStatusLabel,
  getVoiceLoginStagePrompt,
  processVoiceLoginTurn,
  isStartVoiceLoginCommand
} from '../utils/voiceLogin.ts';

export function LoginScreen() {
  const {
    navigateTo,
    loginUser,
    announce,
    speakText,
    stopSpeaking,
    registerVoiceHandler,
    startVoiceListening,
    stopVoiceListening,
    playBeacon,
    micPermissionStatus
  } = useAccessibility();

  const [identifier, setIdentifier] = useState('SSC-2026-MTS-01');
  const [password, setPassword] = useState('candidate123');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [captchaDigitCount, setCaptchaDigitCount] = useState<number>(4);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [voiceLoginState, setVoiceLoginState] = useState<VoiceLoginState>('IDLE');
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Kept solely in memory for TTS playback; never rendered into DOM/ARIA or logged.
  const captchaSpeechRef = useRef<string>('');
  const captchaInputRef = useRef<HTMLInputElement | null>(null);
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const voiceStateRef = useRef<VoiceLoginState>('IDLE');
  const identifierRef = useRef(identifier);
  const passwordRef = useRef(password);
  const captchaTokenRef = useRef(captchaToken);
  const captchaInputRefVal = useRef(captchaInput);
  const captchaDigitCountRef = useRef(captchaDigitCount);
  const isPromptSpeakingRef = useRef(false);
  const submittingRef = useRef(false);
  const lastTranscriptRef = useRef<{ text: string; at: number } | null>(null);

  identifierRef.current = identifier;
  passwordRef.current = password;
  captchaTokenRef.current = captchaToken;
  captchaInputRefVal.current = captchaInput;
  captchaDigitCountRef.current = captchaDigitCount;

  const setVoiceStage = useCallback((next: VoiceLoginState) => {
    voiceStateRef.current = next;
    setVoiceLoginState(next);
  }, []);

  const speakAndListen = useCallback(
    (promptText: string, speakingStage: VoiceLoginState, listenStage: VoiceLoginState) => {
      isPromptSpeakingRef.current = true;
      stopVoiceListening();
      setVoiceStage(speakingStage);
      speakText(promptText, () => {
        isPromptSpeakingRef.current = false;
        const cur = voiceStateRef.current;
        if (cur === 'IDLE' || cur === 'CANCELLED' || cur === 'LOGIN_SUCCESS') {
          return;
        }
        setVoiceStage(listenStage);
        playBeacon('listening');
        startVoiceListening();
      });
    },
    [playBeacon, setVoiceStage, speakText, startVoiceListening, stopVoiceListening]
  );

  const loadCaptchaChallenge = useCallback(
    async (previousToken?: string, announceNew = false, speakAfterLoad = false) => {
      setCaptchaLoading(true);
      try {
        const qs = previousToken ? `?previousToken=${encodeURIComponent(previousToken)}` : '';
        const res = await fetch(`/api/auth/captcha${qs}`);
        const data = await res.json();
        if (res.ok && data?.challengeToken && data?.speechPrompt) {
          setCaptchaToken(data.challengeToken);
          setCaptchaDigitCount(data.digitCount || 4);
          captchaSpeechRef.current = data.speechPrompt;
          if (speakAfterLoad) {
            const info = getVoiceLoginStagePrompt('ASKING_CAPTCHA', {
              captchaDigitCount: data.digitCount || 4,
              captchaSpeechPrompt: data.speechPrompt
            });
            if (info) {
              speakAndListen(info.prompt, 'ASKING_CAPTCHA', info.listenState);
            }
          } else if (announceNew) {
            announce('New audio CAPTCHA ready. Select Listen to CAPTCHA to hear the numbers.', 'polite');
          }
        }
      } catch {
        announce('Could not load audio CAPTCHA challenge. Please refresh.', 'assertive');
      } finally {
        setCaptchaLoading(false);
      }
    },
    [announce, speakAndListen]
  );

  useEffect(() => {
    void loadCaptchaChallenge();
    return () => {
      stopVoiceListening();
      captchaSpeechRef.current = '';
    };
  }, [loadCaptchaChallenge, stopVoiceListening]);

  const handleListenCaptcha = () => {
    if (!captchaSpeechRef.current) {
      announce('Audio CAPTCHA is still loading. Please try again in a moment.', 'polite');
      return;
    }
    speakText(captchaSpeechRef.current);
  };

  const handleRefreshCaptcha = () => {
    setCaptchaInput('');
    setError(null);
    void loadCaptchaChallenge(captchaToken, true);
  };

  const handleSpokenCaptcha = (transcript: string) => {
    const digits = normalizeSpokenCaptchaDigits(transcript);
    if (!digits) {
      announce('No digits recognized from speech. Please speak each number clearly or type the digits.', 'assertive');
      return;
    }
    setCaptchaInput(digits);
    announce(`Entered ${digits.length} digits into the CAPTCHA field. Verify and press Sign In to Portal.`, 'polite');
  };

  const loginInstructions =
    'Candidate Authentication & Portal Landing Screen. Enter your Roll Number or Registered Email ID, Password or PIN, and complete the Audio CAPTCHA to sign in. You can also press Start Voice Login for guided hands-free sign-in.';

  const performLoginSubmission = useCallback(async () => {
    if (submittingRef.current || loading) return;

    const currentIdentifier = identifierRef.current.trim();
    const currentPassword = passwordRef.current;
    const sanitizedCaptcha = normalizeSpokenCaptchaDigits(captchaInputRefVal.current);
    const inVoiceMode =
      voiceStateRef.current !== 'IDLE' &&
      voiceStateRef.current !== 'CANCELLED' &&
      voiceStateRef.current !== 'LOGIN_SUCCESS';

    if (!currentIdentifier || !currentPassword) {
      const msg = 'Email ID and password are required to sign in.';
      setError(msg);
      announce(msg, 'assertive');
      if (inVoiceMode) {
        speakAndListen('Email or password is missing. What is your registered email ID?', 'ASKING_EMAIL', 'LISTENING_EMAIL');
      }
      return;
    }

    if (!sanitizedCaptcha) {
      const msg = 'Invalid CAPTCHA code. Please listen and try again.';
      setError(msg);
      announce(msg, 'assertive');
      setCaptchaInput('');
      captchaInputRef.current?.focus();
      if (inVoiceMode) {
        void loadCaptchaChallenge(captchaTokenRef.current, false, true);
      }
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    if (inVoiceMode) {
      setVoiceStage('SUBMITTING_LOGIN');
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: currentIdentifier,
          password: currentPassword,
          captchaToken: captchaTokenRef.current,
          captchaAnswer: sanitizedCaptcha
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const isCaptchaErr = data.code === 'INVALID_CAPTCHA' || res.status === 400;
        if (isCaptchaErr) {
          setCaptchaInput('');
          setTimeout(() => captchaInputRef.current?.focus(), 0);
          if (inVoiceMode) {
            setError(data.error || 'Invalid CAPTCHA code. Please listen and try again.');
            void loadCaptchaChallenge(captchaTokenRef.current, false, true);
            return;
          }
          void loadCaptchaChallenge(captchaTokenRef.current, false);
        }
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      // Stop login mic listener & clear temporary sensitive input state
      stopVoiceListening();
      stopSpeaking();
      setPassword('');
      setCaptchaInput('');
      setVoiceStage('LOGIN_SUCCESS');

      loginUser(data.user, data.settings);
      announce(`Login successful. Welcome ${data.user.name}.`, 'polite');
      navigateTo('dashboard');
    } catch (err: any) {
      const errMsg = err.message || 'Login failed. Please check network connection.';
      setError(errMsg);
      announce(`Login error: ${errMsg}`, 'assertive');
      if (inVoiceMode) {
        setVoiceStage('LOGIN_ERROR');
        speakText('Login was unsuccessful. Please check your details and try again.');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [
    announce,
    loadCaptchaChallenge,
    loading,
    loginUser,
    navigateTo,
    setVoiceStage,
    speakAndListen,
    speakText,
    stopSpeaking,
    stopVoiceListening
  ]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLoginSubmission();
  };

  const startVoiceLogin = useCallback(async () => {
    setError(null);
    setMicError(null);
    setIsVoicePaused(false);
    setIdentifier('');
    setPassword('');
    setCaptchaInput('');

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      const msg = 'Voice recognition is not supported in this browser. For your security, please enter your details using the keyboard.';
      setMicError(msg);
      announce(msg, 'assertive');
      speakText(msg);
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && micPermissionStatus !== 'granted') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // If already permitted or handled by browser SpeechRecognition, proceed
        }
      }

      setVoiceStage('STARTING_LOGIN');
      const info = getVoiceLoginStagePrompt('ASKING_EMAIL')!;
      speakAndListen(info.prompt, 'ASKING_EMAIL', info.listenState);
    } catch {
      const msg = 'Microphone permission denied. Please use keyboard login or allow microphone access.';
      setMicError(msg);
      announce(msg, 'assertive');
      speakText('Microphone access is unavailable. For your security, please enter your password and details using the keyboard.');
      setVoiceStage('IDLE');
    }
  }, [announce, micPermissionStatus, setVoiceStage, speakAndListen, speakText]);

  const pauseVoiceLogin = useCallback(() => {
    stopSpeaking();
    stopVoiceListening();
    isPromptSpeakingRef.current = false;
    setIsVoicePaused(true);
    announce('Voice login paused. Press Resume Voice Login or use keyboard input.', 'polite');
  }, [announce, stopSpeaking, stopVoiceListening]);

  const resumeVoiceLogin = useCallback(() => {
    setIsVoicePaused(false);
    const info = getVoiceLoginStagePrompt(voiceStateRef.current, {
      captchaDigitCount: captchaDigitCountRef.current,
      captchaSpeechPrompt: captchaSpeechRef.current
    });
    if (info) {
      speakAndListen(info.prompt, voiceStateRef.current, info.listenState);
    } else {
      startVoiceListening();
    }
  }, [speakAndListen, startVoiceListening]);

  const repeatVoiceQuestion = useCallback(() => {
    const cur = voiceStateRef.current;
    const mapToAsk: Partial<Record<VoiceLoginState, VoiceLoginState>> = {
      STARTING_LOGIN: 'ASKING_EMAIL',
      ASKING_EMAIL: 'ASKING_EMAIL',
      LISTENING_EMAIL: 'ASKING_EMAIL',
      CONFIRMING_EMAIL: 'CONFIRMING_EMAIL',
      ASKING_PASSWORD: 'ASKING_PASSWORD',
      WAITING_FOR_PASSWORD: 'ASKING_PASSWORD',
      ASKING_CAPTCHA: 'ASKING_CAPTCHA',
      LISTENING_CAPTCHA: 'ASKING_CAPTCHA',
      WAITING_FOR_SIGNIN_CONFIRMATION: 'WAITING_FOR_SIGNIN_CONFIRMATION'
    };
    const target = mapToAsk[cur] ?? 'ASKING_EMAIL';
    const info = getVoiceLoginStagePrompt(target, {
      captchaDigitCount: captchaDigitCountRef.current,
      captchaSpeechPrompt: captchaSpeechRef.current
    });
    if (info) {
      speakAndListen(info.prompt, target, info.listenState);
    }
  }, [speakAndListen]);

  const switchToKeyboardLogin = useCallback(() => {
    isPromptSpeakingRef.current = false;
    stopSpeaking();
    stopVoiceListening();
    setIsVoicePaused(false);
    setVoiceStage('CANCELLED');
    announce('Switched to keyboard login.', 'polite');
    identifierInputRef.current?.focus();
  }, [announce, setVoiceStage, stopSpeaking, stopVoiceListening]);

  const isVoiceLoginActive =
    voiceLoginState !== 'IDLE' &&
    voiceLoginState !== 'CANCELLED' &&
    voiceLoginState !== 'LOGIN_SUCCESS';

  const performLoginSubmissionRef = useRef(performLoginSubmission);
  const speakAndListenRef = useRef(speakAndListen);
  const switchToKeyboardRef = useRef(switchToKeyboardLogin);
  const startVoiceLoginRef = useRef(startVoiceLogin);
  performLoginSubmissionRef.current = performLoginSubmission;
  speakAndListenRef.current = speakAndListen;
  switchToKeyboardRef.current = switchToKeyboardLogin;
  startVoiceLoginRef.current = startVoiceLogin;

  // Register dedicated Voice Login handler on LoginScreen
  useEffect(() => {
    const unregister = registerVoiceHandler(async (transcript: string) => {
      const stage = voiceStateRef.current;
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

      // Check if student wants to start voice login or wake assistant when IDLE/CANCELLED/LOGIN_ERROR
      if (
        stage === 'IDLE' ||
        stage === 'CANCELLED' ||
        stage === 'LOGIN_ERROR'
      ) {
        // Direct "start login" or similar intent
        if (isStartVoiceLoginCommand(trimmed)) {
          lastTranscriptRef.current = { text: trimmed.toLowerCase(), at: now };
          void startVoiceLoginRef.current();
          return true;
        }

        // "Hey Vision" with or without trailing command
        const wakeMatch = matchWakeWord(trimmed);
        if (wakeMatch.matched) {
          lastTranscriptRef.current = { text: trimmed.toLowerCase(), at: now };
          if (wakeMatch.strippedCommand && isStartVoiceLoginCommand(wakeMatch.strippedCommand)) {
            void startVoiceLoginRef.current();
            return true;
          }
          playBeacon('listening');
          speakText("Vision assistant activated. You can say 'Start login' to begin voice sign-in, or ask for help.", () => {
            startVoiceListening();
          });
          return true;
        }

        // Return false to allow NavigationController to process other navigation or assistance intents
        return false;
      }

      // If active voice login is currently speaking prompt or submitting, don't interrupt
      if (
        stage === 'SUBMITTING_LOGIN' ||
        stage === 'LOGIN_SUCCESS' ||
        isPromptSpeakingRef.current
      ) {
        return false;
      }

      lastTranscriptRef.current = { text: trimmed.toLowerCase(), at: now };

      const turn = processVoiceLoginTurn(
        {
          state: stage,
          identifier: identifierRef.current,
          password: passwordRef.current,
          captchaInput: captchaInputRefVal.current,
          captchaDigitCount: captchaDigitCountRef.current,
          captchaSpeechPrompt: captchaSpeechRef.current
        },
        trimmed
      );

      if (turn.patch.identifier !== undefined) setIdentifier(turn.patch.identifier);
      if (turn.patch.password !== undefined) setPassword(turn.patch.password);
      if (turn.patch.captchaInput !== undefined) setCaptchaInput(turn.patch.captchaInput);

      if (turn.focusField === 'identifier') identifierInputRef.current?.focus();
      else if (turn.focusField === 'password') passwordInputRef.current?.focus();
      else if (turn.focusField === 'captcha') captchaInputRef.current?.focus();

      if (turn.shouldCancel) {
        switchToKeyboardRef.current();
        return true;
      }

      if (turn.shouldSubmit) {
        setVoiceStage('VALIDATING_LOGIN');
        void performLoginSubmissionRef.current();
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
  }, [registerVoiceHandler, setVoiceStage, speakText, startVoiceListening, playBeacon]);

  const fillDemo = (role: 'candidate' | 'admin') => {
    setError(null);
    if (role === 'candidate') {
      setIdentifier('SSC-2026-MTS-01');
      setPassword('candidate123');
      announce('Filled Candidate Demo credentials', 'polite');
    } else {
      setIdentifier('evaluator@ssc.gov.in');
      setPassword('admin123');
      announce('Filled Academic Reviewer / Admin credentials', 'polite');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10" id="main-content">
      {/* 1. Header with Audio Read-Aloud */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9E1EF]">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#EEF4FF] text-[#1749E8] text-xs font-bold border border-[#D9E1EF] mb-2">
            <span>SSC MTS 2026 Examination Portal</span>
            <span>·</span>
            <span>Screen 2 of 16</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#172033] tracking-tight">
            Candidate Authentication &amp; Portal Access
          </h1>
          <p className="text-sm sm:text-base text-[#53627A] mt-1.5 max-w-2xl">
            Sign in to access your customized preparation syllabus, mock examination sessions, and adaptive revision schedules.
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={loginInstructions} label="Listen to login instructions" />
        </div>
      </div>

      {/* 2. Main Two-Column Landing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Platform Capabilities Showcase */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-gradient-to-br from-[#EEF4FF] to-[#F3F0FF] p-6 sm:p-8 rounded-2xl border border-[#D9E1EF] space-y-6">
            <div>
              <span className="text-xs font-bold text-[#6241C8] uppercase tracking-wider">
                Purpose-Built Accessible Architecture
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#172033] mt-1">
                Empowering Aspirants with Assistive Preparation Tools
              </h2>
              <p className="text-xs sm:text-sm text-[#53627A] mt-2 leading-relaxed">
                ACCESSPREP-X provides a compliant, high-reliability examination environment designed for candidates with visual impairments, low vision, and assistive technology requirements.
              </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#EEF4FF] text-[#1749E8] flex items-center justify-center mb-2">
                  <Mic className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Voice Practice</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Speech recognition with confirmation modal, persistent feedback, and continuous TTS read-aloud.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#F3F0FF] text-[#6241C8] flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Compensatory Time</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Enforces 60 minutes per 45-minute session for PwD candidates strictly following DoPT norms.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#EEF4FF] text-[#123BB8] flex items-center justify-center mb-2">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Curated Questions</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  400 verified questions balanced across Math, Reasoning, General Awareness, and English.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#F3F0FF] text-[#4C2FA8] flex items-center justify-center mb-2">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">BKT &amp; SM-2 Analytics</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Bayesian Knowledge Tracing skill modeling and SuperMemo spaced repetition daily revision.
                </p>
              </div>
            </div>

            {/* Registration Callout Banner */}
            <div className="p-4 bg-white rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#172033]">Not registered yet?</p>
                <p className="text-xs text-[#53627A]">
                  Enroll as a new SSC MTS candidate with your PwD category &amp; scribe preferences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('register')}
                className="shrink-0 px-4 py-2 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors inline-flex items-center gap-1.5 focus:ring-2 focus:ring-[#6241C8]"
              >
                <span>Register Application</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 sm:p-8 bg-white border-2 border-[#D9E1EF] rounded-2xl shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#172033] flex items-center gap-2">
                    <LogIn className="w-5 h-5 text-[#1749E8]" />
                    Sign In to Candidate Account
                  </h2>
                  <p className="text-xs text-[#53627A] mt-1">
                    Enter your Roll Number or Registered Email ID to proceed.
                  </p>
                </div>
                {!isVoiceLoginActive ? (
                  <button
                    type="button"
                    onClick={startVoiceLogin}
                    className="shrink-0 px-3 py-2 text-xs font-bold text-white bg-[#1749E8] hover:bg-[#123BB8] rounded-lg inline-flex items-center gap-1.5 shadow-xs focus:ring-2 focus:ring-[#6241C8]"
                  >
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Start Voice Login</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={switchToKeyboardLogin}
                    className="shrink-0 px-3 py-2 text-xs font-bold text-[#172033] bg-slate-100 hover:bg-slate-200 border border-[#D9E1EF] rounded-lg inline-flex items-center gap-1.5 focus:ring-2 focus:ring-[#6241C8]"
                  >
                    <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Switch to Keyboard Login</span>
                  </button>
                )}
              </div>

              {/* Accessible Voice Login Status & Controls */}
              <div className="p-3 bg-[#F8FAFF] border border-[#D9E1EF] rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-xs font-bold text-[#1749E8] inline-flex items-center gap-1.5"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isVoiceLoginActive && !isVoicePaused ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span>{getVoiceLoginStatusLabel(voiceLoginState)}</span>
                  </span>

                  {!isVoiceLoginActive && (
                    <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-[#D9E1EF]">
                      Say &quot;Hey Vision&quot; or &quot;Start login&quot;
                    </span>
                  )}

                  {isVoiceLoginActive && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={repeatVoiceQuestion}
                        className="px-2 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8]"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        <span>Repeat Question</span>
                      </button>
                      {!isVoicePaused ? (
                        <button
                          type="button"
                          onClick={pauseVoiceLogin}
                          className="px-2 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8]"
                        >
                          <Pause className="w-3 h-3" aria-hidden="true" />
                          <span>Pause Voice Login</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={resumeVoiceLogin}
                          className="px-2 py-1 text-[11px] font-bold bg-[#1749E8] hover:bg-[#123BB8] text-white rounded inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8]"
                        >
                          <Play className="w-3 h-3" aria-hidden="true" />
                          <span>Resume Voice Login</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {micError && (
                  <p role="alert" className="text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    {micError}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-4 bg-red-50 border-l-4 border-red-600 rounded-r-lg text-red-900 text-xs sm:text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authentication Failure</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-xs font-bold text-[#172033] mb-1.5">
                  Roll Number or Email ID <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={identifierInputRef}
                    id="identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. SSC-2026-MTS-01"
                    className="w-full px-3.5 py-2.5 pl-10 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-medium focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none transition-all"
                  />
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-bold text-[#172033]">
                    Password or PIN <span className="text-red-600">*</span>
                  </label>
                  <span className="text-[11px] text-[#53627A]">Numeric PIN or alphanumeric</span>
                </div>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password or PIN"
                    className="w-full px-3.5 py-2.5 pl-10 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-medium focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none transition-all"
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              {/* Accessible Number-Based Audio CAPTCHA */}
              <div className="p-3.5 bg-[#F8FAFF] border border-[#D9E1EF] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label htmlFor="captcha-input" className="block text-xs font-bold text-[#172033]">
                    Audio Verification ({captchaDigitCount} digits) <span className="text-red-600">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleListenCaptcha}
                      disabled={captchaLoading || !captchaToken}
                      className="px-2.5 py-1.5 text-xs font-bold bg-[#1749E8] hover:bg-[#123BB8] text-white rounded-md inline-flex items-center gap-1.5 focus:ring-2 focus:ring-[#6241C8] focus:outline-none disabled:opacity-50"
                    >
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Listen to CAPTCHA</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshCaptcha}
                      disabled={captchaLoading}
                      aria-label="Refresh CAPTCHA"
                      className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-[#172033] border border-[#D9E1EF] rounded-md inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8] focus:outline-none disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${captchaLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                      <span>Refresh CAPTCHA</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={captchaInputRef}
                    id="captcha-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter the numbers you hear"
                    aria-describedby="captcha-help"
                    className="flex-1 px-3.5 py-2.5 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-mono font-bold tracking-widest focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none transition-all"
                  />
                  <VoiceInputButton
                    onTranscriptConfirmed={handleSpokenCaptcha}
                    label="Speak CAPTCHA"
                    contextHint="Speak each number clearly, for example four two one"
                  />
                </div>
                <p id="captcha-help" className="text-[11px] text-[#53627A]">
                  Press Listen to CAPTCHA to hear the digits read aloud, then type or speak the numbers.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 text-sm font-bold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-lg shadow-md inline-flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 focus:ring-2 focus:ring-[#6241C8]"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Authenticating Candidate...' : 'Sign In to Portal'}</span>
              </button>
            </form>

            {/* Quick Demo Credentials */}
            <div className="pt-4 border-t border-slate-200">
              <p className="text-[11px] font-bold text-[#53627A] uppercase tracking-wider mb-2.5">
                One-Click Quick Test Accounts
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillDemo('candidate')}
                  className="p-2.5 text-left border border-blue-200 bg-[#EEF4FF] hover:bg-blue-100 rounded-lg transition-colors flex items-center justify-between focus:ring-2 focus:ring-[#6241C8]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-950 truncate">Candidate Demo</p>
                    <p className="text-[10px] text-blue-800 font-mono">SSC-2026-MTS-01</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-[#1749E8] shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('admin')}
                  className="p-2.5 text-left border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center justify-between focus:ring-2 focus:ring-emerald-600"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-950 truncate">Reviewer / Admin</p>
                    <p className="text-[10px] text-emerald-800 font-mono">Dr. Meera Iyer</p>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                </button>
              </div>
            </div>

            {/* Bottom Register Prompt */}
            <div className="text-center pt-2">
              <p className="text-xs text-[#53627A]">
                Need to create a new registration?{' '}
                <button
                  type="button"
                  onClick={() => navigateTo('register')}
                  className="font-bold text-[#1749E8] hover:text-[#123BB8] hover:underline inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8] rounded"
                >
                  <span>Register Application</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
