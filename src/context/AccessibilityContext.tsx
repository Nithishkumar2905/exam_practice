import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ScreenId, APPROVED_SCREENS, SCREEN_REGISTRY } from '../types/screens.ts';
import { User, AccessibilitySettings } from '../db/database.ts';
import { audioBeacon } from '../utils/audioBeacon.ts';
import { NavigationController } from '../voice/NavigationController.ts';
import { NavigationContext } from '../voice/commandTypes.ts';

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
  compensatoryTime: boolean;
  setCompensatoryTime: (c: boolean) => void;
  whisperModel: 'tiny' | 'base' | 'small';
  setWhisperModel: (m: 'tiny' | 'base' | 'small') => void;

  // Autonomous Hands-Free Blind Mode & Voice Command Engine
  isBlindMode: boolean;
  setIsBlindMode: (enabled: boolean) => void;
  toggleBlindMode: () => void;
  isVoiceListening: boolean;
  startVoiceListening: () => void;
  stopVoiceListening: () => void;
  registerVoiceHandler: (handler: (transcript: string) => boolean | Promise<boolean>) => () => void;
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

  // Blind Mode State
  const [isBlindMode, setIsBlindModeState] = useState<boolean>(() => {
    try {
      const savedUser = getSavedSessionUser();
      const localFlag = localStorage.getItem('accessprep_blind_mode');
      if (localFlag !== null) return localFlag === 'true';
      if (savedUser?.pwdCategory === 'Visually Impaired' || savedUser?.needScribe) return true;
      return false;
    } catch {
      return false;
    }
  });

  // Voice Engine State
  const [isVoiceListening, setIsVoiceListening] = useState(false);

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
  const activeVoiceHandlerRef = useRef<((transcript: string) => boolean | Promise<boolean>) | null>(null);
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

  // Set Blind Mode with persistence
  const setIsBlindMode = useCallback((enabled: boolean) => {
    setIsBlindModeState(enabled);
    try {
      localStorage.setItem('accessprep_blind_mode', String(enabled));
    } catch {}
    updateSettings({ isBlindMode: enabled, autoReadAloud: enabled });
  }, [updateSettings]);

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

  // Text-To-Speech (Web Speech API) with Echo Cancellation & Playback Control
  const [isPausedSpeaking, setIsPausedSpeaking] = useState<boolean>(false);

  const stopSpeaking = useCallback(() => {
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
        if (screen === 'voice_practice' || screen === 'mock_exam') {
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
        armSilenceTimer();
      };

      rec.onresult = async (event: any) => {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        const lastIdx = event.results.length - 1;
        const result = event.results[lastIdx];
        if (!result || !result[0]) return;

        const transcript = result[0].transcript.trim();
        console.log('[VoiceCommander Heard]:', transcript);

        // Route through NavigationController — it handles priority chain internally
        if (navControllerRef.current) {
          const navResult = await navControllerRef.current.processTranscript(
            transcript,
            activeVoiceHandlerRef.current
          );

          console.log('[NavigationController]:', navResult.status, navResult.destination || '');

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

        // Unrecognized speech - re-arm silence timer
        armSilenceTimer();
      };

      rec.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('SpeechRecognition error:', e.error);
        }
      };

      rec.onend = () => {
        setIsVoiceListening(false);
        // Auto-restart if in blind mode and not speaking and not manually stopped
        if (isBlindModeRef.current && !isSpeakingRef.current && !isManuallyStoppedRef.current) {
          setTimeout(() => {
            if (isBlindModeRef.current && !isSpeakingRef.current && !isManuallyStoppedRef.current) {
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
    pauseVoiceListening();

    const cleanText = text.replace(/<[^>]*>?/gm, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = settings.speechRate || 1.0;
    utterance.pitch = settings.speechPitch || 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (settings.voiceURI && settings.voiceURI !== 'default') {
      const match = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (onEnd) {
        onEnd();
      } else if (isBlindModeRef.current) {
        // Play beacon chime signaling system is now listening
        audioBeacon.playListeningBeacon();
        resumeVoiceListening();
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (onEnd) {
        onEnd();
      } else if (isBlindModeRef.current) {
        resumeVoiceListening();
      }
    };

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
  const registerVoiceHandler = useCallback((handler: (transcript: string) => boolean | Promise<boolean>) => {
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
    if (isExamActiveRef.current && currentScreenRef.current === 'mock_exam' && matched !== 'mock_exam') {
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

    const isBlind = loggedInUser.pwdCategory === 'Visually Impaired' || loggedInUser.needScribe || Boolean(newSettings?.isBlindMode);
    if (newSettings) {
      setSettings({ ...newSettings, isBlindMode: isBlind });
    }
    setIsBlindModeState(isBlind);
    try {
      localStorage.setItem('accessprep_blind_mode', String(isBlind));
    } catch {}

    // Verbal Onboarding Sequence
    if (isBlind) {
      const welcome = `Welcome to your SSC MTS Candidate Portal, ${loggedInUser.name}. Hands-Free Blind Assistant Mode is active. You do not need to click anything. Say 'Start Mock Test', 'Practice Reasoning', 'Review Topics', or 'Help' for all commands.`;
      setTimeout(() => {
        speakText(welcome, () => {
          audioBeacon.playListeningBeacon();
          resumeVoiceListening();
        });
      }, 500);
    } else {
      const prompt = 'Welcome to ACCESSPREP-X. Would you like to enable Hands-Free Blind Assistance Mode? Say Yes or No.';
      setTimeout(() => {
        speakText(prompt, () => {
          audioBeacon.playListeningBeacon();
          // One-shot listener for Yes / No
          activeVoiceHandlerRef.current = (transcript: string) => {
            const clean = transcript.toLowerCase();
            if (clean.includes('yes') || clean.includes('enable') || clean.includes('sure')) {
              activeVoiceHandlerRef.current = null;
              setIsBlindMode(true);
              audioBeacon.playSuccessBeacon();
              speakText('Hands-Free Blind Assistant Mode enabled. Say Start Mock Test, Practice Reasoning, Review Topics, or Help for all commands.');
              return true;
            } else if (clean.includes('no') || clean.includes('cancel') || clean.includes('disable')) {
              activeVoiceHandlerRef.current = null;
              audioBeacon.playAlertBeacon();
              speakText('Standard Mode selected. You can enable Blind Mode anytime in settings.');
              return true;
            }
            return false;
          };
          resumeVoiceListening();
        });
      }, 500);
    }
  }, [setIsBlindMode, speakText, resumeVoiceListening]);

  // Logout handler: invalidates session, clears client storage, and redirects to login
  const logout = useCallback(() => {
    stopSpeaking();
    pauseVoiceListening();
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

  // Start continuous voice listening automatically if blind mode is active
  useEffect(() => {
    if (isBlindMode && !isSpeakingRef.current) {
      const timer = setTimeout(() => {
        resumeVoiceListening();
      }, 1000);
      return () => clearTimeout(timer);
    } else if (!isBlindMode) {
      pauseVoiceListening();
    }
  }, [isBlindMode, resumeVoiceListening, pauseVoiceListening]);

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
          case 'b': // Alt+B: Toggle Hands-Free Blind Mode
            e.preventDefault();
            toggleBlindMode();
            speakText(!isBlindMode ? 'Hands-Free Blind Mode Activated.' : 'Hands-Free Blind Mode Deactivated.');
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

  const speechRate = settings.speechRate || 1.0;
  const setSpeechRate = (r: number) => updateSettings({ speechRate: r });

  const compensatoryTime = !!settings.compensatoryTimeEnabled;
  const setCompensatoryTime = (c: boolean) => updateSettings({ compensatoryTimeEnabled: c });

  const whisperModel = settings.whisperModelSize || 'base';
  const setWhisperModel = (m: 'tiny' | 'base' | 'small') => updateSettings({ whisperModelSize: m });

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
        compensatoryTime,
        setCompensatoryTime,
        whisperModel,
        setWhisperModel,
        // Hands-Free Blind Mode & Voice Command Engine
        isBlindMode,
        setIsBlindMode,
        toggleBlindMode,
        isVoiceListening,
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
