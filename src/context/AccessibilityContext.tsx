import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ScreenId, APPROVED_SCREENS, SCREEN_REGISTRY } from '../types/screens.ts';
import { User, AccessibilitySettings } from '../db/database.ts';
import { audioBeacon } from '../utils/audioBeacon.ts';
import { NavigationController } from '../voice/NavigationController.ts';
import { NavigationContext } from '../voice/commandTypes.ts';
import { matchWakeWord, WakeWordLifecycleState } from '../voice/wakeWord.ts';
import {
  VoicePreferences,
  loadVoicePreferences,
  saveVoicePreferences,
  clampSpeechRate,
  clampSpeechPitch,
  clampSpeechVolume
} from '../utils/voicePreferences.ts';

export type ThemeMode = 'default' | 'sapphire' | 'high-contrast-yellow' | 'monochrome' | 'soft-dark';
export type FontSize = 'normal' | 'large' | 'xlarge' | 'xxlarge';

export interface AccessibilityContextType {
  currentScreen: ScreenId;
  navigateTo: (screen: ScreenId | string) => void;
  setCurrentScreen: (screen: ScreenId | string) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  loginUser: (user: User, settings?: AccessibilitySettings) => void;
  logout: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (c: boolean) => void;
  toggleSidebar: () => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (o: boolean) => void;
  toggleMobileNav: () => void;
  settings: AccessibilitySettings;
  updateSettings: (newSettings: Partial<AccessibilitySettings>) => void;
  speakText: (text: string, onEnd?: () => void) => void;
  speak: (text: string, onEnd?: () => void) => void;
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
  isPausedSpeaking: boolean;
  slowDownSpeech: () => void;
  isSpeaking: boolean;
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  activeAnnouncement: { message: string; priority: 'polite' | 'assertive' } | null;
  announceMessage: string;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  fontSize: FontSize;
  setFontSize: (f: FontSize) => void;
  dyslexiaFont: boolean;
  setDyslexiaFont: (d: boolean) => void;
  speechRate: number;
  setSpeechRate: (r: number) => void;
  speechPitch: number;
  speechVolume: number;
  selectedVoiceURI: string;
  availableVoices: SpeechSynthesisVoice[];
  updateSpeechRate: (value: number) => void;
  updateSpeechPitch: (value: number) => void;
  updateSpeechVolume: (value: number) => void;
  updateSelectedVoice: (uri: string) => void;
  testVoice: () => void;
  compensatoryTime: boolean;
  setCompensatoryTime: (c: boolean) => void;
  whisperModel: 'tiny' | 'base' | 'small';
  setWhisperModel: (m: 'tiny' | 'base' | 'small') => void;
  resetDefaults: () => void;

  // Autonomous Hands-Free Vision Mode & Voice Command Engine
  isBlindMode: boolean;
  setIsBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  isVisionMode: boolean;
  setIsVisionMode: (enabled: boolean) => void;
  toggleVisionMode: () => void;
  wakeWordState: WakeWordLifecycleState;
  isVoiceListening: boolean;
  micPermissionStatus: 'unknown' | 'granted' | 'denied' | 'unsupported';
  startVoiceListening: () => void;
  stopVoiceListening: () => void;
  registerVoiceHandler: (handler: (transcript: string, meta?: { confidence?: number }) => boolean | Promise<boolean>) => () => void;
  playBeacon: (type?: 'listening' | 'success' | 'alert') => void;

  // Global Voice Navigation Controller
  isExamActive: boolean;
  setIsExamActive: (active: boolean) => void;
  pendingExamExit: { destination: ScreenId; title: string } | null;
  confirmExamExit: (proceed: boolean) => void;
  executeVoiceCommand: (transcript: string) => Promise<void>;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  userId: 'usr_candidate_01',
  theme: 'sapphire',
  fontScale: 125,
  dyslexiaFont: false,
  speechRate: 1.0,
  speechPitch: 1.0,
  voiceURI: 'default',
  autoReadAloud: false,
  highContrastBorders: true,
  reduceMotion: false,
  compensatoryTimeEnabled: true,
  whisperModelSize: 'base',
  isBlindMode: false
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

function normalizeToApprovedScreen(raw: string): ScreenId | null {
  if (APPROVED_SCREENS.includes(raw as ScreenId)) {
    return raw as ScreenId;
  }
  const withUnderscore = raw.replace(/-/g, '_') as ScreenId;
  if (APPROVED_SCREENS.includes(withUnderscore)) {
    return withUnderscore;
  }
  return null;
}

function getSavedSessionUser(): User | null {
  try {
    const raw = localStorage.getItem('accessprep_session_user');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read saved user session:', e);
  }
  return null;
}

// Global reference set to protect SpeechSynthesisUtterance from Chromium V8 garbage collection freeze on Windows
const activeUtterances = new Set<SpeechSynthesisUtterance>();

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  // Determine initial screen based on authentication status and URL hash
  const getInitialScreen = (): ScreenId => {
    const savedUser = getSavedSessionUser();
    try {
      const hash = window.location.hash.replace('#', '');
      const params = new URLSearchParams(hash);
      const s = params.get('screen');
      if (s) {
        const matched = normalizeToApprovedScreen(s);
        if (matched) {
          const meta = SCREEN_REGISTRY[matched];
          if (meta?.requiresAuth && !savedUser) {
            return 'login';
          }
          return matched;
        }
      }
    } catch {}
    // Unauthenticated users land directly on login; authenticated users land on dashboard
    return savedUser ? 'dashboard' : 'login';
  };

  const [currentScreen, setCurrentScreen] = useState<ScreenId>(getInitialScreen);
  const [user, setUser] = useState<User | null>(getSavedSessionUser);
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<{ message: string; priority: 'polite' | 'assertive' } | null>(null);

  // Vision Mode State (with backward-compatible accessprep_blind_mode fallback)
  const [isBlindMode, setIsBlindModeState] = useState<boolean>(() => {
    try {
      const savedUser = getSavedSessionUser();
      const visionFlag = localStorage.getItem('accessprep_vision_mode');
      if (visionFlag !== null) return visionFlag === 'true';
      const legacyFlag = localStorage.getItem('accessprep_blind_mode');
      if (legacyFlag !== null) return legacyFlag === 'true';
      if (savedUser?.pwdCategory === 'Visually Impaired' || savedUser?.needScribe) return true;
      return false;
    } catch {
      return false;
    }
  });
  const [wakeWordState, setWakeWordState] = useState<WakeWordLifecycleState>(() =>
    isBlindMode || currentScreen === 'login' ? 'WAKE_WORD_STANDBY' : 'DISABLED'
  );
  const wakeWordStateRef = useRef<WakeWordLifecycleState>(wakeWordState);
  const updateWakeWordState = useCallback((next: WakeWordLifecycleState) => {
    wakeWordStateRef.current = next;
    setWakeWordState(next);
  }, []);
  const commandWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice Engine State
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [micPermissionStatus, setMicPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown');

  // Exam activity guard state — set by MockExamScreen on exam start/finish
  const [isExamActive, setIsExamActiveState] = useState(false);
  const isExamActiveRef = useRef<boolean>(false);
  const [pendingExamExit, setPendingExamExit] = useState<{ destination: ScreenId; title: string } | null>(null);
  const pendingExamExitRef = useRef<{ destination: ScreenId; title: string } | null>(null);
  pendingExamExitRef.current = pendingExamExit;

  // Navigation history stack for "go back" support (max 10 deep)
  const historyStackRef = useRef<ScreenId[]>([]);

  // NavigationController singleton ref
  const navControllerRef = useRef<NavigationController | null>(null);

  // Refs for audio lifecycle and echo cancellation
  const isSpeakingRef = useRef<boolean>(false);
  const isBlindModeRef = useRef<boolean>(isBlindMode);
  isBlindModeRef.current = isBlindMode;

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const activeVoiceHandlerRef = useRef<((transcript: string, meta?: { confidence?: number }) => boolean | Promise<boolean>) | null>(null);
  const isManuallyStoppedRef = useRef<boolean>(false);
  const currentScreenRef = useRef<ScreenId>(currentScreen);
  currentScreenRef.current = currentScreen;

  // Sidebar collapsible state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('accessprep_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('accessprep_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleMobileNav = useCallback(() => {
    setIsMobileNavOpen((prev) => !prev);
  }, []);

  // Update Settings handler & persist to server
  const updateSettings = useCallback((newSettings: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings, userId: user?.id || prev.userId || 'usr_candidate_01' };
      fetch('/api/settings/accessibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      }).catch((e) => console.warn('Settings sync error:', e));
      return merged;
    });
  }, [user?.id]);

  // Set Vision Mode with dual-key localStorage persistence for backward compatibility
  const setIsBlindMode = useCallback((enabled: boolean) => {
    setIsBlindModeState(enabled);
    updateWakeWordState(enabled ? 'WAKE_WORD_STANDBY' : 'DISABLED');
    try {
      localStorage.setItem('accessprep_vision_mode', String(enabled));
      localStorage.setItem('accessprep_blind_mode', String(enabled));
    } catch {}
    updateSettings({ isBlindMode: enabled, autoReadAloud: enabled });
  }, [updateSettings, updateWakeWordState]);

  const toggleBlindMode = useCallback(() => {
    setIsBlindMode(!isBlindMode);
  }, [isBlindMode, setIsBlindMode]);

  // Screen reader announcer
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setActiveAnnouncement({ message, priority });
    const timer = setTimeout(() => {
      setActiveAnnouncement(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const [voicePrefs, setVoicePrefs] = useState<VoicePreferences>(() => loadVoicePreferences());
  const voicePrefsRef = useRef<VoicePreferences>(voicePrefs);
  voicePrefsRef.current = voicePrefs;
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const syncVoices = () => {
      const list = window.speechSynthesis.getVoices() || [];
      if (list.length > 0) {
        setAvailableVoices(list);
      }
    };
    syncVoices();
    try {
      window.speechSynthesis.onvoiceschanged = syncVoices;
      window.speechSynthesis.addEventListener?.('voiceschanged', syncVoices);
    } catch {}

    // Windows fallback: poll twice in case voices load asynchronously without event
    const t1 = setTimeout(syncVoices, 250);
    const t2 = setTimeout(syncVoices, 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      try {
        window.speechSynthesis.removeEventListener?.('voiceschanged', syncVoices);
      } catch {}
    };
  }, []);

  // Text-To-Speech (Web Speech API) with Echo Cancellation & Playback Control
  const [isPausedSpeaking, setIsPausedSpeaking] = useState<boolean>(false);
  const speechGenerationRef = useRef<number>(0);
  const speechFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSpeaking = useCallback(() => {
    speechGenerationRef.current += 1;
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsPausedSpeaking(false);
    }
  }, []);

  const pauseSpeaking = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPausedSpeaking(true);
    }
  }, []);

  const resumeSpeaking = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPausedSpeaking(false);
    }
  }, []);

  // Forward declarations for voice recognition control
  const pauseVoiceListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setIsVoiceListening(false);
  }, []);

  const armSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      // 7 seconds of silence reached
      if (!isSpeakingRef.current && isBlindModeRef.current) {
        audioBeacon.playAlertBeacon();
        const screen = currentScreenRef.current;
        if (screen === 'register' || activeVoiceHandlerRef.current) {
          return;
        }
        if (screen === 'voice_practice' || screen === 'mock_exam' || screen === 'pilot_demo') {
          speakText("I didn't hear an answer. Say 'Repeat' to hear the options again, or say Option A, B, C, or D.");
        } else if (screen === 'revision_planner') {
          speakText("I didn't hear an answer. Say 'Easy', 'Good', 'Hard', 'Forgot', or 'Show answer'.");
        } else if (screen === 'ai_tutor') {
          speakText("I'm listening. Ask me any doubt about math, reasoning, general awareness, or English.");
        } else {
          speakText("I didn't hear a command. Say 'Start Mock Test', 'Practice Reasoning', 'Review Topics', or 'Help'.");
        }
      }
    }, 7000);
  }, []);

  const startVoiceListeningInternal = useCallback(() => {
    if (typeof window === 'undefined' || isSpeakingRef.current) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('Browser SpeechRecognition not supported.');
      setMicPermissionStatus('unsupported');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }

      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-IN';
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        setIsVoiceListening(true);
        setMicPermissionStatus('granted');
        armSilenceTimer();
      };

      rec.onresult = async (event: any) => {
        if (isSpeakingRef.current) {
          return;
        }
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        const lastIdx = event.results.length - 1;
        const result = event.results[lastIdx];
        if (!result || !result[0]) return;

        // Check top alternative and any candidate alternatives
        let matchedResult = result[0];
        let wakeMatch = matchWakeWord(
          result[0].transcript.trim(),
          typeof result[0].confidence === 'number' && result[0].confidence > 0 ? result[0].confidence : undefined
        );

        if (!wakeMatch.matched && result.length > 1) {
          for (let i = 1; i < result.length; i++) {
            const alt = result[i];
            if (alt && alt.transcript) {
              const altConf = typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : undefined;
              const altMatch = matchWakeWord(alt.transcript.trim(), altConf);
              if (altMatch.matched) {
                matchedResult = alt;
                wakeMatch = altMatch;
                break;
              }
            }
          }
        }

        const transcript = matchedResult.transcript.trim();
        const confidence = typeof matchedResult.confidence === 'number' && matchedResult.confidence > 0
          ? matchedResult.confidence
          : undefined;
        console.log('[VoiceCommander Heard]:', transcript, confidence !== undefined ? `(conf: ${confidence.toFixed(2)})` : '');

        // Wake-word gating when in silent standby (unless an active screen handler is capturing direct answers)
        let commandTranscript = transcript;

        // When "Hey Vision" wake-word is matched with NO trailing command:
        // Always activate assistant standby window and greet the user
        if (wakeMatch.matched && !wakeMatch.strippedCommand) {
          updateWakeWordState('COMMAND_LISTENING');
          audioBeacon.playListeningBeacon();
          if (commandWindowTimerRef.current) clearTimeout(commandWindowTimerRef.current);
          commandWindowTimerRef.current = setTimeout(() => {
            if (wakeWordStateRef.current === 'COMMAND_LISTENING' || wakeWordStateRef.current === 'ASSISTANT_ACTIVE') {
              updateWakeWordState(isBlindModeRef.current || currentScreenRef.current === 'login' ? 'WAKE_WORD_STANDBY' : 'IDLE');
            }
          }, 20000);
          const greeting = currentScreenRef.current === 'login'
            ? "Vision assistant activated. You can say 'Start login' to begin voice sign-in, or ask for help."
            : 'Vision assistant activated. How can I help you?';
          speakText(greeting, () => {
            resumeVoiceListening();
          });
          return;
        }

        if (wakeMatch.matched && wakeMatch.strippedCommand) {
          commandTranscript = wakeMatch.strippedCommand;
          updateWakeWordState('ASSISTANT_ACTIVE');
        } else if (wakeWordStateRef.current === 'WAKE_WORD_STANDBY' && !activeVoiceHandlerRef.current) {
          return;
        }

        if (wakeWordStateRef.current === 'COMMAND_LISTENING' || wakeWordStateRef.current === 'ASSISTANT_ACTIVE') {
          updateWakeWordState('PROCESSING_COMMAND');
        }

        // Route through NavigationController — it handles priority chain internally
        if (navControllerRef.current) {
          const navResult = await navControllerRef.current.processTranscript(
            commandTranscript,
            activeVoiceHandlerRef.current,
            { confidence }
          );

          console.log('[NavigationController]:', navResult.status, navResult.destination || '');

          if (commandWindowTimerRef.current) {
            clearTimeout(commandWindowTimerRef.current);
            commandWindowTimerRef.current = null;
          }
          updateWakeWordState(isBlindModeRef.current || currentScreenRef.current === 'login' ? 'WAKE_WORD_STANDBY' : 'IDLE');

          // status 'local_handled' means screen handler consumed it — nothing more to do
          if (navResult.status === 'local_handled' && !navResult.spokenResponse) {
            armSilenceTimer();
            return;
          }

          // Speak response if present
          if (navResult.spokenResponse) {
            navControllerRef.current.recordSpokenText(navResult.spokenResponse);
            if (navResult.status === 'success') {
              audioBeacon.playSuccessBeacon();
            } else if (navResult.status === 'blocked_by_active_exam' || navResult.status === 'forbidden_role') {
              audioBeacon.playAlertBeacon();
            } else if (navResult.status === 'system_handled' && navResult.spokenResponse === '') {
              // stop_speaking — already handled by stopSpeaking()
              armSilenceTimer();
              return;
            }
            speakText(navResult.spokenResponse);
            return;
          }
        }

        if (isBlindModeRef.current) {
          updateWakeWordState('WAKE_WORD_STANDBY');
        }
        // Unrecognized speech - re-arm silence timer
        armSilenceTimer();
      };

      rec.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setMicPermissionStatus('denied');
          isManuallyStoppedRef.current = true;
          setIsVoiceListening(false);
        } else if (e.error === 'language-not-supported' && rec.lang !== 'en-US') {
          // Windows machine without regional speech pack: fallback to en-US
          rec.lang = 'en-US';
          try { rec.start(); } catch {}
          return;
        } else if (e.error === 'audio-capture') {
          // Hardware/driver busy on Windows: retry in 1000ms
          setTimeout(() => {
            if (!isSpeakingRef.current && !isManuallyStoppedRef.current) {
              try { startVoiceListeningInternal(); } catch {}
            }
          }, 1000);
        }
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('SpeechRecognition error:', e.error);
        }
      };

      rec.onend = () => {
        setIsVoiceListening(false);
        // Robust Windows auto-restart: keeps listening active through silence timeouts
        const shouldKeepListening =
          (isBlindModeRef.current ||
           currentScreenRef.current === 'login' ||
           wakeWordStateRef.current === 'WAKE_WORD_STANDBY' ||
           wakeWordStateRef.current === 'COMMAND_LISTENING' ||
           activeVoiceHandlerRef.current !== null) &&
          !isSpeakingRef.current &&
          !isManuallyStoppedRef.current;

        if (shouldKeepListening) {
          setTimeout(() => {
            if (!isSpeakingRef.current && !isManuallyStoppedRef.current) {
              startVoiceListeningInternal();
            }
          }, 300);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn('Could not start SpeechRecognition:', err);
      setIsVoiceListening(false);
    }
  }, [armSilenceTimer]);

  const resumeVoiceListening = useCallback(() => {
    isManuallyStoppedRef.current = false;
    startVoiceListeningInternal();
  }, [startVoiceListeningInternal]);

  const startVoiceListening = useCallback(() => {
    isManuallyStoppedRef.current = false;
    audioBeacon.playListeningBeacon();
    startVoiceListeningInternal();
  }, [startVoiceListeningInternal]);

  const stopVoiceListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    pauseVoiceListening();
  }, [pauseVoiceListening]);

  // Enhanced speakText with echo cancellation and auto-listening resumption
  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window) || !text) {
      if (onEnd) onEnd();
      return;
    }

    // Immediately stop synthesis and mute microphone
    stopSpeaking();
    const myGen = speechGenerationRef.current + 1;
    speechGenerationRef.current = myGen;

    // Mark speaking synchronously so speech recognition abort does not auto-restart
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    pauseVoiceListening();

    const cleanText = text.replace(/<[^>]*>?/gm, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    activeUtterances.add(utterance);
    const activePrefs = voicePrefsRef.current;
    utterance.rate = activePrefs.speechRate || settings.speechRate || 1.0;
    utterance.pitch = activePrefs.speechPitch || settings.speechPitch || 1.0;
    utterance.volume = Math.max(0, Math.min(1, (activePrefs.speechVolume ?? 100) / 100));

    const voices = window.speechSynthesis.getVoices();
    const preferredUri = activePrefs.selectedVoiceURI !== 'default' ? activePrefs.selectedVoiceURI : settings.voiceURI;
    if (preferredUri && preferredUri !== 'default') {
      const match = voices.find((v) => v.voiceURI === preferredUri);
      if (match) utterance.voice = match;
    }

    let settled = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const finishSpeech = (allowAutoResume: boolean) => {
      if (settled || myGen !== speechGenerationRef.current) return;
      settled = true;
      activeUtterances.delete(utterance);
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (speechFallbackTimerRef.current) {
        clearTimeout(speechFallbackTimerRef.current);
        speechFallbackTimerRef.current = null;
      }
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (onEnd) {
        onEnd();
      } else if (allowAutoResume && isBlindModeRef.current) {
        audioBeacon.playListeningBeacon();
        resumeVoiceListening();
      }
    };

    utterance.onstart = () => {
      if (myGen !== speechGenerationRef.current) return;
      setIsSpeaking(true);
      isSpeakingRef.current = true;
    };

    utterance.onend = () => {
      finishSpeech(true);
    };

    utterance.onerror = () => {
      finishSpeech(true);
    };

    // Chromium Windows keep-alive: periodic resume check while speaking
    keepAliveTimer = setInterval(() => {
      if ('speechSynthesis' in window && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        try { window.speechSynthesis.resume(); } catch {}
      } else if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    }, 4000);

    // Safety fallback if browser speechSynthesis drops onend event
    const rate = settings.speechRate || 1.0;
    const estimatedMs = Math.max(4500, Math.ceil((cleanText.length * 95) / Math.max(0.5, rate)) + 2000);
    speechFallbackTimerRef.current = setTimeout(() => {
      finishSpeech(true);
    }, estimatedMs);

    window.speechSynthesis.speak(utterance);
  }, [settings.speechRate, settings.speechPitch, settings.voiceURI, stopSpeaking, pauseVoiceListening, resumeVoiceListening]);

  const slowDownSpeech = useCallback(() => {
    const currentRate = settings.speechRate || 1.0;
    const newRate = Math.max(0.6, Math.round((currentRate - 0.15) * 100) / 100);
    updateSettings({ speechRate: newRate });
    announce(`Speech rate slowed to ${Math.round(newRate * 100)} percent.`, 'polite');
    speakText(`Speech rate set to ${Math.round(newRate * 100)} percent.`);
  }, [settings.speechRate, updateSettings, announce, speakText]);

  // Screen handler registration for Practice / Mock Exam / AI Tutor / Revision
  const registerVoiceHandler = useCallback((handler: (transcript: string, meta?: { confidence?: number }) => boolean | Promise<boolean>) => {
    activeVoiceHandlerRef.current = handler;
    return () => {
      if (activeVoiceHandlerRef.current === handler) {
        activeVoiceHandlerRef.current = null;
      }
    };
  }, []);

  const playBeacon = useCallback((type: 'listening' | 'success' | 'alert' = 'listening') => {
    if (type === 'listening') audioBeacon.playListeningBeacon();
    else if (type === 'success') audioBeacon.playSuccessBeacon();
    else if (type === 'alert') audioBeacon.playAlertBeacon();
  }, []);

  // Navigation handler with authentication guards
  const navigateTo = useCallback((screen: ScreenId | string) => {
    const matched = normalizeToApprovedScreen(screen);
    if (!matched) {
      console.warn(`Attempted navigation to unapproved screen "${screen}". Enforcing 16-screen limit.`);
      return;
    }

    // Active exam safety guard
    if (
      isExamActiveRef.current &&
      (currentScreenRef.current === 'mock_exam' || currentScreenRef.current === 'pilot_demo') &&
      matched !== currentScreenRef.current
    ) {
      const destTitle = SCREEN_REGISTRY[matched]?.title || matched;
      const pending = { destination: matched, title: destTitle };
      setPendingExamExit(pending);
      if (navControllerRef.current) {
        navControllerRef.current.updateContext({ pendingExamExit: pending });
      }
      announce('An examination is in progress. Do you want to pause and leave? Say Yes or No.', 'assertive');
      speakText('An examination is in progress. Do you want to pause and leave? Say Yes or No.');
      return;
    }

    // Track navigation history for "go back" support (keep last 10 screens)
    const prevScreen = currentScreenRef.current;
    if (prevScreen !== matched) {
      historyStackRef.current = [...historyStackRef.current.slice(-9), prevScreen];
    }

    const meta = SCREEN_REGISTRY[matched];
    const currentUser = user || getSavedSessionUser();
    if (meta?.requiresAuth && !currentUser) {
      setCurrentScreen('login');
      window.location.hash = 'screen=login';
      announce('Authentication required. Please sign in to access that section.', 'assertive');
      return;
    }

    setCurrentScreen(matched);
    currentScreenRef.current = matched;
    window.location.hash = `screen=${matched}`;
    window.scrollTo({ top: 0, behavior: settings.reduceMotion ? 'auto' : 'smooth' });
    announce(`Navigated to ${matched.replace(/_/g, ' ')} screen.`, 'polite');

    // Move keyboard focus to main content heading on screen change
    setTimeout(() => {
      const main = document.getElementById('main-content');
      if (main) {
        main.focus();
      }
    }, 150);

    // Update NavigationController context
    if (navControllerRef.current) {
      navControllerRef.current.updateContext({
        currentScreen: matched,
        historyStack: historyStackRef.current
      });
    }
  }, [user, settings.reduceMotion, announce]);

  // Exam activity guard — called by MockExamScreen when exam starts or ends
  const setIsExamActive = useCallback((active: boolean) => {
    setIsExamActiveState(active);
    isExamActiveRef.current = active;
    if (navControllerRef.current) {
      navControllerRef.current.updateContext({ isExamActive: active });
    }
  }, []);

  const confirmExamExit = useCallback((proceed: boolean) => {
    const pending = pendingExamExitRef.current;
    setPendingExamExit(null);
    if (navControllerRef.current) {
      navControllerRef.current.updateContext({ pendingExamExit: null });
    }
    if (proceed && pending) {
      setIsExamActive(false);
      setTimeout(() => {
        navigateTo(pending.destination);
      }, 50);
      speakText(`Pausing examination. Navigating to ${pending.title}.`);
    } else {
      speakText('Staying in examination. Good luck! The timer is running.');
    }
  }, [setIsExamActive, navigateTo, speakText]);

  // Initialize NavigationController singleton — created once on mount, context updated on each render
  useEffect(() => {
    if (!navControllerRef.current) {
      const ctx: NavigationContext = {
        currentScreen: currentScreenRef.current,
        user: user,
        isExamActive: false,
        pendingExamExit: null,
        historyStack: [],
        lastSpokenText: ''
      };
      navControllerRef.current = new NavigationController({
        context: ctx,
        navigate: (screen: ScreenId) => navigateTo(screen),
        speak: (text: string, onEnd?: () => void) => speakText(text, onEnd),
        stopSpeak: () => stopSpeaking(),
        pauseSpeak: () => pauseSpeaking(),
        resumeSpeak: () => resumeSpeaking(),
        slowDown: () => slowDownSpeech(),
        logout: () => logout()
      });
    } else {
      navControllerRef.current.updateContext({
        currentScreen: currentScreenRef.current,
        user
      });
    }
  }); // Runs every render to keep context fresh without causing loops

  // executeVoiceCommand: exposed for text-based testing and voice input pipe
  const executeVoiceCommand = useCallback(async (rawTranscript: string) => {
    if (!navControllerRef.current) return;

    const result = await navControllerRef.current.processTranscript(
      rawTranscript,
      activeVoiceHandlerRef.current
    );

    if (result.spokenResponse) {
      navControllerRef.current.recordSpokenText(result.spokenResponse);
      audioBeacon.playSuccessBeacon();
      speakText(result.spokenResponse, result.status === 'success' ? undefined : undefined);
    }

    // Announce for screen readers
    if (result.announcement) {
      announce(result.announcement, 'assertive');
    }
  }, [speakText, announce]);

  // Login handler: sets user and persists session
  const loginUser = useCallback((loggedInUser: User, newSettings?: AccessibilitySettings) => {
    setUser(loggedInUser);
    try {
      localStorage.setItem('accessprep_session_user', JSON.stringify(loggedInUser));
    } catch (e) {
      console.warn('Could not persist session to localStorage:', e);
    }

    const isVision = loggedInUser.pwdCategory === 'Visually Impaired' || loggedInUser.needScribe || Boolean(newSettings?.isBlindMode);
    if (newSettings) {
      setSettings({ ...newSettings, isBlindMode: isVision });
    }
    setIsBlindModeState(isVision);
    updateWakeWordState(isVision ? 'WAKE_WORD_STANDBY' : 'DISABLED');
    try {
      localStorage.setItem('accessprep_vision_mode', String(isVision));
      localStorage.setItem('accessprep_blind_mode', String(isVision));
    } catch {}
    // Dashboard remains silent after login; speech starts only on explicit user action or "Hey Vision" wake word.
  }, [updateWakeWordState]);

  // Logout handler: invalidates session, clears client storage, and redirects to login
  const logout = useCallback(() => {
    stopSpeaking();
    pauseVoiceListening();
    if (commandWindowTimerRef.current) {
      clearTimeout(commandWindowTimerRef.current);
      commandWindowTimerRef.current = null;
    }
    updateWakeWordState('DISABLED');
    setUser(null);
    try {
      localStorage.removeItem('accessprep_session_user');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear session storage:', e);
    }
    setCurrentScreen('login');
    currentScreenRef.current = 'login';
    window.location.hash = 'screen=login';
    announce('Logged out successfully. Please sign in to continue.', 'polite');
  }, [stopSpeaking, pauseVoiceListening, announce]);

  // Restore authenticated session settings on mount if valid user exists
  useEffect(() => {
    const savedUser = getSavedSessionUser();
    if (savedUser) {
      setUser(savedUser);
      fetch('/api/auth/me')
        .then((res) => res.json())
        .then((data) => {
          if (data.settings) {
            setSettings(data.settings);
            if (data.settings.isBlindMode !== undefined) {
              setIsBlindModeState(Boolean(data.settings.isBlindMode));
            }
          }
        })
        .catch((err) => console.warn('Could not fetch user settings:', err));
    }
  }, []);

  // Listen to hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const params = new URLSearchParams(hash);
      const rawScreen = params.get('screen');
      if (rawScreen) {
        const matched = normalizeToApprovedScreen(rawScreen);
        if (matched && matched !== currentScreen) {
          const meta = SCREEN_REGISTRY[matched];
          const currentUser = user || getSavedSessionUser();
          if (meta?.requiresAuth && !currentUser) {
            setCurrentScreen('login');
            currentScreenRef.current = 'login';
            window.location.hash = 'screen=login';
            return;
          }
          setCurrentScreen(matched);
          currentScreenRef.current = matched;
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentScreen, user]);

  // Apply theme & font scale classes to document.body
  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(`theme-${settings.theme}`);
    document.body.classList.add(`font-scale-${settings.fontScale}`);
    if (settings.dyslexiaFont) {
      document.body.classList.add('font-dyslexic');
    }
    if (settings.reduceMotion) {
      document.body.classList.add('reduce-motion');
    }
  }, [settings]);

  // Start silent wake-word standby listening automatically when Vision Mode is active or when on login screen
  useEffect(() => {
    const isLoginScreen = currentScreen === 'login';
    const shouldWakeStandby = Boolean(isBlindMode || isLoginScreen);

    if (!shouldWakeStandby) {
      updateWakeWordState('DISABLED');
      pauseVoiceListening();
      return;
    }

    if (!isSpeakingRef.current) {
      updateWakeWordState('WAKE_WORD_STANDBY');
      const timer = setTimeout(() => {
        if (document.visibilityState !== 'hidden') {
          resumeVoiceListening();
        }
      }, 500);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          pauseVoiceListening();
        } else if (!isSpeakingRef.current) {
          updateWakeWordState('WAKE_WORD_STANDBY');
          resumeVoiceListening();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, isBlindMode, currentScreen, resumeVoiceListening, pauseVoiceListening, updateWakeWordState]);

  // Keyboard shortcut listener (Single-key WCAG backup)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Escape stops ongoing speech
      if (e.key === 'Escape') {
        stopSpeaking();
        return;
      }

      // Check for Alt+ combinations
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'r': // Alt+R: Repeat Current Question
            e.preventDefault();
            const repeatQuestionBtn = document.querySelector('[data-action="repeat-question"]') as HTMLElement;
            if (repeatQuestionBtn) {
              repeatQuestionBtn.click();
            } else {
              const mainEl = document.getElementById('main-content');
              if (mainEl) {
                const textToRead = mainEl.innerText.slice(0, 500);
                speakText(textToRead);
              }
            }
            break;
          case 'o': // Alt+O: Repeat Options
            e.preventDefault();
            const repeatOptionsBtn = document.querySelector('[data-action="repeat-options"]') as HTMLElement;
            if (repeatOptionsBtn) {
              repeatOptionsBtn.click();
            }
            break;
          case 'p': // Alt+P: Pause or Resume Speaking
            e.preventDefault();
            if ('speechSynthesis' in window) {
              if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                pauseSpeaking();
                announce('Speech paused', 'polite');
              } else if (window.speechSynthesis.paused) {
                resumeSpeaking();
                announce('Speech resumed', 'polite');
              }
            }
            break;
          case 'k': // Alt+K: Stop Speaking
            e.preventDefault();
            stopSpeaking();
            announce('Speech stopped', 'polite');
            break;
          case 'b': // Alt+B: Toggle Hands-Free Vision Mode
            e.preventDefault();
            toggleBlindMode();
            speakText(!isBlindMode ? 'Hands-Free Vision Mode Activated.' : 'Hands-Free Vision Mode Deactivated.');
            break;
          case 't': // Alt+T: Jump to AI Tutor
            e.preventDefault();
            navigateTo('ai_tutor');
            break;
          case 'd': // Alt+D: Jump to Dashboard
            e.preventDefault();
            navigateTo('dashboard');
            break;
          case 's': // Alt+S: Jump to Accessibility Settings
            e.preventDefault();
            navigateTo('accessibility_settings');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateTo, speakText, toggleBlindMode, isBlindMode]);

  const theme = (settings.theme === 'sapphire' ? 'default' : settings.theme) as ThemeMode;
  const setTheme = (t: ThemeMode) => {
    const backendTheme = t === 'default' ? 'sapphire' : t;
    updateSettings({ theme: backendTheme as any });
  };

  const fontSizeMap: Record<number, FontSize> = {
    100: 'normal',
    125: 'large',
    150: 'xlarge',
    175: 'xxlarge',
    200: 'xxlarge'
  };
  const fontScaleMap: Record<FontSize, number> = {
    normal: 100,
    large: 125,
    xlarge: 150,
    xxlarge: 175
  };

  const fontSize = fontSizeMap[settings.fontScale] || 'large';
  const setFontSize = (f: FontSize) => {
    updateSettings({ fontScale: fontScaleMap[f] || 125 });
  };

  const dyslexiaFont = !!settings.dyslexiaFont;
  const setDyslexiaFont = (d: boolean) => updateSettings({ dyslexiaFont: d });

  const speechRate = voicePrefs.speechRate;
  const speechPitch = voicePrefs.speechPitch;
  const speechVolume = voicePrefs.speechVolume;
  const selectedVoiceURI = voicePrefs.selectedVoiceURI;

  const updateSpeechRate = useCallback((value: number) => {
    const rate = clampSpeechRate(value);
    setVoicePrefs((prev) => {
      const next = saveVoicePreferences({ ...prev, speechRate: rate });
      voicePrefsRef.current = next;
      return next;
    });
    updateSettings({ speechRate: rate });
  }, [updateSettings]);

  const updateSpeechPitch = useCallback((value: number) => {
    const pitch = clampSpeechPitch(value);
    setVoicePrefs((prev) => {
      const next = saveVoicePreferences({ ...prev, speechPitch: pitch });
      voicePrefsRef.current = next;
      return next;
    });
    updateSettings({ speechPitch: pitch });
  }, [updateSettings]);

  const updateSpeechVolume = useCallback((value: number) => {
    const volume = clampSpeechVolume(value);
    setVoicePrefs((prev) => {
      const next = saveVoicePreferences({ ...prev, speechVolume: volume });
      voicePrefsRef.current = next;
      return next;
    });
  }, []);

  const updateSelectedVoice = useCallback((uri: string) => {
    const normalized = uri && uri.trim() ? uri.trim() : 'default';
    setVoicePrefs((prev) => {
      const next = saveVoicePreferences({ ...prev, selectedVoiceURI: normalized });
      voicePrefsRef.current = next;
      return next;
    });
    updateSettings({ voiceURI: normalized });
  }, [updateSettings]);

  const testVoice = useCallback(() => {
    stopSpeaking();
    speakText('Hello! This is your ACCESSPREP-X voice preview. You can adjust my speed, pitch and volume.');
  }, [stopSpeaking, speakText]);

  const setSpeechRate = (r: number) => updateSpeechRate(r);

  const compensatoryTime = !!settings.compensatoryTimeEnabled;
  const setCompensatoryTime = (c: boolean) => updateSettings({ compensatoryTimeEnabled: c });

  const whisperModel = settings.whisperModelSize || 'base';
  const setWhisperModel = (m: 'tiny' | 'base' | 'small') => updateSettings({ whisperModelSize: m });

  const resetDefaults = useCallback(() => {
    updateSettings({
      theme: 'sapphire',
      fontScale: 125,
      dyslexiaFont: false,
      speechRate: 1.0,
      speechPitch: 1.0,
      voiceURI: 'default',
      autoReadAloud: false,
      highContrastBorders: true,
      reduceMotion: false,
      compensatoryTimeEnabled: true,
      whisperModelSize: 'base',
      isBlindMode: false
    });
    updateSpeechRate(1.0);
    updateSpeechPitch(1.0);
    updateSpeechVolume(100);
    updateSelectedVoice('default');
    setIsBlindModeState(false);
  }, [updateSettings, updateSpeechRate, updateSpeechPitch, updateSpeechVolume, updateSelectedVoice]);

  return (
    <AccessibilityContext.Provider
      value={{
        currentScreen,
        navigateTo,
        setCurrentScreen: navigateTo,
        user,
        setUser,
        loginUser,
        logout,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        toggleSidebar,
        isMobileNavOpen,
        setIsMobileNavOpen,
        toggleMobileNav,
        settings,
        updateSettings,
        speakText,
        speak: speakText,
        stopSpeaking,
        pauseSpeaking,
        resumeSpeaking,
        isPausedSpeaking,
        slowDownSpeech,
        isSpeaking,
        announce,
        activeAnnouncement,
        announceMessage: activeAnnouncement?.message || '',
        theme,
        setTheme,
        fontSize,
        setFontSize,
        dyslexiaFont,
        setDyslexiaFont,
        speechRate,
        setSpeechRate,
        speechPitch,
        speechVolume,
        selectedVoiceURI,
        availableVoices,
        updateSpeechRate,
        updateSpeechPitch,
        updateSpeechVolume,
        updateSelectedVoice,
        testVoice,
        compensatoryTime,
        setCompensatoryTime,
        whisperModel,
        setWhisperModel,
        resetDefaults,
        // Hands-Free Vision Mode & Voice Command Engine
        isBlindMode,
        setIsBlindMode,
        toggleBlindMode,
        isVisionMode: isBlindMode,
        setIsVisionMode: setIsBlindMode,
        toggleVisionMode: toggleBlindMode,
        wakeWordState,
        isVoiceListening,
        micPermissionStatus,
        startVoiceListening,
        stopVoiceListening,
        registerVoiceHandler,
        playBeacon,
        // Global Voice Navigation Controller
        isExamActive,
        setIsExamActive,
        pendingExamExit,
        confirmExamExit,
        executeVoiceCommand
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
