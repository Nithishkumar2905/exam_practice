import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_REGISTRY,
  getAvailableSettings,
  buildAllSettingsSpokenSummary,
  buildCurrentSettingsStatusSummary,
  buildEnabledSettingsSummary,
  buildDisabledSettingsSummary,
  processSettingsVoiceCommand
} from '../components/accessibility/SettingsVoiceGuide.tsx';
import { matchScreenNavigation, parseSystemControl } from '../voice/commandParser.ts';
import { validateScreenRegistry } from '../types/screens.ts';
import { AccessibilityContextType, ThemeMode, FontSize } from '../context/AccessibilityContext.tsx';

// Helper to create a controllable mock of AccessibilityContextType
function createMockAccessibilityContext(): AccessibilityContextType {
  const state = {
    currentScreen: 'accessibility_settings' as const,
    user: null,
    isSidebarCollapsed: false,
    isMobileNavOpen: false,
    settings: {
      userId: 'usr_candidate_01',
      theme: 'sapphire' as const,
      fontScale: 125,
      dyslexiaFont: false,
      speechRate: 1.0,
      speechPitch: 1.0,
      voiceURI: 'default',
      autoReadAloud: false,
      highContrastBorders: true,
      reduceMotion: false,
      compensatoryTimeEnabled: true,
      whisperModelSize: 'base' as const,
      isBlindMode: false
    },
    theme: 'default' as ThemeMode,
    fontSize: 'large' as FontSize,
    dyslexiaFont: false,
    speechRate: 1.0,
    speechPitch: 1.0,
    speechVolume: 100,
    selectedVoiceURI: 'default',
    availableVoices: [
      { name: 'Google US English', lang: 'en-US', voiceURI: 'google_us', default: true } as any,
      { name: 'Google UK English', lang: 'en-GB', voiceURI: 'google_uk', default: false } as any
    ],
    compensatoryTime: true,
    whisperModel: 'base' as const,
    isBlindMode: false,
    isSpeaking: false,
    isPausedSpeaking: false,
    activeAnnouncement: null,
    announceMessage: '',
    wakeWordState: 'DISABLED' as const,
    isVoiceListening: false,
    micPermissionStatus: 'granted' as const,
    isExamActive: false,
    pendingExamExit: null
  };

  const spokenMessages: string[] = [];
  let stopSpeakingCalled = false;
  let testVoiceCalled = false;

  const mock: any = {
    ...state,
    spokenMessages,
    get stopSpeakingCalled() { return stopSpeakingCalled; },
    get testVoiceCalled() { return testVoiceCalled; },
    navigateTo: (screen: string) => { (mock as any).currentScreen = screen; },
    setCurrentScreen: (screen: string) => { (mock as any).currentScreen = screen; },
    setUser: (u: any) => { (mock as any).user = u; },
    loginUser: () => {},
    logout: () => {},
    setIsSidebarCollapsed: (c: boolean) => { (mock as any).isSidebarCollapsed = c; },
    toggleSidebar: () => { (mock as any).isSidebarCollapsed = !(mock as any).isSidebarCollapsed; },
    setIsMobileNavOpen: (o: boolean) => { (mock as any).isMobileNavOpen = o; },
    toggleMobileNav: () => { (mock as any).isMobileNavOpen = !(mock as any).isMobileNavOpen; },
    updateSettings: (s: any) => { (mock as any).settings = { ...(mock as any).settings, ...s }; },
    speakText: (t: string) => { spokenMessages.push(t); },
    speak: (t: string) => { spokenMessages.push(t); },
    stopSpeaking: () => { stopSpeakingCalled = true; },
    pauseSpeaking: () => {},
    resumeSpeaking: () => {},
    slowDownSpeech: () => {},
    announce: (m: string) => { (mock as any).announceMessage = m; },
    setTheme: (t: ThemeMode) => { (mock as any).theme = t; },
    setFontSize: (f: FontSize) => { (mock as any).fontSize = f; },
    setDyslexiaFont: (d: boolean) => { (mock as any).dyslexiaFont = d; },
    setSpeechRate: (r: number) => { (mock as any).speechRate = r; },
    updateSpeechRate: (r: number) => { (mock as any).speechRate = r; },
    updateSpeechPitch: (p: number) => { (mock as any).speechPitch = p; },
    updateSpeechVolume: (v: number) => { (mock as any).speechVolume = v; },
    updateSelectedVoice: (uri: string) => { (mock as any).selectedVoiceURI = uri; },
    testVoice: () => { testVoiceCalled = true; },
    setCompensatoryTime: (c: boolean) => { (mock as any).compensatoryTime = c; },
    setWhisperModel: (m: any) => { (mock as any).whisperModel = m; },
    setIsBlindMode: (b: boolean) => { (mock as any).isBlindMode = b; },
    toggleBlindMode: () => { (mock as any).isBlindMode = !(mock as any).isBlindMode; },
    isVisionMode: false,
    setIsVisionMode: (b: boolean) => { (mock as any).isBlindMode = b; },
    toggleVisionMode: () => { (mock as any).isBlindMode = !(mock as any).isBlindMode; },
    startVoiceListening: () => {},
    stopVoiceListening: () => {},
    registerVoiceHandler: () => () => {},
    playBeacon: () => {},
    setIsExamActive: () => {},
    confirmExamExit: () => {},
    executeVoiceCommand: async () => {},
    resetDefaults: () => {
      (mock as any).theme = 'default';
      (mock as any).fontSize = 'large';
      (mock as any).dyslexiaFont = false;
      (mock as any).speechRate = 1.0;
      (mock as any).speechPitch = 1.0;
      (mock as any).speechVolume = 100;
      (mock as any).selectedVoiceURI = 'default';
      (mock as any).compensatoryTime = true;
      (mock as any).whisperModel = 'base';
      (mock as any).isBlindMode = false;
    }
  };

  return mock as AccessibilityContextType;
}

test('1. Registry: Contains all actual implemented accessibility and screen reader settings', () => {
  assert.ok(SETTINGS_REGISTRY.length >= 10, 'Expected at least 10 settings descriptors in registry');

  const accessibilityGroup = getAvailableSettings('accessibility');
  assert.equal(accessibilityGroup.length, 4, 'Accessibility group must have exactly 4 controls (theme, font, dyslexia, compensatory)');
  assert.deepEqual(accessibilityGroup.map((s) => s.id), ['theme', 'fontSize', 'dyslexiaFont', 'compensatoryTime']);

  const screenReaderGroup = getAvailableSettings('screen_reader');
  assert.ok(screenReaderGroup.length >= 7, 'Screen reader group must have all speech and voice controls');
  const ids = screenReaderGroup.map((s) => s.id);
  assert.ok(ids.includes('speechRate'));
  assert.ok(ids.includes('speechPitch'));
  assert.ok(ids.includes('speechVolume'));
  assert.ok(ids.includes('selectedVoiceURI'));
  assert.ok(ids.includes('whisperModel'));
  assert.ok(ids.includes('isBlindMode'));
  assert.ok(ids.includes('testVoice'));
  assert.ok(ids.includes('resetDefaults'));
});

test('2. Spoken Descriptions: buildAllSettingsSpokenSummary reflects actual configuration dynamically', () => {
  const ctx = createMockAccessibilityContext();

  const accessSummary = buildAllSettingsSpokenSummary(ctx, 'accessibility');
  assert.ok(accessSummary.includes('Accessibility Settings contains four available controls'));
  assert.ok(accessSummary.includes('Color Theme'));
  assert.ok(accessSummary.includes('Text Scaling'));
  assert.ok(accessSummary.includes('OpenDyslexic Typography'));
  assert.ok(accessSummary.includes('PwD Compensatory Time'));
  assert.ok(accessSummary.includes('Institutional Sapphire'));

  const srSummary = buildAllSettingsSpokenSummary(ctx, 'screen_reader');
  assert.ok(srSummary.includes('Screen Reader Settings contains eight available controls'));
  assert.ok(srSummary.includes('Speech Rate'));
  assert.ok(srSummary.includes('Voice Pitch'));
  assert.ok(srSummary.includes('Speech Volume'));
  assert.ok(srSummary.includes('Voice Synthesizer'));
  assert.ok(srSummary.includes('Speech Recognition Model'));
});

test('3. Dynamic Values: Setting explanations update dynamically when context changes (no stale hardcoding)', () => {
  const ctx = createMockAccessibilityContext();

  // Test theme change
  ctx.setTheme('high-contrast-yellow');
  const themeDesc = SETTINGS_REGISTRY[0].getCurrentValue(ctx);
  assert.equal(themeDesc, 'High-Contrast Yellow on Dark');
  assert.ok(SETTINGS_REGISTRY[0].explain(ctx).includes('High-Contrast Yellow on Dark'));

  // Test font size change
  ctx.setFontSize('xxlarge');
  const fontDesc = SETTINGS_REGISTRY[1].getCurrentValue(ctx);
  assert.ok(fontDesc.includes('Maximum'));
  assert.ok(SETTINGS_REGISTRY[1].explain(ctx).includes('Maximum'));

  // Test dyslexia font change
  ctx.setDyslexiaFont(true);
  assert.equal(SETTINGS_REGISTRY[2].getCurrentValue(ctx), 'Enabled');
  assert.ok(SETTINGS_REGISTRY[2].explain(ctx).includes('currently enabled'));

  // Test speech rate change
  ctx.updateSpeechRate(1.5);
  assert.equal(SETTINGS_REGISTRY[4].getCurrentValue(ctx), '1.5x speed');
});

test('4. Queries: Individual settings queries return accurate explanations and values', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  // Query Color Theme
  const q1 = processSettingsVoiceCommand('what is color theme', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q1 && q1.handled);
  assert.ok(q1.spokenResponse.includes('Color Theme allows you to change'));
  assert.ok(q1.spokenResponse.includes('Institutional Sapphire'));

  // Query Text Scaling
  const q2 = processSettingsVoiceCommand('explain text scaling', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q2 && q2.handled);
  assert.ok(q2.spokenResponse.includes('Text Scaling changes the size'));

  // Query Dyslexia Font
  const q3 = processSettingsVoiceCommand('what does dyslexia font do', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q3 && q3.handled);
  assert.ok(q3.spokenResponse.includes('OpenDyslexic is an alternative font'));

  // Query Speech Rate
  const q4 = processSettingsVoiceCommand('what is speech rate', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q4 && q4.handled);
  assert.ok(q4.spokenResponse.includes('Speech Rate controls how quickly'));

  // Query Compensatory Time
  const q5 = processSettingsVoiceCommand('what is compensatory time', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q5 && q5.handled);
  assert.ok(q5.spokenResponse.includes('Compensatory Time provides additional examination time'));

  // Query current theme
  const q6 = processSettingsVoiceCommand('which theme am i using', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(q6 && q6.handled);
  assert.ok(q6.spokenResponse.includes('Your current visual theme is Institutional Sapphire'));
});

test('5. Voice Commands: Updating visual themes and font sizing through voice', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  // Switch to yellow theme
  const res1 = processSettingsVoiceCommand('yellow theme', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res1 && res1.handled);
  assert.equal(ctx.theme, 'high-contrast-yellow');
  assert.ok(res1.spokenResponse.includes('High-Contrast Yellow on Dark has been enabled'));

  // Switch to monochrome theme
  const res2 = processSettingsVoiceCommand('monochrome theme', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res2 && res2.handled);
  assert.equal(ctx.theme, 'monochrome');

  // Increase font
  const res3 = processSettingsVoiceCommand('increase font', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res3 && res3.handled);
  assert.equal(ctx.fontSize, 'xlarge');
  assert.ok(res3.spokenResponse.includes('increased to xlarge'));

  // Normal font
  const res4 = processSettingsVoiceCommand('normal font', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res4 && res4.handled);
  assert.equal(ctx.fontSize, 'normal');

  // Maximum font
  const res5 = processSettingsVoiceCommand('maximum font', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res5 && res5.handled);
  assert.equal(ctx.fontSize, 'xxlarge');
});

test('6. Voice Commands: OpenDyslexic, Compensatory Time, Speech Rate, and Pitch changes', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  // Enable dyslexia font
  const r1 = processSettingsVoiceCommand('enable dyslexia font', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r1 && r1.handled);
  assert.equal(ctx.dyslexiaFont, true);

  // Disable dyslexia font
  const r2 = processSettingsVoiceCommand('disable dyslexia font', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r2 && r2.handled);
  assert.equal(ctx.dyslexiaFont, false);

  // Toggle compensatory time
  const r3 = processSettingsVoiceCommand('disable compensatory time', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r3 && r3.handled);
  assert.equal(ctx.compensatoryTime, false);

  // Speech rate
  const r4 = processSettingsVoiceCommand('speech rate one point five', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r4 && r4.handled);
  assert.equal(ctx.speechRate, 1.5);

  // Voice pitch
  const r5 = processSettingsVoiceCommand('higher pitch', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r5 && r5.handled);
  assert.ok(ctx.speechPitch > 1.0);

  // Speech volume
  const r6 = processSettingsVoiceCommand('maximum volume', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(r6 && r6.handled);
  assert.equal(ctx.speechVolume, 100);
});

test('7. Reset Defaults: Demands confirmation before resetting and restores standard defaults upon confirmation', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  // Modify some settings first
  ctx.setTheme('high-contrast-yellow');
  ctx.setFontSize('xxlarge');
  ctx.setDyslexiaFont(true);
  ctx.updateSpeechRate(1.75);

  // Candidate says "reset defaults"
  const req = processSettingsVoiceCommand('reset defaults', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(req && req.handled);
  assert.equal(resetConfirming, true, 'Must engage confirmation state');
  assert.ok(req.spokenResponse.includes('Are you sure you want to reset all accessibility preferences'));

  // Candidate confirms with "yes"
  const conf = processSettingsVoiceCommand('yes', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(conf && conf.handled);
  assert.equal(resetConfirming, false, 'Must release confirmation state');
  assert.equal(ctx.theme, 'default');
  assert.equal(ctx.fontSize, 'large');
  assert.equal(ctx.dyslexiaFont, false);
  assert.equal(ctx.speechRate, 1.0);
  assert.ok(conf.spokenResponse.includes('have been reset to default values'));
});

test('8. Navigation & Tab Switching: "Open screen reader settings" and "Open accessibility settings"', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  const nav1 = processSettingsVoiceCommand('open screen reader settings', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(nav1 && nav1.handled);
  assert.equal(activeTab, 'screen_reader');
  assert.ok(nav1.spokenResponse.includes('Switched to Screen Reader Settings'));

  const nav2 = processSettingsVoiceCommand('open accessibility settings', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(nav2 && nav2.handled);
  assert.equal(activeTab, 'accessibility');
  assert.ok(nav2.spokenResponse.includes('Switched to Accessibility Settings'));
});

test('9. Stepping: "Next setting" and "Previous setting" advance sequentially', () => {
  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  const step1 = processSettingsVoiceCommand('next setting', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(step1 && step1.handled);
  assert.equal(focusedIdx, 1);
  assert.ok(step1.spokenResponse.includes('Text Scaling'));

  const step2 = processSettingsVoiceCommand('previous setting', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(step2 && step2.handled);
  assert.equal(focusedIdx, 0);
  assert.ok(step2.spokenResponse.includes('Color Theme'));
});

test('10. Global Stop & Silence commands work properly', () => {
  const p1 = parseSystemControl('stop');
  assert.equal(p1, 'stop_speaking');

  const p2 = parseSystemControl('silence');
  assert.equal(p2, 'stop_speaking');

  const p3 = parseSystemControl('stop speaking');
  assert.equal(p3, 'stop_speaking');

  const ctx = createMockAccessibilityContext();
  let activeTab: 'accessibility' | 'screen_reader' = 'accessibility';
  const setActiveTab = (t: any) => { activeTab = t; };
  let resetConfirming = false;
  const setResetConfirming = (c: boolean) => { resetConfirming = c; };
  let focusedIdx = 0;
  const setFocusedIdx = (idx: number) => { focusedIdx = idx; };

  const res = processSettingsVoiceCommand('stop', ctx, activeTab, setActiveTab, resetConfirming, setResetConfirming, focusedIdx, setFocusedIdx);
  assert.ok(res && res.handled);
  assert.equal((ctx as any).stopSpeakingCalled, true);
});

test('11. Screen navigation aliases: "screen reader settings" routes to accessibility_settings', () => {
  const match1 = matchScreenNavigation('screen reader settings');
  assert.ok(match1, 'Expected match for "screen reader settings"');
  assert.equal(match1!.target.screenId, 'accessibility_settings');

  const match2 = matchScreenNavigation('open screen reader settings');
  assert.ok(match2, 'Expected match for "open screen reader settings"');
  assert.equal(match2!.target.screenId, 'accessibility_settings');

  const match3 = matchScreenNavigation('accessibility settings');
  assert.ok(match3);
  assert.equal(match3!.target.screenId, 'accessibility_settings');
});

test('12. Invariance: Exactly 17 approved screens remain strictly enforced', () => {
  const res = validateScreenRegistry();
  assert.equal(res.isValid, true);
  assert.equal(res.totalScreens, 17);
});

