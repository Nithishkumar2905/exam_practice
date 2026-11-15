import React from 'react';
import { Volume2, Info, HelpCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { AccessibilityContextType } from '../../context/AccessibilityContext';

export interface SettingDescriptor {
  id: string;
  name: string;
  group: 'accessibility' | 'screen_reader';
  purpose: string;
  availableOptions: string;
  getCurrentValue: (ctx: AccessibilityContextType) => string;
  explain: (ctx: AccessibilityContextType) => string;
  voiceCommands: string[];
}

export const SETTINGS_REGISTRY: SettingDescriptor[] = [
  // ─── ACCESSPREP-X Accessibility Settings Group ─────────────────────────
  {
    id: 'theme',
    name: 'Color Theme',
    group: 'accessibility',
    purpose: 'Color Theme allows you to change the visual appearance and contrast ratio of the application.',
    availableOptions: 'Institutional Sapphire (Standard), High-Contrast Yellow on Dark, Monochrome High-Contrast, or Soft Dark.',
    getCurrentValue: (ctx) => {
      switch (ctx.theme) {
        case 'default':
        case 'sapphire':
          return 'Institutional Sapphire (Standard)';
        case 'high-contrast-yellow':
          return 'High-Contrast Yellow on Dark';
        case 'monochrome':
          return 'Monochrome High-Contrast';
        case 'soft-dark':
          return 'Soft Dark Slate Charcoal';
        default:
          return 'Institutional Sapphire';
      }
    },
    explain: (ctx) =>
      `Color Theme allows you to change the visual appearance of the application. You can choose Institutional Sapphire, High-Contrast Yellow on Dark, Monochrome, or Soft Dark. Your current theme is ${SETTINGS_REGISTRY[0].getCurrentValue(ctx)}. You can say "Yellow theme", "Monochrome theme", "Soft Dark theme", or "Sapphire theme" to change it.`,
    voiceCommands: ['"Sapphire theme"', '"Yellow theme"', '"Monochrome theme"', '"Soft Dark theme"', '"Read color settings"']
  },
  {
    id: 'fontSize',
    name: 'Text Scaling',
    group: 'accessibility',
    purpose: 'Text Scaling changes the size of the text displayed throughout the application.',
    availableOptions: 'Normal (100%), Large (125%), Extra Large (150%), or Maximum (175% to 200%).',
    getCurrentValue: (ctx) => {
      switch (ctx.fontSize) {
        case 'normal':
          return 'Normal (100% standard)';
        case 'large':
          return 'Large (125% enlarged)';
        case 'xlarge':
          return 'Extra Large (150% magnification)';
        case 'xxlarge':
          return 'Maximum (175% to 200% screen reader size)';
        default:
          return 'Large (125%)';
      }
    },
    explain: (ctx) =>
      `Text Scaling changes the size of the text displayed throughout the application. You can choose Normal, Large, Extra Large, or Maximum. Your current setting is ${SETTINGS_REGISTRY[1].getCurrentValue(ctx)}. You can say "Normal font", "Large font", "Extra large font", "Increase font", or "Decrease font".`,
    voiceCommands: ['"Normal font"', '"Large font"', '"Extra large font"', '"Increase font"', '"Decrease font"']
  },
  {
    id: 'dyslexiaFont',
    name: 'OpenDyslexic Typography',
    group: 'accessibility',
    purpose: 'OpenDyslexic is an alternative font designed to improve reading comfort for users who prefer dyslexia-friendly typography.',
    availableOptions: 'Enabled or Disabled.',
    getCurrentValue: (ctx) => (ctx.dyslexiaFont ? 'Enabled' : 'Disabled'),
    explain: (ctx) =>
      `OpenDyslexic is an alternative font designed to improve reading comfort for users who prefer dyslexia-friendly typography. It is currently ${ctx.dyslexiaFont ? 'enabled' : 'disabled'}. You can say "Enable dyslexia font", "Disable dyslexia font", or "Toggle dyslexia font".`,
    voiceCommands: ['"Enable dyslexia font"', '"Disable dyslexia font"', '"Toggle dyslexia font"']
  },
  {
    id: 'compensatoryTime',
    name: 'PwD Compensatory Time',
    group: 'accessibility',
    purpose: 'Compensatory Time provides additional examination time according to the institution\'s configured examination accommodation policy.',
    availableOptions: '60 minutes per session (PwD Active, +20m/h compensatory time) or 45 minutes per session (Standard).',
    getCurrentValue: (ctx) =>
      ctx.compensatoryTime ? 'Enabled: 60 minutes per session (20 minutes compensatory time per hour)' : 'Disabled: Standard 45 minutes per session',
    explain: (ctx) =>
      `Compensatory Time provides additional examination time according to the institution's configured examination accommodation policy. Under Department of Personnel and Training guidelines, candidates receive 20 minutes compensatory time per hour, giving 60 minutes per session instead of 45 minutes. It is currently ${ctx.compensatoryTime ? 'enabled' : 'disabled'}. You can say "Enable compensatory time" or "Disable compensatory time".`,
    voiceCommands: ['"Enable compensatory time"', '"Disable compensatory time"', '"Read compensatory time settings"']
  },

  // ─── ACCESSPREP-X Screen Reader & Voice Settings Group ─────────────────
  {
    id: 'speechRate',
    name: 'Speech Rate',
    group: 'screen_reader',
    purpose: 'Speech Rate controls how quickly the application reads text aloud.',
    availableOptions: '0.75x Slow, 1.0x Normal, 1.25x, 1.5x, or 1.75x Fast.',
    getCurrentValue: (ctx) => `${ctx.speechRate}x speed`,
    explain: (ctx) =>
      `Speech Rate controls how quickly the application reads text aloud. You can increase or decrease the reading speed. Your current rate is ${ctx.speechRate} times. You can say "Speech rate one", "Speech rate one point five", "Faster speech", or "Slower speech".`,
    voiceCommands: ['"Speech rate one"', '"Speech rate one point five"', '"Faster speech"', '"Slower speech"']
  },
  {
    id: 'speechPitch',
    name: 'Voice Pitch',
    group: 'screen_reader',
    purpose: 'Voice Pitch changes the tone of the synthesized voice.',
    availableOptions: 'Adjustable between 0.5 low pitch, 1.0 normal pitch, and 1.5 high pitch.',
    getCurrentValue: (ctx) => `${ctx.speechPitch.toFixed(1)} pitch`,
    explain: (ctx) =>
      `Voice Pitch changes the tone of the synthesized voice. You can adjust the pitch and select an available system voice. Your current pitch is ${ctx.speechPitch.toFixed(1)}. You can say "Higher pitch", "Lower pitch", "Normal pitch", or "Preview pitch".`,
    voiceCommands: ['"Higher pitch"', '"Lower pitch"', '"Normal pitch"', '"Preview pitch"']
  },
  {
    id: 'speechVolume',
    name: 'Speech Volume',
    group: 'screen_reader',
    purpose: 'Speech Volume controls the audio output loudness of the synthesized voice.',
    availableOptions: 'Adjustable from 0% to 100%.',
    getCurrentValue: (ctx) => `${ctx.speechVolume}%`,
    explain: (ctx) =>
      `Speech Volume controls the audio loudness of the voice synthesizer. Your current volume is ${ctx.speechVolume} percent. You can say "Increase volume", "Decrease volume", or "Maximum volume".`,
    voiceCommands: ['"Increase volume"', '"Decrease volume"', '"Maximum volume"']
  },
  {
    id: 'selectedVoiceURI',
    name: 'Voice Synthesizer',
    group: 'screen_reader',
    purpose: 'Voice Synthesizer selects the speech engine voice used to read portal content aloud.',
    availableOptions: 'Default system synthesizer or installed operating system voices.',
    getCurrentValue: (ctx) => {
      if (!ctx.selectedVoiceURI || ctx.selectedVoiceURI === 'default') {
        return 'Default system voice';
      }
      const match = ctx.availableVoices.find((v) => v.voiceURI === ctx.selectedVoiceURI);
      return match ? `${match.name} (${match.lang})` : ctx.selectedVoiceURI;
    },
    explain: (ctx) => {
      const v = SETTINGS_REGISTRY[7].getCurrentValue(ctx);
      return `Voice Synthesizer allows you to select from installed speech synthesis voices on your system. Currently selected voice is ${v}. You can say "Next voice", "Previous voice", or "Default voice" to switch voices.`;
    },
    voiceCommands: ['"Next voice"', '"Previous voice"', '"Default voice"', '"What voice am I using?"']
  },
  {
    id: 'whisperModel',
    name: 'Speech Recognition Model',
    group: 'screen_reader',
    purpose: 'Speech Recognition Model selects the OpenAI Whisper model size for converting microphone dictation into candidate answers.',
    availableOptions: 'Whisper Tiny (fastest, low latency), Whisper Base (recommended, balanced accuracy), or Whisper Small (high fidelity).',
    getCurrentValue: (ctx) => {
      switch (ctx.whisperModel) {
        case 'tiny':
          return 'Whisper Tiny (Fastest)';
        case 'base':
          return 'Whisper Base (Recommended)';
        case 'small':
          return 'Whisper Small (High Fidelity)';
        default:
          return 'Whisper Base';
      }
    },
    explain: (ctx) =>
      `Speech Recognition Model configures the OpenAI Whisper transcription model used for voice answers. Current setting is ${SETTINGS_REGISTRY[8].getCurrentValue(ctx)}. You can say "Whisper tiny", "Whisper base", or "Whisper small".`,
    voiceCommands: ['"Whisper tiny"', '"Whisper base"', '"Whisper small"']
  },
  {
    id: 'isBlindMode',
    name: 'Hands-Free Vision Mode',
    group: 'screen_reader',
    purpose: 'Hands-Free Vision Mode enables continuous voice navigation, automatic reading of questions, and "Hey Vision" wake-word listening.',
    availableOptions: 'Enabled or Disabled.',
    getCurrentValue: (ctx) => (ctx.isBlindMode ? 'Enabled' : 'Disabled'),
    explain: (ctx) =>
      `Hands-Free Vision Mode activates automatic screen reading, conversational guidance, and hands-free examination controls. It is currently ${ctx.isBlindMode ? 'enabled' : 'disabled'}. You can say "Enable vision mode", "Disable vision mode", or "Toggle vision mode".`,
    voiceCommands: ['"Enable vision mode"', '"Disable vision mode"', '"Toggle vision mode"']
  },
  {
    id: 'testVoice',
    name: 'Audio Test',
    group: 'screen_reader',
    purpose: 'Audio Test allows you to check how the application sounds with your current voice settings.',
    availableOptions: 'Play synthesized sample phrase.',
    getCurrentValue: () => 'Ready to test',
    explain: () =>
      'Audio Test allows you to check how the application sounds. You can say "Test voice" or "Play test audio" to hear a sample phrase.',
    voiceCommands: ['"Test voice"', '"Play test audio"']
  },
  {
    id: 'resetDefaults',
    name: 'Reset Defaults',
    group: 'screen_reader',
    purpose: 'Reset Defaults restores standard accessibility preferences across visual themes, font scaling, and voice settings.',
    availableOptions: 'Restore all standard defaults with confirmation.',
    getCurrentValue: () => 'Standard defaults available',
    explain: () =>
      'Reset Defaults restores the standard accessibility preferences. You can say "Reset defaults". The assistant will ask for your confirmation before resetting.',
    voiceCommands: ['"Reset defaults"', '"Restore defaults"']
  }
];

export function getAvailableSettings(group?: 'accessibility' | 'screen_reader'): SettingDescriptor[] {
  if (!group) return SETTINGS_REGISTRY;
  return SETTINGS_REGISTRY.filter((s) => s.group === group);
}

/**
 * Builds the comprehensive spoken summary for "Read settings"
 */
export function buildAllSettingsSpokenSummary(
  ctx: AccessibilityContextType,
  group?: 'accessibility' | 'screen_reader'
): string {
  const settingsList = getAvailableSettings(group);
  const countWord = settingsList.length === 4 ? 'four' : settingsList.length === 8 ? 'eight' : String(settingsList.length);
  const groupLabel = group === 'screen_reader' ? 'Screen Reader Settings' : group === 'accessibility' ? 'Accessibility Settings' : 'System and Accessibility Settings';

  const ordinalWords = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];

  const lines = settingsList.map((s, idx) => {
    const ordinal = ordinalWords[idx] || `Item ${idx + 1}`;
    const curVal = s.getCurrentValue(ctx);
    return `${ordinal}, ${s.name}. ${s.purpose} Your current setting is ${curVal}.`;
  });

  return `${groupLabel} contains ${countWord} available controls. ${lines.join(' ')} Would you like me to explain any particular setting? You can say the setting name or say a command to change it.`;
}

/**
 * Builds dynamic summary of currently enabled / disabled toggles
 */
export function buildEnabledSettingsSummary(ctx: AccessibilityContextType): string {
  const enabledList: string[] = [];
  if (ctx.dyslexiaFont) enabledList.push('OpenDyslexic typography font');
  if (ctx.compensatoryTime) enabledList.push('PwD Compensatory Time (60 minutes per session)');
  if (ctx.isBlindMode) enabledList.push('Hands-Free Vision Mode');
  if (ctx.settings.highContrastBorders) enabledList.push('High-Contrast Boundaries');
  if (ctx.settings.reduceMotion) enabledList.push('Reduced Motion Mode');

  if (enabledList.length === 0) {
    return 'None of the optional toggle settings are currently enabled. Standard visual and examination modes are active.';
  }
  return `Currently enabled accessibility features are: ${enabledList.join(', ')}.`;
}

export function buildDisabledSettingsSummary(ctx: AccessibilityContextType): string {
  const disabledList: string[] = [];
  if (!ctx.dyslexiaFont) disabledList.push('OpenDyslexic typography');
  if (!ctx.compensatoryTime) disabledList.push('PwD Compensatory Time');
  if (!ctx.isBlindMode) disabledList.push('Hands-Free Vision Mode');
  if (!ctx.settings.reduceMotion) disabledList.push('Reduced Motion Mode');

  if (disabledList.length === 0) {
    return 'All optional accessibility features are currently enabled.';
  }
  return `Currently disabled accessibility features are: ${disabledList.join(', ')}.`;
}

/**
 * Builds a dynamic snapshot of all current settings values
 */
export function buildCurrentSettingsStatusSummary(ctx: AccessibilityContextType): string {
  const themeDesc = SETTINGS_REGISTRY.find((s) => s.id === 'theme')?.getCurrentValue(ctx);
  const fontDesc = SETTINGS_REGISTRY.find((s) => s.id === 'fontSize')?.getCurrentValue(ctx);
  const dyslexiaDesc = ctx.dyslexiaFont ? 'enabled' : 'disabled';
  const rateDesc = `${ctx.speechRate} times`;
  const pitchDesc = `${ctx.speechPitch.toFixed(1)} pitch`;
  const volDesc = `${ctx.speechVolume} percent`;
  const voiceDesc = SETTINGS_REGISTRY.find((s) => s.id === 'selectedVoiceURI')?.getCurrentValue(ctx);
  const compDesc = ctx.compensatoryTime ? '60 minutes per session enabled' : 'standard 45 minutes';

  return `Current settings summary: Visual theme is ${themeDesc}. Text scale is ${fontDesc}. OpenDyslexic font is ${dyslexiaDesc}. Speech rate is ${rateDesc}. Voice pitch is ${pitchDesc}. Speech volume is ${volDesc}. Synthesizer is ${voiceDesc}. PwD compensatory time is ${compDesc}.`;
}

/**
 * Processes spoken queries, explanations, and setting changes for Accessibility & Screen Reader settings
 */
export function processSettingsVoiceCommand(
  rawTranscript: string,
  ctx: AccessibilityContextType,
  activeTab: 'accessibility' | 'screen_reader',
  setActiveTab: (tab: 'accessibility' | 'screen_reader') => void,
  resetConfirming: boolean,
  setResetConfirming: (val: boolean) => void,
  currentFocusedIdx: number,
  setCurrentFocusedIdx: (idx: number) => void
): { handled: boolean; spokenResponse: string; actionTaken?: string } | null {
  const t = rawTranscript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Reset confirmation flow
  if (resetConfirming) {
    if (t === 'yes' || t === 'confirm' || t === 'yes reset' || t === 'yes confirm') {
      setResetConfirming(false);
      // Execute reset
      ctx.setTheme('default');
      ctx.setFontSize('large');
      ctx.setDyslexiaFont(false);
      ctx.updateSpeechRate(1.0);
      ctx.updateSpeechPitch(1.0);
      ctx.updateSpeechVolume(100);
      ctx.updateSelectedVoice('default');
      ctx.setCompensatoryTime(true);
      ctx.setWhisperModel('base');
      ctx.setIsBlindMode(false);
      return {
        handled: true,
        spokenResponse: 'All accessibility and screen reader settings have been reset to default values.',
        actionTaken: 'reset_executed'
      };
    }
    if (t === 'no' || t === 'cancel' || t === 'dont reset' || t === 'do not reset') {
      setResetConfirming(false);
      return {
        handled: true,
        spokenResponse: 'Reset cancelled. Your current accessibility preferences have been preserved.',
        actionTaken: 'reset_cancelled'
      };
    }
    // Ambiguous response during confirmation
    return {
      handled: true,
      spokenResponse: 'I am waiting for your confirmation. Say Yes to reset all settings to default, or say No to cancel.'
    };
  }

  // 2. Stop speech
  if (t === 'stop' || t === 'stop speaking' || t === 'silence' || t === 'be quiet' || t === 'mute') {
    ctx.stopSpeaking();
    return { handled: true, spokenResponse: '', actionTaken: 'stop_speech' };
  }

  // 3. Navigation between Settings tabs
  if (t.includes('open screen reader settings') || t === 'screen reader settings' || t === 'screen reader' || t.includes('switch to screen reader')) {
    setActiveTab('screen_reader');
    const spoken = 'Switched to Screen Reader Settings. Here you can configure speech speed, pitch, volume, voice synthesizer, and speech recognition.';
    return { handled: true, spokenResponse: spoken, actionTaken: 'tab_screen_reader' };
  }

  if (t.includes('open accessibility settings') || t === 'accessibility settings' || t.includes('switch to accessibility')) {
    setActiveTab('accessibility');
    const spoken = 'Switched to Accessibility Settings. Here you can customize visual contrast, text size, OpenDyslexic font, and compensatory examination time.';
    return { handled: true, spokenResponse: spoken, actionTaken: 'tab_accessibility' };
  }

  // 4. "Read settings" / "Read all settings"
  if (t === 'read settings' || t === 'read all settings' || t === 'explain all settings' || t === 'read all options') {
    const spoken = buildAllSettingsSpokenSummary(ctx, activeTab);
    return { handled: true, spokenResponse: spoken, actionTaken: 'read_all_settings' };
  }

  if (t === 'read accessibility settings') {
    setActiveTab('accessibility');
    const spoken = buildAllSettingsSpokenSummary(ctx, 'accessibility');
    return { handled: true, spokenResponse: spoken, actionTaken: 'read_accessibility_settings' };
  }

  if (t === 'read screen reader settings') {
    setActiveTab('screen_reader');
    const spoken = buildAllSettingsSpokenSummary(ctx, 'screen_reader');
    return { handled: true, spokenResponse: spoken, actionTaken: 'read_screen_reader_settings' };
  }

  // 5. High-level summaries
  if (t.includes('what settings are enabled') || t === 'enabled settings' || t === 'which settings are enabled') {
    return { handled: true, spokenResponse: buildEnabledSettingsSummary(ctx), actionTaken: 'enabled_summary' };
  }

  if (t.includes('what settings are disabled') || t === 'disabled settings' || t === 'which settings are disabled') {
    return { handled: true, spokenResponse: buildDisabledSettingsSummary(ctx), actionTaken: 'disabled_summary' };
  }

  if (
    t === 'read current settings' ||
    t === 'summary of settings' ||
    t === 'what are my settings' ||
    t === 'settings status' ||
    t === 'current settings'
  ) {
    return { handled: true, spokenResponse: buildCurrentSettingsStatusSummary(ctx), actionTaken: 'current_settings_summary' };
  }

  if (t.includes('what settings are available') || t === 'list settings' || t === 'available settings') {
    const items = getAvailableSettings(activeTab).map((s) => s.name).join(', ');
    return {
      handled: true,
      spokenResponse: `The available settings in ${activeTab === 'screen_reader' ? 'Screen Reader Settings' : 'Accessibility Settings'} are: ${items}. Say "Explain" followed by any setting name to learn more.`,
      actionTaken: 'list_settings'
    };
  }

  // 6. Next / Previous setting stepper
  const currentTabSettings = getAvailableSettings(activeTab);
  if (t === 'next setting' || t === 'next option') {
    const nextIdx = (currentFocusedIdx + 1) % currentTabSettings.length;
    setCurrentFocusedIdx(nextIdx);
    const item = currentTabSettings[nextIdx];
    return {
      handled: true,
      spokenResponse: `${item.name}. ${item.purpose} Current value: ${item.getCurrentValue(ctx)}.`,
      actionTaken: 'next_setting'
    };
  }

  if (t === 'previous setting' || t === 'previous option') {
    const prevIdx = (currentFocusedIdx - 1 + currentTabSettings.length) % currentTabSettings.length;
    setCurrentFocusedIdx(prevIdx);
    const item = currentTabSettings[prevIdx];
    return {
      handled: true,
      spokenResponse: `${item.name}. ${item.purpose} Current value: ${item.getCurrentValue(ctx)}.`,
      actionTaken: 'prev_setting'
    };
  }

  // 7. Voice-based setting changes (evaluated first so action verbs take precedence)

  // A. Theme changes
  if (t.includes('yellow theme') || t.includes('high contrast yellow') || t.includes('yellow on dark') || t === 'switch to yellow theme') {
    ctx.setTheme('high-contrast-yellow');
    return {
      handled: true,
      spokenResponse: 'High-Contrast Yellow on Dark has been enabled.',
      actionTaken: 'change_theme_yellow'
    };
  }
  if (t.includes('monochrome theme') || t.includes('monochrome') || t.includes('black and white theme')) {
    ctx.setTheme('monochrome');
    return {
      handled: true,
      spokenResponse: 'Monochrome High-Contrast theme has been enabled.',
      actionTaken: 'change_theme_monochrome'
    };
  }
  if (t.includes('soft dark theme') || t.includes('soft dark') || t.includes('slate theme')) {
    ctx.setTheme('soft-dark');
    return {
      handled: true,
      spokenResponse: 'Soft Dark Slate Charcoal theme has been enabled.',
      actionTaken: 'change_theme_soft_dark'
    };
  }
  if (t.includes('sapphire theme') || t.includes('standard theme') || t.includes('blue theme') || t.includes('default theme')) {
    ctx.setTheme('default');
    return {
      handled: true,
      spokenResponse: 'Institutional Sapphire theme has been enabled.',
      actionTaken: 'change_theme_sapphire'
    };
  }

  // B. Font scaling changes
  if (t.includes('normal font') || t.includes('standard font') || t.includes('100 percent font') || t === 'font size normal') {
    ctx.setFontSize('normal');
    return {
      handled: true,
      spokenResponse: 'Your font size has been set to Normal 100 percent.',
      actionTaken: 'change_font_normal'
    };
  }
  if (t.includes('large font') || t.includes('125 percent font') || t === 'font size large') {
    ctx.setFontSize('large');
    return {
      handled: true,
      spokenResponse: 'Your font size has been set to Large 125 percent.',
      actionTaken: 'change_font_large'
    };
  }
  if (t.includes('extra large font') || t.includes('150 percent font') || t === 'font size extra large') {
    ctx.setFontSize('xlarge');
    return {
      handled: true,
      spokenResponse: 'Your font size has been set to Extra Large 150 percent.',
      actionTaken: 'change_font_xlarge'
    };
  }
  if (t.includes('maximum font') || t.includes('maximum text size') || t.includes('200 percent font') || t.includes('maximum size')) {
    ctx.setFontSize('xxlarge');
    return {
      handled: true,
      spokenResponse: 'Your font size has been set to Maximum size for visual magnification.',
      actionTaken: 'change_font_xxlarge'
    };
  }
  if (t.includes('increase font') || t.includes('increase text') || t.includes('bigger font') || t.includes('larger text')) {
    const progression: Record<string, 'large' | 'xlarge' | 'xxlarge'> = {
      normal: 'large',
      large: 'xlarge',
      xlarge: 'xxlarge',
      xxlarge: 'xxlarge'
    };
    const next = progression[ctx.fontSize] || 'large';
    ctx.setFontSize(next);
    return {
      handled: true,
      spokenResponse: `Your font size has been increased to ${next}.`,
      actionTaken: 'increase_font'
    };
  }
  if (t.includes('decrease font') || t.includes('decrease text') || t.includes('smaller font') || t.includes('smaller text')) {
    const progression: Record<string, 'normal' | 'large' | 'xlarge'> = {
      xxlarge: 'xlarge',
      xlarge: 'large',
      large: 'normal',
      normal: 'normal'
    };
    const prev = progression[ctx.fontSize] || 'normal';
    ctx.setFontSize(prev);
    return {
      handled: true,
      spokenResponse: `Your font size has been decreased to ${prev}.`,
      actionTaken: 'decrease_font'
    };
  }

  // C. OpenDyslexic changes
  if (t.includes('enable dyslexia') || t.includes('turn on dyslexia')) {
    ctx.setDyslexiaFont(true);
    return {
      handled: true,
      spokenResponse: 'OpenDyslexic typography has been enabled.',
      actionTaken: 'enable_dyslexia'
    };
  }
  if (t.includes('disable dyslexia') || t.includes('turn off dyslexia')) {
    ctx.setDyslexiaFont(false);
    return {
      handled: true,
      spokenResponse: 'OpenDyslexic typography has been disabled.',
      actionTaken: 'disable_dyslexia'
    };
  }
  if (t.includes('toggle dyslexia')) {
    const next = !ctx.dyslexiaFont;
    ctx.setDyslexiaFont(next);
    return {
      handled: true,
      spokenResponse: `OpenDyslexic typography has been ${next ? 'enabled' : 'disabled'}.`,
      actionTaken: 'toggle_dyslexia'
    };
  }

  // D. Compensatory time changes
  if (t.includes('enable compensatory') || t.includes('activate compensatory') || t === 'compensatory time on') {
    ctx.setCompensatoryTime(true);
    return {
      handled: true,
      spokenResponse: 'PwD Compensatory Time has been activated: 60 minutes per session.',
      actionTaken: 'enable_compensatory'
    };
  }
  if (t.includes('disable compensatory') || t.includes('deactivate compensatory') || t === 'compensatory time off') {
    ctx.setCompensatoryTime(false);
    return {
      handled: true,
      spokenResponse: 'Compensatory time has been deactivated: standard 45 minutes per session.',
      actionTaken: 'disable_compensatory'
    };
  }
  if (t.includes('toggle compensatory')) {
    const next = !ctx.compensatoryTime;
    ctx.setCompensatoryTime(next);
    return {
      handled: true,
      spokenResponse: `Compensatory time has been ${next ? 'activated: 60 minutes per session' : 'deactivated: standard 45 minutes per session'}.`,
      actionTaken: 'toggle_compensatory'
    };
  }

  // E. Speech rate changes
  if (t.includes('speech rate one point five') || t === 'rate 1 5' || t === 'speech rate 1 5') {
    ctx.updateSpeechRate(1.5);
    return { handled: true, spokenResponse: 'Speech rate set to 1.5x.', actionTaken: 'rate_1_5' };
  }
  if (t.includes('speech rate one point two five') || t === 'rate 1 25' || t === 'speech rate 1 25') {
    ctx.updateSpeechRate(1.25);
    return { handled: true, spokenResponse: 'Speech rate set to 1.25x.', actionTaken: 'rate_1_25' };
  }
  if (t.includes('speech rate zero point seven five') || t === 'rate 0 75' || t === 'speech rate 0 75') {
    ctx.updateSpeechRate(0.75);
    return { handled: true, spokenResponse: 'Speech rate set to 0.75x slow.', actionTaken: 'rate_0_75' };
  }
  if (t.includes('speech rate one point seven five') || t === 'rate 1 75') {
    ctx.updateSpeechRate(1.75);
    return { handled: true, spokenResponse: 'Speech rate set to 1.75x fast.', actionTaken: 'rate_1_75' };
  }
  if (t.includes('speech rate one') || t === 'rate 1' || t === 'normal speed') {
    ctx.updateSpeechRate(1.0);
    return { handled: true, spokenResponse: 'Speech rate set to 1.0x normal.', actionTaken: 'rate_1_0' };
  }
  if (t.includes('faster speech') || t.includes('faster speed') || t === 'speed up') {
    const newRate = Math.min(1.75, Math.round((ctx.speechRate + 0.25) * 100) / 100);
    ctx.updateSpeechRate(newRate);
    return { handled: true, spokenResponse: `Speech rate increased to ${newRate}x.`, actionTaken: 'faster_speech' };
  }
  if (t.includes('slower speech') || t.includes('slower speed') || t === 'slow down') {
    const newRate = Math.max(0.75, Math.round((ctx.speechRate - 0.25) * 100) / 100);
    ctx.updateSpeechRate(newRate);
    return { handled: true, spokenResponse: `Speech rate decreased to ${newRate}x.`, actionTaken: 'slower_speech' };
  }

  // F. Voice pitch changes
  if (t.includes('higher pitch') || t.includes('increase pitch')) {
    const newPitch = Math.min(1.5, Math.round((ctx.speechPitch + 0.2) * 10) / 10);
    ctx.updateSpeechPitch(newPitch);
    return { handled: true, spokenResponse: `Voice pitch set to ${newPitch.toFixed(1)} higher pitch.`, actionTaken: 'higher_pitch' };
  }
  if (t.includes('lower pitch') || t.includes('decrease pitch')) {
    const newPitch = Math.max(0.5, Math.round((ctx.speechPitch - 0.2) * 10) / 10);
    ctx.updateSpeechPitch(newPitch);
    return { handled: true, spokenResponse: `Voice pitch set to ${newPitch.toFixed(1)} lower pitch.`, actionTaken: 'lower_pitch' };
  }
  if (t.includes('normal pitch') || t.includes('reset pitch')) {
    ctx.updateSpeechPitch(1.0);
    return { handled: true, spokenResponse: 'Voice pitch reset to 1.0 normal.', actionTaken: 'normal_pitch' };
  }
  if (t.includes('preview pitch') || t.includes('test pitch')) {
    ctx.testVoice();
    return { handled: true, spokenResponse: '', actionTaken: 'preview_pitch' };
  }

  // G. Speech volume changes
  if (t.includes('increase volume') || t.includes('louder')) {
    const newVol = Math.min(100, ctx.speechVolume + 15);
    ctx.updateSpeechVolume(newVol);
    return { handled: true, spokenResponse: `Speech volume increased to ${newVol} percent.`, actionTaken: 'increase_volume' };
  }
  if (t.includes('decrease volume') || t.includes('softer')) {
    const newVol = Math.max(20, ctx.speechVolume - 15);
    ctx.updateSpeechVolume(newVol);
    return { handled: true, spokenResponse: `Speech volume decreased to ${newVol} percent.`, actionTaken: 'decrease_volume' };
  }
  if (t.includes('maximum volume') || t.includes('full volume')) {
    ctx.updateSpeechVolume(100);
    return { handled: true, spokenResponse: 'Speech volume set to maximum 100 percent.', actionTaken: 'max_volume' };
  }

  // H. System voice switching
  if (t === 'next voice') {
    const voices = ctx.availableVoices;
    if (voices.length > 0) {
      const curIdx = voices.findIndex((v) => v.voiceURI === ctx.selectedVoiceURI);
      const nextIdx = (curIdx + 1) % voices.length;
      const nextVoice = voices[nextIdx];
      ctx.updateSelectedVoice(nextVoice.voiceURI);
      return {
        handled: true,
        spokenResponse: `Switched voice to ${nextVoice.name}.`,
        actionTaken: 'next_voice'
      };
    }
  }
  if (t === 'default voice' || t === 'reset voice') {
    ctx.updateSelectedVoice('default');
    return { handled: true, spokenResponse: 'Voice synthesizer reset to default system voice.', actionTaken: 'default_voice' };
  }

  // I. Whisper model changes
  if (t.includes('whisper tiny')) {
    ctx.setWhisperModel('tiny');
    return { handled: true, spokenResponse: 'Speech recognition model set to Whisper Tiny.', actionTaken: 'whisper_tiny' };
  }
  if (t.includes('whisper base')) {
    ctx.setWhisperModel('base');
    return { handled: true, spokenResponse: 'Speech recognition model set to Whisper Base.', actionTaken: 'whisper_base' };
  }
  if (t.includes('whisper small')) {
    ctx.setWhisperModel('small');
    return { handled: true, spokenResponse: 'Speech recognition model set to Whisper Small.', actionTaken: 'whisper_small' };
  }

  // J. Vision Mode changes
  if (t.includes('enable vision mode') || t.includes('activate vision mode')) {
    ctx.setIsBlindMode(true);
    return { handled: true, spokenResponse: 'Hands-Free Vision Mode has been enabled.', actionTaken: 'enable_vision' };
  }
  if (t.includes('disable vision mode') || t.includes('deactivate vision mode')) {
    ctx.setIsBlindMode(false);
    return { handled: true, spokenResponse: 'Hands-Free Vision Mode has been disabled.', actionTaken: 'disable_vision' };
  }
  if (t.includes('toggle vision mode')) {
    const next = !ctx.isBlindMode;
    ctx.setIsBlindMode(next);
    return { handled: true, spokenResponse: `Hands-Free Vision Mode has been ${next ? 'enabled' : 'disabled'}.`, actionTaken: 'toggle_vision' };
  }

  // K. Audio Test
  if (t === 'test voice' || t === 'test audio' || t === 'play test audio') {
    ctx.testVoice();
    return { handled: true, spokenResponse: '', actionTaken: 'test_voice' };
  }

  // L. Reset Defaults initiation (requests confirmation)
  if (t === 'reset defaults' || t === 'restore defaults' || t === 'reset all settings') {
    setResetConfirming(true);
    return {
      handled: true,
      spokenResponse: 'Are you sure you want to reset all accessibility preferences to default? Say Yes to confirm, or No to cancel.',
      actionTaken: 'reset_requested'
    };
  }

  // 8. Individual explanations / "What is..." queries
  if (
    t.includes('which theme') ||
    t.includes('what theme') ||
    t.includes('current theme') ||
    t.includes('what is my theme') ||
    t === 'theme status'
  ) {
    return {
      handled: true,
      spokenResponse: `Your current visual theme is ${SETTINGS_REGISTRY[0].getCurrentValue(ctx)}.`,
      actionTaken: 'current_theme_query'
    };
  }

  if (t.includes('theme') || t.includes('color settings') || t.includes('visual contrast')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[0].explain(ctx),
      actionTaken: 'explain_theme'
    };
  }

  if (t.includes('dyslexia') || t.includes('opendyslexic')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[2].explain(ctx),
      actionTaken: 'explain_dyslexia'
    };
  }

  if (
    t.includes('what is my font') ||
    t.includes('what font am i using') ||
    t.includes('current font') ||
    t.includes('which font')
  ) {
    return {
      handled: true,
      spokenResponse: `Your current font size is ${SETTINGS_REGISTRY[1].getCurrentValue(ctx)}.`,
      actionTaken: 'current_font_query'
    };
  }

  if (t.includes('text scaling') || t.includes('font size') || t.includes('text size') || t.includes('font scale') || t.includes('font')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[1].explain(ctx),
      actionTaken: 'explain_font'
    };
  }

  if (t.includes('compensatory') || t.includes('extra time') || t.includes('pwd time')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[3].explain(ctx),
      actionTaken: 'explain_compensatory'
    };
  }

  if (t.includes('speech rate') || t.includes('reading speed') || t.includes('speech speed') || t.includes('playback speed') || t.includes('rate')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[4].explain(ctx),
      actionTaken: 'explain_rate'
    };
  }

  if (t.includes('voice pitch') || t.includes('pitch')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[5].explain(ctx),
      actionTaken: 'explain_pitch'
    };
  }

  if (t.includes('speech volume') || t.includes('volume') || t.includes('loudness')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[6].explain(ctx),
      actionTaken: 'explain_volume'
    };
  }

  if (t.includes('synthesizer') || t.includes('voice name') || t.includes('system voice') || t.includes('which voice') || t.includes('what voice')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[7].explain(ctx),
      actionTaken: 'explain_voice'
    };
  }

  if (t.includes('whisper') || t.includes('speech recognition')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[8].explain(ctx),
      actionTaken: 'explain_whisper'
    };
  }

  if (t.includes('vision mode') || t.includes('blind mode')) {
    return {
      handled: true,
      spokenResponse: SETTINGS_REGISTRY[9].explain(ctx),
      actionTaken: 'explain_vision_mode'
    };
  }

  return null;
}

interface SettingsVoiceGuideProps {
  ctx: AccessibilityContextType;
  activeTab: 'accessibility' | 'screen_reader';
  setActiveTab: (tab: 'accessibility' | 'screen_reader') => void;
  onReadSettings: () => void;
  onCurrentSummary: () => void;
}

export const SettingsVoiceGuide: React.FC<SettingsVoiceGuideProps> = ({
  ctx,
  activeTab,
  setActiveTab,
  onReadSettings,
  onCurrentSummary
}) => {
  return (
    <div
      role="region"
      aria-label="Voice Guidance and Audio Controls"
      className="bg-blue-50/70 dark:bg-blue-950/40 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shadow-xs shrink-0">
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Spoken Guidance &amp; Voice Commands
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Listen to setting descriptions, check active preferences, and customize options hands-free.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReadSettings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 active:bg-blue-900 rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-600 focus:outline-none"
            aria-label="Read settings aloud (Alt+R)"
            title="Read settings aloud (Alt+R)"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Read Settings Aloud (Alt+R)</span>
          </button>

          <button
            type="button"
            onClick={onCurrentSummary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-800 dark:text-blue-200 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:outline-none"
            aria-label="Spoken summary of active settings"
            title="Read active settings summary"
          >
            <Info className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            <span>Current Settings Summary</span>
          </button>
        </div>
      </div>

      {/* Voice commands quick tips */}
      <div className="pt-3 border-t border-blue-200 dark:border-blue-800/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40">
          <span className="font-bold text-blue-900 dark:text-blue-300 block">Say: &quot;Read settings&quot;</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Hear all {activeTab === 'screen_reader' ? 'screen reader' : 'accessibility'} options</span>
        </div>
        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40">
          <span className="font-bold text-blue-900 dark:text-blue-300 block">Say: &quot;Explain [setting]&quot;</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">e.g. &quot;Explain color theme&quot;</span>
        </div>
        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40">
          <span className="font-bold text-blue-900 dark:text-blue-300 block">Say: &quot;What settings are enabled?&quot;</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Hear list of active toggles</span>
        </div>
        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40">
          <span className="font-bold text-blue-900 dark:text-blue-300 block">Say: &quot;Stop&quot; or press Esc</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Immediately silence speech</span>
        </div>
      </div>
    </div>
  );
};
