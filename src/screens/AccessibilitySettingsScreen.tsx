import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  useAccessibility,
  ThemeMode,
  FontSize
} from '../context/AccessibilityContext';
import {
  Sliders,
  Eye,
  Volume2,
  Type,
  Clock,
  Keyboard,
  Check,
  ShieldCheck,
  RotateCcw,
  Mic,
  Info,
  Play,
  Pause,
  Square,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import {
  SettingsVoiceGuide,
  getAvailableSettings,
  buildAllSettingsSpokenSummary,
  buildCurrentSettingsStatusSummary,
  processSettingsVoiceCommand
} from '../components/accessibility/SettingsVoiceGuide';

export const AccessibilitySettingsScreen: React.FC = () => {
  const accessibilityCtx = useAccessibility();
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    dyslexiaFont,
    setDyslexiaFont,
    speechRate,
    setSpeechRate,
    speechPitch,
    updateSpeechPitch,
    speechVolume,
    updateSpeechVolume,
    selectedVoiceURI,
    updateSelectedVoice,
    availableVoices,
    compensatoryTime,
    setCompensatoryTime,
    whisperModel,
    setWhisperModel,
    isBlindMode,
    setIsBlindMode,
    testVoice,
    resetDefaults,
    speakText,
    stopSpeaking,
    announce,
    registerVoiceHandler,
    isSpeaking
  } = accessibilityCtx;

  // Active view tab: Accessibility Settings vs Screen Reader Settings
  const [activeTab, setActiveTab] = useState<'accessibility' | 'screen_reader'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        if (hash.includes('screen_reader') || hash.includes('tab=screen_reader')) {
          return 'screen_reader';
        }
      }
    } catch {}
    return 'accessibility';
  });

  const [resetConfirming, setResetConfirming] = useState(false);
  const [currentFocusedIdx, setCurrentFocusedIdx] = useState(0);

  // Spoken introduction tracking: ensure introduction speaks once per tab visit
  const hasSpokenIntroRef = useRef<{ accessibility: boolean; screen_reader: boolean }>({
    accessibility: false,
    screen_reader: false
  });

  useEffect(() => {
    if (activeTab === 'accessibility' && !hasSpokenIntroRef.current.accessibility) {
      hasSpokenIntroRef.current.accessibility = true;
      announce('Welcome to Accessibility Settings in ACCESSPREP-X.', 'polite');
      speakText(
        'Welcome to Accessibility Settings in ACCESSPREP-X. Here you can customize the application to make learning and examinations more comfortable and accessible. You can adjust the visual theme, text size, dyslexia-friendly font, speech rate, voice pitch, compensatory time, and other accessibility features. You can say "Read settings" to hear all available options or say the name of a setting to learn more.'
      );
    } else if (activeTab === 'screen_reader' && !hasSpokenIntroRef.current.screen_reader) {
      hasSpokenIntroRef.current.screen_reader = true;
      announce('Welcome to Screen Reader Settings.', 'polite');
      speakText(
        'Welcome to Screen Reader Settings. Here you can configure how ACCESSPREP-X reads application content aloud and communicates interface information. You can explore the available reading options, speech behavior, navigation announcements, and other screen reader preferences.'
      );
    }
  }, [activeTab, speakText, announce]);

  // Voice command registration for settings queries & changes
  useEffect(() => {
    const unregister = registerVoiceHandler((transcript: string) => {
      const result = processSettingsVoiceCommand(
        transcript,
        accessibilityCtx,
        activeTab,
        setActiveTab,
        resetConfirming,
        setResetConfirming,
        currentFocusedIdx,
        setCurrentFocusedIdx
      );

      if (result && result.handled) {
        if (result.spokenResponse) {
          speakText(result.spokenResponse);
          announce(result.spokenResponse, 'polite');
        }
        return true;
      }
      return false;
    });

    return () => unregister();
  }, [
    accessibilityCtx,
    activeTab,
    resetConfirming,
    currentFocusedIdx,
    registerVoiceHandler,
    speakText,
    announce
  ]);

  const handleReadSettings = useCallback(() => {
    const summary = buildAllSettingsSpokenSummary(accessibilityCtx, activeTab);
    announce(`Reading all settings for ${activeTab === 'screen_reader' ? 'Screen Reader Settings' : 'Accessibility Settings'}`, 'polite');
    speakText(summary);
  }, [accessibilityCtx, activeTab, speakText, announce]);

  const handleCurrentSummary = useCallback(() => {
    const summary = buildCurrentSettingsStatusSummary(accessibilityCtx);
    announce('Reading current settings status summary', 'polite');
    speakText(summary);
  }, [accessibilityCtx, speakText, announce]);

  // Keyboard shortcut listener for Read Settings (Alt+R) & Stop (Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        stopSpeaking();
      } else if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleReadSettings();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReadSettings, stopSpeaking]);

  const themes: { id: ThemeMode; label: string; desc: string; sample: string }[] = [
    {
      id: 'default',
      label: 'Institutional Sapphire (Standard)',
      desc: 'SSC official blue `#0037b0` on crisp neutral background with 7:1+ contrast.',
      sample: 'bg-[#f8fafc] text-slate-900 border-blue-700'
    },
    {
      id: 'high-contrast-yellow',
      label: 'High-Contrast Yellow on Dark',
      desc: 'Pure `#ffff00` amber text on `#000000` pitch black. Optimal for low vision and photophobia.',
      sample: 'bg-black text-[#ffff00] border-[#ffff00]'
    },
    {
      id: 'monochrome',
      label: 'Monochrome High-Contrast',
      desc: 'Zero chromatic aberration. Pure black `#000000` on pure white `#ffffff` with bold boundaries.',
      sample: 'bg-white text-black border-black'
    },
    {
      id: 'soft-dark',
      label: 'Soft Dark (Slate Charcoal)',
      desc: 'Subdued slate `#0f172a` backdrop reducing night-time optical strain while maintaining AAA compliance.',
      sample: 'bg-slate-950 text-slate-100 border-slate-700'
    }
  ];

  const fontSizes: { id: FontSize; label: string; desc: string }[] = [
    { id: 'normal', label: '100% Standard', desc: 'Default readable typography (16px base)' },
    { id: 'large', label: '125% Large', desc: 'Enlarged body text (20px base)' },
    { id: 'xlarge', label: '150% Extra Large', desc: 'Strong magnification (24px base)' },
    { id: 'xxlarge', label: '175%–200% Maximum', desc: 'Maximum screen reader / visual magnifier size' }
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6" id="main-content">
      {/* Title & Screen Header */}
      <div className="border-b border-slate-300 dark:border-slate-700 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-sm border border-blue-200 dark:border-blue-800">
            <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
            Screen 13 of 16 • Voice &amp; Accessibility Settings
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            {activeTab === 'screen_reader' ? 'Screen Reader & Voice Settings' : 'System & Assistive Technology Configuration'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {activeTab === 'screen_reader'
              ? 'Configure text-to-speech speed, voice pitch, synthesizer, Whisper transcription model, and autonomous Vision Mode.'
              : 'Configure visual contrast palettes, typographic sizing, OpenDyslexic font, and official PwD examination time accommodations.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div role="tablist" aria-label="Settings Categories" className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 self-start md:self-auto shrink-0">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'accessibility'}
            aria-controls="panel-accessibility"
            id="tab-accessibility"
            onClick={() => setActiveTab('accessibility')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'accessibility'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Accessibility Settings</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'screen_reader'}
            aria-controls="panel-screen-reader"
            id="tab-screen-reader"
            onClick={() => setActiveTab('screen_reader')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'screen_reader'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Screen Reader Settings</span>
          </button>
        </div>
      </div>

      {/* Voice Guidance Assistant Bar */}
      <SettingsVoiceGuide
        ctx={accessibilityCtx}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReadSettings={handleReadSettings}
        onCurrentSummary={handleCurrentSummary}
      />

      {/* Reset Defaults Confirmation Modal / Alert */}
      {resetConfirming && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          className="p-5 bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 dark:border-amber-700 rounded-xl space-y-3"
        >
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 id="reset-title" className="text-sm font-bold">
              Confirmation Required: Restore Standard Accessibility Defaults?
            </h3>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            This will reset your visual theme to Institutional Sapphire, font size to Large 125%, speech rate to 1.0x, voice pitch to 1.0, and voice synthesizer to default. Say &quot;Yes&quot; or click Confirm to proceed.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setResetConfirming(false);
                resetDefaults();
                announce('All accessibility settings have been reset to default values.', 'polite');
                speakText('All accessibility settings have been reset to default values.');
              }}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-xs"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setResetConfirming(false);
                announce('Reset cancelled.', 'polite');
                speakText('Reset cancelled. Your settings have been kept.');
              }}
              className="px-4 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB 1: Accessibility Settings ────────────────────────────── */}
      {activeTab === 'accessibility' && (
        <div id="panel-accessibility" role="tabpanel" aria-labelledby="tab-accessibility" className="space-y-8">
          {/* Section 1: Color Themes */}
          <section aria-labelledby="theme-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h2 id="theme-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  1. Visual Contrast &amp; Color Palette (WCAG 2.2 AAA Compliant)
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Voice: Say &quot;Yellow theme&quot;, &quot;Monochrome&quot;, or &quot;Sapphire&quot;
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {themes.map((t) => {
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTheme(t.id);
                      speakText(`Theme switched to ${t.label}`);
                    }}
                    className={`p-4 rounded-sm border-2 text-left transition-all focus:ring-3 focus:ring-blue-600 ${
                      isActive
                        ? 'border-blue-700 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/40'
                        : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{t.label}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-400">
                          <Check className="w-4 h-4" /> Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{t.desc}</p>
                    <div className={`p-2 rounded border text-xs font-mono font-bold ${t.sample}`}>
                      Sample: Staff Selection Commission (MTS)
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Typography & Sizing */}
          <section aria-labelledby="typography-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h2 id="typography-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Typographic Scaling &amp; Legibility
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Voice: Say &quot;Increase font&quot;, &quot;Decrease font&quot;, or &quot;Large font&quot;
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {fontSizes.map((f) => {
                const isActive = fontSize === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFontSize(f.id);
                      speakText(`Text scale set to ${f.label}`);
                    }}
                    className={`p-3 rounded-sm border-2 text-left transition-all focus:ring-3 focus:ring-blue-600 ${
                      isActive
                        ? 'border-blue-700 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/40'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                      <span>{f.label}</span>
                      {isActive && <Check className="w-4 h-4 text-blue-700 dark:text-blue-400" />}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Dyslexia Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-sm border border-slate-200 dark:border-slate-700">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Dyslexia-Friendly Letter Spacing &amp; Weight (OpenDyslexic)
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Enhances character boundary distinction and reduces symbol rotation confusion. Say &quot;Toggle dyslexia font&quot; to change.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !dyslexiaFont;
                  setDyslexiaFont(next);
                  speakText(`Dyslexia font ${next ? 'enabled' : 'disabled'}`);
                }}
                className={`px-4 py-2 text-xs font-bold rounded-sm border focus:ring-2 focus:ring-blue-600 ${
                  dyslexiaFont
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                }`}
              >
                {dyslexiaFont ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </section>

          {/* Section 3: PwD Compensatory Time */}
          <section aria-labelledby="pwd-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h2 id="pwd-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                3. Official SSC MTS Compensatory Time Accommodation
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-sm border border-slate-200 dark:border-slate-700">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Persons with Benchmark Disabilities (PwD) Compensatory Time</span>
                  <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    SSC Guidelines
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Provides <strong>60 minutes per session</strong> (instead of standard 45 minutes) = <strong>20 minutes compensatory time per hour</strong> as per Department of Personnel and Training (DoPT) norms. Say &quot;Enable compensatory time&quot; to activate.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !compensatoryTime;
                  setCompensatoryTime(next);
                  speakText(
                    `Compensatory time ${next ? 'activated: 60 minutes per session' : 'deactivated: standard 45 minutes per session'}`
                  );
                }}
                className={`px-4 py-2.5 text-xs font-bold rounded-sm border focus:ring-3 focus:ring-blue-600 transition-colors shrink-0 ${
                  compensatoryTime
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                }`}
              >
                {compensatoryTime ? '60 Mins (PwD Active)' : '45 Mins (Standard)'}
              </button>
            </div>
          </section>

          {/* Section 4: Keyboard Shortcuts Reference */}
          <section aria-labelledby="shortcuts-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h2 id="shortcuts-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                4. Global Keyboard Shortcuts Cheatsheet
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { key: 'Alt + 1', desc: 'Welcome / Onboarding' },
                { key: 'Alt + 4', desc: 'Candidate Dashboard' },
                { key: 'Alt + 6', desc: 'Voice-First Practice' },
                { key: 'Alt + 7', desc: 'Mock Examination' },
                { key: 'Alt + 9', desc: 'AI Tutor Scribe' },
                { key: 'Alt + 13', desc: 'Accessibility Settings' },
                { key: 'Alt + R', desc: 'Read Settings / Repeat Question' },
                { key: 'Alt + O', desc: 'Repeat Options Only' },
                { key: 'Alt + P', desc: 'Pause / Resume Audio Reading' },
                { key: 'Alt + K / Esc', desc: 'Stop Speech Playback' },
                { key: 'Alt + T', desc: 'Toggle Visual Contrast Theme' },
                { key: 'Alt + B', desc: 'Toggle Hands-Free Vision Mode' }
              ].map((k, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{k.desc}</span>
                  <kbd className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded font-mono font-bold text-blue-700 dark:text-blue-300 text-[11px]">
                    {k.key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ─── TAB 2: Screen Reader Settings ────────────────────────────── */}
      {activeTab === 'screen_reader' && (
        <div id="panel-screen-reader" role="tabpanel" aria-labelledby="tab-screen-reader" className="space-y-8">
          {/* Section 1: Audio Playback Speed, Pitch & Volume */}
          <section aria-labelledby="speech-controls-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h2 id="speech-controls-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                1. Text-to-Speech Synthesizer Controls
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Speed */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="speech-rate-slider" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Speech Rate
                  </label>
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                    {speechRate}x
                  </span>
                </div>
                <input
                  id="speech-rate-slider"
                  type="range"
                  min="0.75"
                  max="1.75"
                  step="0.25"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>0.75x Slow</span>
                  <span>1.0x Normal</span>
                  <span>1.75x Fast</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Voice: Say &quot;Faster speech&quot;, &quot;Slower speech&quot;, or &quot;Speech rate one point five&quot;
                </p>
              </div>

              {/* Pitch */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="speech-pitch-slider" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Voice Pitch
                  </label>
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                    {speechPitch.toFixed(1)}
                  </span>
                </div>
                <input
                  id="speech-pitch-slider"
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={speechPitch}
                  onChange={(e) => updateSpeechPitch(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>0.5 Low</span>
                  <span>1.0 Normal</span>
                  <span>1.5 High</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Voice: Say &quot;Higher pitch&quot;, &quot;Lower pitch&quot;, or &quot;Normal pitch&quot;
                </p>
              </div>

              {/* Volume */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="speech-volume-slider" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Speech Volume
                  </label>
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                    {speechVolume}%
                  </span>
                </div>
                <input
                  id="speech-volume-slider"
                  type="range"
                  min="20"
                  max="100"
                  step="10"
                  value={speechVolume}
                  onChange={(e) => updateSpeechVolume(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>20% Softer</span>
                  <span>60%</span>
                  <span>100% Full</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Voice: Say &quot;Increase volume&quot;, &quot;Decrease volume&quot;, or &quot;Maximum volume&quot;
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={testVoice}
                className="px-3.5 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 focus:ring-2 focus:ring-blue-600 inline-flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" />
                <span>Test Voice Sample (Say &quot;Test voice&quot;)</span>
              </button>
            </div>
          </section>

          {/* Section 2: System Voice Synthesizer & OpenAI Whisper Model */}
          <section aria-labelledby="synthesizer-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h2 id="synthesizer-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                2. System Voices &amp; Whisper Speech Recognition Model
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* System Voice Selection */}
              <div>
                <label htmlFor="voice-select" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  System Voice Synthesizer
                </label>
                <select
                  id="voice-select"
                  value={selectedVoiceURI}
                  onChange={(e) => updateSelectedVoice(e.target.value)}
                  className="w-full text-sm font-semibold p-2.5 rounded-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-3 focus:ring-blue-600"
                >
                  <option value="default">Default System Voice</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}) {v.default ? '— Default' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Voice: Say &quot;Next voice&quot;, &quot;Default voice&quot;, or &quot;What voice am I using?&quot;
                </p>
              </div>

              {/* Whisper Model Size */}
              <div>
                <label htmlFor="whisper-model-select" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  OpenAI Whisper Speech Recognition Model
                </label>
                <select
                  id="whisper-model-select"
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value as 'tiny' | 'base' | 'small')}
                  className="w-full text-sm font-semibold p-2.5 rounded-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-3 focus:ring-blue-600"
                >
                  <option value="tiny">Whisper Tiny (Fastest, ~39M params, low latency)</option>
                  <option value="base">Whisper Base (Recommended, ~74M params, high accuracy)</option>
                  <option value="small">Whisper Small (High fidelity, ~244M params, complex accents)</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Voice: Say &quot;Whisper tiny&quot;, &quot;Whisper base&quot;, or &quot;Whisper small&quot;
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Autonomous Hands-Free Vision Mode */}
          <section aria-labelledby="vision-mode-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h2 id="vision-mode-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                3. Autonomous Hands-Free Vision Mode
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-sm border border-slate-200 dark:border-slate-700">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Continuous Wake-Word Detection &amp; Auto-Read Aloud</span>
                  {isBlindMode && (
                    <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Listens silently for the &quot;Hey Vision&quot; wake word and automatically reads question prompts aloud on examination screens. Say &quot;Toggle vision mode&quot; or press Alt+B to toggle.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !isBlindMode;
                  setIsBlindMode(next);
                  speakText(`Hands-Free Vision Mode ${next ? 'enabled' : 'disabled'}`);
                }}
                className={`px-4 py-2.5 text-xs font-bold rounded-sm border focus:ring-3 focus:ring-blue-600 transition-colors shrink-0 ${
                  isBlindMode
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                }`}
              >
                {isBlindMode ? 'Enabled (Active)' : 'Disabled'}
              </button>
            </div>
          </section>

          {/* Section 4: Restore Defaults */}
          <section aria-labelledby="defaults-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-700 dark:text-rose-400" />
              <h2 id="defaults-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                4. Restore Standard Accessibility Defaults
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Restores all color themes, typography scales, speech rate, voice pitch, volume, and synthesizer settings back to standard system defaults. Confirmation is requested before resetting.
            </p>
            <button
              type="button"
              onClick={() => {
                setResetConfirming(true);
                speakText('Are you sure you want to reset all accessibility preferences to default? Say Yes to confirm, or No to cancel.');
              }}
              className="px-4 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg inline-flex items-center gap-1.5 focus:ring-2 focus:ring-rose-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults (Say &quot;Reset defaults&quot;)</span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
};
