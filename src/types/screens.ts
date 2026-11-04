/**
 * ACCESSPREP-X Screen Registry
 * Enforces strict compliance with the 16 approved unique application screens.
 * No additional screens may be added.
 */

export const APPROVED_SCREENS = [
  'welcome',                // 1. Welcome / accessibility onboarding
  'login',                  // 2. Login
  'register',               // 3. Registration
  'dashboard',              // 4. Student dashboard
  'topics',                 // 5. Subject / topic explorer
  'voice_practice',         // 6. Voice-first practice
  'mock_exam',              // 7. Mock examination
  'results',                // 8. Results / explanations
  'ai_tutor',               // 9. AI tutor
  'revision_planner',       // 10. Revision planner
  'progress',               // 11. Progress dashboard
  'topic_mastery',          // 12. Topic mastery
  'accessibility_settings', // 13. Accessibility settings
  'learning_history',       // 14. Learning history
  'model_evaluation',       // 15. Dataset / model evaluation dashboard
  'model_training'          // 16. Dataset management / model training
] as const;

export type ScreenId = (typeof APPROVED_SCREENS)[number];

export interface ScreenMetadata {
  id: ScreenId;
  screenNumber: number;
  title: string;
  shortLabel: string;
  description: string;
  requiresAuth: boolean;
  isAdminOnly?: boolean;
}

export const SCREEN_REGISTRY: Record<ScreenId, ScreenMetadata> = {
  welcome: {
    id: 'welcome',
    screenNumber: 1,
    title: 'Welcome & Accessibility Onboarding',
    shortLabel: 'Welcome',
    description: 'Initial accessibility configuration, high contrast setup, voice assistance preview, and shortcut guide.',
    requiresAuth: false
  },
  login: {
    id: 'login',
    screenNumber: 2,
    title: 'Candidate Login',
    shortLabel: 'Login',
    description: 'Secure candidate authentication with Roll Number / Registration ID and accessibility assistance.',
    requiresAuth: false
  },
  register: {
    id: 'register',
    screenNumber: 3,
    title: 'Candidate Registration',
    shortLabel: 'Register',
    description: 'New candidate registration, PwD disability details, scribe requirements, and exam region setup.',
    requiresAuth: false
  },
  dashboard: {
    id: 'dashboard',
    screenNumber: 4,
    title: 'Candidate Assessment Dashboard',
    shortLabel: 'Dashboard',
    description: 'Central portal overview with readiness metrics, quick test launch, and syllabus mastery summary.',
    requiresAuth: true
  },
  topics: {
    id: 'topics',
    screenNumber: 5,
    title: 'Subject & Topic Explorer',
    shortLabel: 'Subjects',
    description: 'Detailed curriculum breakdown of all 4 SSC MTS sections with verified question distribution.',
    requiresAuth: true
  },
  voice_practice: {
    id: 'voice_practice',
    screenNumber: 6,
    title: 'Voice-First Practice Session',
    shortLabel: 'Voice Practice',
    description: 'Dedicated voice question solving with OpenAI Whisper transcription, review confirmation, and TTS playback.',
    requiresAuth: true
  },
  mock_exam: {
    id: 'mock_exam',
    screenNumber: 7,
    title: 'Accessible Mock Examination',
    shortLabel: 'Mock Exam',
    description: 'Timed full SSC MTS simulation adhering to Session-I and Session-II rules and compensatory time allowances.',
    requiresAuth: true
  },
  results: {
    id: 'results',
    screenNumber: 8,
    title: 'Results & Answer Explanations',
    shortLabel: 'Results',
    description: 'In-depth performance analysis, sectional scoring, accuracy, and question-by-question academic explanations.',
    requiresAuth: true
  },
  ai_tutor: {
    id: 'ai_tutor',
    screenNumber: 9,
    title: 'AI Syllabus Tutor',
    shortLabel: 'AI Tutor',
    description: 'Retrieval-grounded syllabus tutoring, voice queries, concept clarification, and citation tracking.',
    requiresAuth: true
  },
  revision_planner: {
    id: 'revision_planner',
    screenNumber: 10,
    title: 'Spaced Repetition Revision Planner',
    shortLabel: 'Revision',
    description: 'SM-2 algorithmic memory tracking, daily revision queue, and personalized study schedules.',
    requiresAuth: true
  },
  progress: {
    id: 'progress',
    screenNumber: 11,
    title: 'Progress & Performance Dashboard',
    shortLabel: 'Progress',
    description: 'Longitudinal score trends, speed vs accuracy analytics, and Session-I vs Session-II comparative charts.',
    requiresAuth: true
  },
  topic_mastery: {
    id: 'topic_mastery',
    screenNumber: 12,
    title: 'Knowledge Topic Mastery',
    shortLabel: 'Topic Mastery',
    description: 'Bayesian Knowledge Tracing (BKT) skill proficiencies per syllabus topic with diagnostic drills.',
    requiresAuth: true
  },
  accessibility_settings: {
    id: 'accessibility_settings',
    screenNumber: 13,
    title: 'Voice & Accessibility Settings',
    shortLabel: 'Accessibility',
    description: 'Custom contrast palettes, typography scaling, OpenDyslexic font, TTS speed, and Whisper configurations.',
    requiresAuth: false
  },
  learning_history: {
    id: 'learning_history',
    screenNumber: 14,
    title: 'Candidate Learning History',
    shortLabel: 'History',
    description: 'Auditable archive of past practice sessions, mock exams, answered questions, and voice transcripts.',
    requiresAuth: true
  },
  model_evaluation: {
    id: 'model_evaluation',
    screenNumber: 15,
    title: 'Dataset & Model Evaluation Dashboard',
    shortLabel: 'ML Evaluation',
    description: 'Academic evaluator console displaying live dataset statistics, confusion matrix, metrics, and real inference sandbox.',
    requiresAuth: true,
    isAdminOnly: true
  },
  model_training: {
    id: 'model_training',
    screenNumber: 16,
    title: 'Dataset Management & Model Training',
    shortLabel: 'Dataset & Training',
    description: 'Dataset repository, schema validation pipeline, reproducible scikit-learn training triggers, and artifact management.',
    requiresAuth: true,
    isAdminOnly: true
  }
};

/**
 * Validates that the application contains exactly the 16 approved screens.
 */
export function validateScreenRegistry(): {
  isValid: boolean;
  totalScreens: number;
  approvedCount: 16;
  screens: readonly ScreenId[];
  error?: string;
} {
  const registeredCount = Object.keys(SCREEN_REGISTRY).length;
  const approvedCount = APPROVED_SCREENS.length;

  if (approvedCount !== 16) {
    return {
      isValid: false,
      totalScreens: approvedCount,
      approvedCount: 16,
      screens: APPROVED_SCREENS,
      error: `Approved screens list has ${approvedCount} screens, expected exactly 16.`
    };
  }

  if (registeredCount !== 16) {
    return {
      isValid: false,
      totalScreens: registeredCount,
      approvedCount: 16,
      screens: APPROVED_SCREENS,
      error: `Screen registry contains ${registeredCount} screens, expected exactly 16.`
    };
  }

  for (const screenId of APPROVED_SCREENS) {
    if (!SCREEN_REGISTRY[screenId]) {
      return {
        isValid: false,
        totalScreens: registeredCount,
        approvedCount: 16,
        screens: APPROVED_SCREENS,
        error: `Screen "${screenId}" is declared in APPROVED_SCREENS but missing from SCREEN_REGISTRY.`
      };
    }
  }

  return {
    isValid: true,
    totalScreens: 16,
    approvedCount: 16,
    screens: APPROVED_SCREENS
  };
}
