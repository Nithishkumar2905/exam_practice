/**
 * ACCESSPREP-X — Global Voice Navigation Controller
 *
 * Priority chain (highest → lowest):
 *   1. Confirmation (Yes / No for active-exam exit prompt)
 *   2. System controls (stop speaking, repeat last speech)
 *   3. Screen-specific active voice handler  (registered by MockExam / VoicePractice / etc.)
 *   4. Active-exam safety guard  (intercepts any navigation away from live exam)
 *   5. Global assistance intents  (where am I / help / what can I do)
 *   6. Global navigation routing  (match transcript → screen)
 *   7. Logout intent
 *   8. Unrecognized fallback
 *
 * The controller is a plain class — no React hooks — so it is testable in Node.
 */

import { ScreenId, APPROVED_SCREENS, SCREEN_REGISTRY } from '../types/screens.ts';
import { User } from '../db/database.ts';
import {
  cleanVoiceTranscript,
  normalizePhonetics,
  parseConfirmationIntent,
  parseSystemControl,
  parseAssistanceIntent,
  matchScreenNavigation,
  MatchedScreenResult
} from './commandParser.ts';
import { SCREEN_TARGETS } from './commandRegistry.ts';
import { NavigationCommandResult, NavigationContext } from './commandTypes.ts';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function buildSpokenScreenInfo(screenId: ScreenId): string {
  const meta = SCREEN_REGISTRY[screenId];
  const target = SCREEN_TARGETS[screenId];
  if (!meta || !target) return `Screen ${screenId.replace(/_/g, ' ')}`;
  return `${target.spokenName}. ${target.actionSummary}`;
}

function buildHelpNavigation(user: User | null): string {
  const isAdmin = user?.role === 'admin';
  const candidateScreens = [
    'Dashboard', 'Explore Subjects', 'Voice Practice', 'Mock Examination',
    'AI Tutor', 'Revision Planner', 'Progress Analytics', 'Topic Mastery',
    'Learning History', 'Accessibility Settings'
  ];
  const adminExtra = isAdmin ? ', Model Evaluation, Dataset and Training' : '';
  return (
    `You can navigate to any of these screens: ${candidateScreens.join(', ')}${adminExtra}. ` +
    `Say the screen name clearly. For example: "Go to AI Tutor", "Open Mock Examination", ` +
    `"Show my progress", or simply "Dashboard".`
  );
}

// ---------------------------------------------------------------------------
// Controller class
// ---------------------------------------------------------------------------

export class NavigationController {
  private context: NavigationContext;
  private navigateFn: (screen: ScreenId) => void;
  private speakFn: (text: string, onEnd?: () => void) => void;
  private stopSpeakFn: () => void;
  private pauseSpeakFn?: () => void;
  private resumeSpeakFn?: () => void;
  private slowDownFn?: () => void;
  private logoutFn: () => void;
  private lastSpokenText: string = '';

  constructor(opts: {
    context: NavigationContext;
    navigate: (screen: ScreenId) => void;
    speak: (text: string, onEnd?: () => void) => void;
    stopSpeak: () => void;
    pauseSpeak?: () => void;
    resumeSpeak?: () => void;
    slowDown?: () => void;
    logout: () => void;
  }) {
    this.context = opts.context;
    this.navigateFn = opts.navigate;
    this.speakFn = opts.speak;
    this.stopSpeakFn = opts.stopSpeak;
    this.pauseSpeakFn = opts.pauseSpeak;
    this.resumeSpeakFn = opts.resumeSpeak;
    this.slowDownFn = opts.slowDown;
    this.logoutFn = opts.logout;
  }

  /** Update context (called on each React render cycle from AccessibilityContext) */
  updateContext(ctx: Partial<NavigationContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  /** Store last-spoken text so "Repeat" can replay it */
  recordSpokenText(text: string): void {
    this.lastSpokenText = text;
  }

  /**
   * Main entry point: process a voice transcript through the full priority chain.
   * Returns a NavigationCommandResult — the caller decides how to present it.
   */
  async processTranscript(
    rawTranscript: string,
    activeVoiceHandler?: ((t: string) => boolean | Promise<boolean>) | null
  ): Promise<NavigationCommandResult> {
    const clean = cleanVoiceTranscript(rawTranscript);
    const normalized = normalizePhonetics(clean);

    const base: Omit<NavigationCommandResult, 'status' | 'spokenResponse'> = {
      originalTranscript: rawTranscript,
      cleanTranscript: clean
    };

    // ───────────────────────────────────────────
    // PRIORITY 1: Confirmation (exam exit Y/N)
    // ───────────────────────────────────────────
    if (this.context.pendingExamExit) {
      const confirmation = parseConfirmationIntent(clean);

      if (confirmation === 'yes') {
        const dest = this.context.pendingExamExit.destination;
        const title = this.context.pendingExamExit.title;
        this.context.pendingExamExit = null;
        this.context.isExamActive = false;

        // Persist current exam state before leaving
        // (MockExamScreen already persists to sessionStorage continuously)
        const response = `Pausing examination. Navigating to ${title}.`;
        this.navigateFn(dest);
        return { ...base, status: 'success', destination: dest, destinationTitle: title, spokenResponse: response };
      }

      if (confirmation === 'no') {
        this.context.pendingExamExit = null;
        const response = `Staying in the examination. Good luck! The timer is still running.`;
        return { ...base, status: 'local_handled', spokenResponse: response };
      }

      // Ambiguous — remind user of the pending confirmation
      const pending = this.context.pendingExamExit;
      const reminder =
        `An examination is in progress. I am still waiting for your answer. ` +
        `Say Yes to pause and go to ${pending.title}, or say No to stay and continue the exam.`;
      return { ...base, status: 'ambiguous', spokenResponse: reminder };
    }

    // ───────────────────────────────────────────
    // PRIORITY 2: Screen-specific voice handler FIRST
    // Allows question screens to intercept "repeat question", "repeat options", etc.
    // ───────────────────────────────────────────
    if (activeVoiceHandler) {
      try {
        const handled = await activeVoiceHandler(rawTranscript);
        if (handled) {
          return { ...base, status: 'local_handled', spokenResponse: '' };
        }
      } catch (err) {
        console.warn('[NavigationController] Screen handler error:', err);
      }
    }

    // ───────────────────────────────────────────
    // PRIORITY 3: System controls (pause, resume, slower, stop, generic repeat)
    // ───────────────────────────────────────────
    const systemIntent = parseSystemControl(clean);

    if (systemIntent === 'stop_speaking') {
      this.stopSpeakFn();
      return { ...base, status: 'system_handled', spokenResponse: '' };
    }

    if (systemIntent === 'pause_reading') {
      if (this.pauseSpeakFn) {
        this.pauseSpeakFn();
      }
      return { ...base, status: 'system_handled', spokenResponse: '' };
    }

    if (systemIntent === 'resume_reading') {
      if (this.resumeSpeakFn) {
        this.resumeSpeakFn();
      }
      return { ...base, status: 'system_handled', spokenResponse: '' };
    }

    if (systemIntent === 'read_slower') {
      if (this.slowDownFn) {
        this.slowDownFn();
      }
      return { ...base, status: 'system_handled', spokenResponse: '' };
    }

    if (systemIntent === 'repeat') {
      const textToRepeat = this.lastSpokenText || 'Nothing has been spoken yet.';
      return { ...base, status: 'system_handled', spokenResponse: textToRepeat };
    }

    // ───────────────────────────────────────────
    // PRIORITY 4: Active exam safety guard
    // ───────────────────────────────────────────
    const isNavigationAttempt = matchScreenNavigation(rawTranscript, this.context.currentScreen);
    const assistanceIntent = parseAssistanceIntent(clean);
    const isLogout = clean === 'log out' || clean === 'logout' || clean === 'sign out' || clean === 'sign off' || clean === 'exit portal' || clean === 'quit';

    if (
      this.context.isExamActive &&
      this.context.currentScreen === 'mock_exam' &&
      (isNavigationAttempt || (isLogout && this.context.isExamActive))
    ) {
      const destinationTitle = isNavigationAttempt
        ? isNavigationAttempt.target.spokenName
        : 'the logout page';
      const destination: ScreenId = isNavigationAttempt
        ? isNavigationAttempt.target.screenId
        : 'login';

      this.context.pendingExamExit = { destination, title: destinationTitle };

      const response =
        `An examination is in progress. ` +
        `Do you want to pause the exam and go to ${destinationTitle}? ` +
        `Your answers and timer will be saved. Say Yes to leave, or No to continue the exam.`;

      return {
        ...base,
        status: 'blocked_by_active_exam',
        destination,
        destinationTitle,
        spokenResponse: response,
        needsConfirmation: true
      };
    }

    // ───────────────────────────────────────────
    // PRIORITY 5: Global assistance intents
    // ───────────────────────────────────────────
    if (assistanceIntent) {
      return this._handleAssistance(assistanceIntent, base);
    }

    // ───────────────────────────────────────────
    // PRIORITY 6: Global navigation routing
    // ───────────────────────────────────────────
    if (isNavigationAttempt) {
      return this._handleNavigation(isNavigationAttempt, base);
    }

    // ───────────────────────────────────────────
    // PRIORITY 7: Logout intent (outside exam)
    // ───────────────────────────────────────────
    if (isLogout) {
      this.logoutFn();
      return {
        ...base,
        status: 'system_handled',
        spokenResponse: 'Logging out of the candidate portal. Goodbye.'
      };
    }

    // ───────────────────────────────────────────
    // PRIORITY 8: Unrecognized fallback
    // ───────────────────────────────────────────
    return {
      ...base,
      status: 'unrecognized',
      spokenResponse:
        `Sorry, I did not understand "${rawTranscript}". ` +
        `Try saying "Go to Dashboard", "Open Mock Examination", "AI Tutor", ` +
        `"My Progress", or "Help me navigate".`
    };
  }

  // ---------------------------------------------------------------------------
  // Private handlers
  // ---------------------------------------------------------------------------

  private _handleAssistance(
    intent: 'where_am_i' | 'what_can_i_do' | 'help_navigation' | 'go_back' | 'logout',
    base: Omit<NavigationCommandResult, 'status' | 'spokenResponse'>
  ): NavigationCommandResult {
    const { currentScreen, user, historyStack } = this.context;

    switch (intent) {
      case 'where_am_i': {
        const info = buildSpokenScreenInfo(currentScreen);
        return { ...base, status: 'assistance_provided', spokenResponse: `You are on the ${info}` };
      }

      case 'what_can_i_do': {
        const target = SCREEN_TARGETS[currentScreen];
        const summary = target?.actionSummary || 'You can explore the ACCESSPREP-X portal.';
        return {
          ...base,
          status: 'assistance_provided',
          spokenResponse: `On this screen: ${summary} You can also say "Help me navigate" to hear all available screens.`
        };
      }

      case 'help_navigation': {
        return {
          ...base,
          status: 'assistance_provided',
          spokenResponse: buildHelpNavigation(user)
        };
      }

      case 'go_back': {
        if (historyStack.length >= 2) {
          const previous = historyStack[historyStack.length - 2];
          const title = SCREEN_TARGETS[previous]?.spokenName || previous;
          this.navigateFn(previous);
          return {
            ...base,
            status: 'success',
            destination: previous,
            destinationTitle: title,
            spokenResponse: `Going back to ${title}.`
          };
        }
        // No history — fall back to dashboard
        const dashTitle = SCREEN_TARGETS['dashboard'].spokenName;
        this.navigateFn('dashboard');
        return {
          ...base,
          status: 'success',
          destination: 'dashboard',
          destinationTitle: dashTitle,
          spokenResponse: `Taking you back to the ${dashTitle}.`
        };
      }

      case 'logout': {
        this.logoutFn();
        return {
          ...base,
          status: 'system_handled',
          spokenResponse: 'Logging out of the candidate portal. Goodbye.'
        };
      }
    }
  }

  private _handleNavigation(
    matched: MatchedScreenResult,
    base: Omit<NavigationCommandResult, 'status' | 'spokenResponse'>
  ): NavigationCommandResult {
    const { target, subjectFilter, subjectLabel } = matched;
    const { user } = this.context;

    // Role restriction: candidates cannot access admin-only screens
    if (target.isAdminOnly && user?.role !== 'admin') {
      return {
        ...base,
        status: 'forbidden_role',
        spokenResponse: `Sorry, ${target.spokenName} is restricted to administrators. As a candidate, you do not have access to that section.`
      };
    }

    // Authentication gate
    if (target.requiresAuth && !user) {
      this.navigateFn('login');
      return {
        ...base,
        status: 'unauthenticated',
        destination: 'login',
        spokenResponse: `You need to be signed in to access ${target.spokenName}. Taking you to the login screen.`
      };
    }

    // Set subject filter in sessionStorage if this is a targeted practice command
    if (target.screenId === 'voice_practice' && subjectFilter) {
      try {
        sessionStorage.setItem('practice_filter_subject', subjectFilter);
      } catch {}
    }

    this.navigateFn(target.screenId);

    const spokenResponse = subjectLabel
      ? `Opening ${subjectLabel} practice session.`
      : `Opening ${target.spokenName}.`;

    return {
      ...base,
      status: 'success',
      destination: target.screenId,
      destinationTitle: target.spokenName,
      spokenResponse
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helper export — no React, works in Node tests
// ---------------------------------------------------------------------------

/**
 * Check whether a user is blocked from a given screen.
 * Returns a human-readable reason string, or null if permitted.
 */
export function getScreenBlockReason(
  screenId: ScreenId,
  user: User | null
): string | null {
  const target = SCREEN_TARGETS[screenId];
  if (!target) return `Screen "${screenId}" is not in the registry.`;

  if (target.isAdminOnly && user?.role !== 'admin') {
    return `Admin only: ${target.spokenName}`;
  }

  if (target.requiresAuth && !user) {
    return `Login required: ${target.spokenName}`;
  }

  return null;
}

