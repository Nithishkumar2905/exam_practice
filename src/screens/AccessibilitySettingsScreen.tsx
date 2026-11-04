import React from 'react';
import { useAccessibility, ThemeMode, FontSize } from '../context/AccessibilityContext';
import { AudioToolbar } from '../components/AudioToolbar';
import { Sliders, Eye, Volume2, Type, Clock, Keyboard, Check, ShieldCheck, RefreshCw } from 'lucide-react';

export const AccessibilitySettingsScreen: React.FC = () => {
  const {
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
    speak
  } = useAccessibility();

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
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="mb-6 border-b border-slate-300 dark:border-slate-700 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-sm border border-blue-200 dark:border-blue-800">
            <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
            Screen 13 of 16 • Voice & Accessibility Settings
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            System & Assistive Technology Configuration
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Configure visual contrast themes, typographic sizing, text-to-speech audio speed, Whisper speech recognition, and PwD exam time accommodations.
          </p>
        </div>

        <AudioToolbar
          textToRead="System and Accessibility configuration page. Customize your visual contrast, text size, speech synthesizer, and exam time settings."
          label="Settings Audio"
        />
      </div>

      <div className="space-y-8">
        {/* Section 1: Color Themes */}
        <section aria-labelledby="theme-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 id="theme-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              1. Visual Contrast & Color Palette (WCAG 2.2 AAA Compliant)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  speak(`Theme switched to ${t.label}`);
                }}
                className={`p-4 rounded-sm border-2 text-left transition-all focus:ring-3 focus:ring-blue-600 ${
                  theme === t.id
                    ? 'border-blue-700 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/40'
                    : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{t.label}</span>
                  {theme === t.id && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-400">
                      <Check className="w-4 h-4" /> Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{t.desc}</p>
                <div className={`p-2 rounded border text-xs font-mono font-bold ${t.sample}`}>
                  Sample: Staff Selection Commission
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Section 2: Typography & Sizing */}
        <section aria-labelledby="typography-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 id="typography-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              2. Typographic Scaling & Legibility
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {fontSizes.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFontSize(f.id);
                  speak(`Text scale set to ${f.label}`);
                }}
                className={`p-3 rounded-sm border-2 text-left transition-all focus:ring-3 focus:ring-blue-600 ${
                  fontSize === f.id
                    ? 'border-blue-700 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/40'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                  <span>{f.label}</span>
                  {fontSize === f.id && <Check className="w-4 h-4 text-blue-700 dark:text-blue-400" />}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.desc}</div>
              </button>
            ))}
          </div>

          {/* Dyslexia Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-sm border border-slate-200 dark:border-slate-700">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">
                Dyslexia-Friendly Letter Spacing & Weight (OpenDyslexic / Lucida Sans)
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Enhances character boundary distinction and reduces symbol rotation confusion.
              </div>
            </div>
            <button
              onClick={() => {
                setDyslexiaFont(!dyslexiaFont);
                speak(`Dyslexia font ${!dyslexiaFont ? 'enabled' : 'disabled'}`);
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

        {/* Section 3: Speech Synthesis & Whisper Audio */}
        <section aria-labelledby="audio-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 id="audio-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              3. Voice Synthesis & Speech Recognition Engine
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="speech-rate-slider" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Text-to-Speech Playback Speed: <span className="font-mono text-blue-700 dark:text-blue-400">{speechRate}x</span>
              </label>
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
              <div className="flex justify-between text-xs text-slate-500 mt-1 font-mono">
                <span>0.75x (Slow)</span>
                <span>1.0x (Normal)</span>
                <span>1.25x</span>
                <span>1.5x</span>
                <span>1.75x (Fast)</span>
              </div>
              <button
                onClick={() => speak("Testing text-to-speech synthesized voice with current speed setting.")}
                className="mt-3 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-sm hover:bg-blue-50 dark:hover:bg-blue-950 focus:ring-2 focus:ring-blue-600"
              >
                🔊 Play Test Audio Phrase
              </button>
            </div>

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
                Transcribes microphone dictation into candidate answers. You can inspect and edit the recognized transcript before submission.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: PwD Compensatory Time */}
        <section aria-labelledby="pwd-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 id="pwd-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              4. Official SSC MTS Compensatory Time Accommodation
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
                Provides <strong>60 minutes per session</strong> (instead of standard 45 minutes) = <strong>20 minutes compensatory time per hour</strong> as per Department of Personnel and Training (DoPT) norms.
              </p>
            </div>

            <button
              onClick={() => {
                setCompensatoryTime(!compensatoryTime);
                speak(`Compensatory time ${!compensatoryTime ? 'activated: 60 minutes per session' : 'deactivated: standard 45 minutes per session'}`);
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-sm border focus:ring-3 focus:ring-blue-600 transition-colors ${
                compensatoryTime
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'
              }`}
            >
              {compensatoryTime ? '60 Mins (PwD Active)' : '45 Mins (Standard)'}
            </button>
          </div>
        </section>

        {/* Section 5: Keyboard Shortcuts Reference */}
        <section aria-labelledby="shortcuts-heading" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-6 rounded-sm shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 id="shortcuts-heading" className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              5. Global Keyboard Shortcuts Cheatsheet
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
              { key: 'Alt + 15', desc: 'ML Model Evaluation' },
              { key: 'Alt + 16', desc: 'Dataset Management' },
              { key: 'Alt + R', desc: 'Repeat Question & Options Aloud' },
              { key: 'Alt + O', desc: 'Repeat Options Only' },
              { key: 'Alt + P', desc: 'Pause / Resume Audio Reading' },
              { key: 'Alt + K / Esc', desc: 'Stop Speech Playback' },
              { key: 'Alt + T', desc: 'Toggle Visual Contrast Theme' },
              { key: 'Alt + + / -', desc: 'Increase / Decrease Text Size' }
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
    </div>
  );
};
