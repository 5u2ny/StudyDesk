// ── Focus OS — shared data types ────────────────────────────────────────────
// Used by both the main process (via tsconfig.main.json) and the renderer
// (via @schema alias in vite.config.ts).

export interface Capture {
  id: string;
  text: string;
  source: 'highlight' | 'manual' | 'shortcut';
  sourceApp?: string;
  sourceUrl?: string;
  category?: string;
  courseId?: string;
  labels?: Array<'highlight' | 'key_concept' | 'definition' | 'confusing' | 'exam_likely' | 'flashcard' | 'question'>;
  imagePath?: string;
  createdAt: number;
  pinned: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;          // TipTap JSON serialized
  category?: string;
  courseId?: string;
  documentType?: 'note' | 'syllabus' | 'assignment_prompt' | 'reading' | 'class_notes' | 'daily_entry';
  linkedAssignmentId?: string;
  // Date key for daily entries (e.g. "2026-05-03"). Set only when documentType === 'daily_entry'.
  // Combined with courseId, this gives at most one daily entry per (course, day).
  dayKey?: string;
  // Hierarchical subpages (port from suitenumerique/docs). When set, this
  // note is a child of the given parent note id. Forms a tree orthogonal
  // to the folder/course taxonomy (a course can contain notes, and any
  // note can have child sub-notes regardless of course).
  parentId?: string;
  // Inline self-review comments (port from suitenumerique/docs). The
  // editor wraps the commented passage with an inlineComment mark whose
  // commentId attribute points at one of these entries.
  comments?: Array<{
    id: string;
    text: string;
    quote: string;        // verbatim snippet the comment is anchored to
    createdAt: number;
  }>;
  // Talk / sidecar pane (MediaWiki port): a paired scratch space for
  // questions, meta-thoughts, and TODOs about the note. Stored as plain
  // text (no rich formatting) — the goal is friction-free quick capture
  // alongside the canonical body.
  scratch?: string;
  tags?: string[];
  capturedFromIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  category?: string;
  dueDate?: number;
  isActive: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  description?: string;
  category?: string;
}

export interface EmailDigestItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: number;
  importance: 'high' | 'medium' | 'low';
  summary?: string;
  read: boolean;
  archived: boolean;
}

export interface MaterialsImportRecord {
  path: string;        // absolute file path
  mtime: number;       // file modification time (used for dedup)
  size: number;        // file size in bytes
  importedAt: number;  // when StudyDesk imported it
  noteId?: string;     // resulting note (undefined if extraction failed)
  error?: string;      // last error message if import failed
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  professorName?: string;
  professorEmail?: string;
  officeHours?: string;
  location?: string;
  term?: string;
  color?: string;
  // Local "Course Materials" folder watched for auto-import.
  // When set, StudyDesk monitors the folder and imports new PDF/TXT/MD files
  // as Notes (documentType: 'reading') linked to this course.
  materialsFolderPath?: string;
  materialsImportedFiles?: MaterialsImportRecord[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  source?: 'default' | 'parser' | 'rubric' | 'manual';
  createdAt: number;
  completedAt?: number;
}

export interface Assignment {
  id: string;
  courseId?: string;
  title: string;
  description?: string;
  dueDate?: number;
  sourceType?: 'manual' | 'syllabus' | 'assignment_prompt' | 'email' | 'capture';
  sourceId?: string;
  deliverables: ChecklistItem[];
  formatRequirements: ChecklistItem[];
  rubricItems: ChecklistItem[];
  submissionChecklist: ChecklistItem[];
  status: 'not_started' | 'in_progress' | 'needs_review' | 'submitted' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedWorkMinutes?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface AcademicDeadline {
  id: string;
  courseId?: string;
  assignmentId?: string;
  title: string;
  deadlineAt: number;
  type:
    | 'assignment'
    | 'exam'
    | 'quiz'
    | 'reading'
    | 'project'
    | 'presentation'
    | 'office_hours'
    | 'meeting'
    | 'email_action'
    | 'other';
  sourceType?: 'manual' | 'syllabus' | 'assignment_prompt' | 'email' | 'capture';
  sourceId?: string;
  confidence?: number;
  confirmed: boolean;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClassSession {
  id: string;
  courseId?: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  notes: string[];
  captureIds: string[];
  professorHints: string[];
  examHints: string[];
  assignmentHints: string[];
  questions: string[];
  actionItems: string[];
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudyItem {
  id: string;
  courseId?: string;
  sourceCaptureId?: string;
  // For note-derived flashcards (StudyMD-style heading extraction):
  // sourceNoteId points at the note, sourceCardKey is a stable hash of
  // (front-text + position) so re-extraction preserves SM-2 review state.
  sourceNoteId?: string;
  sourceCardKey?: string;
  type: 'flashcard' | 'concept' | 'definition' | 'question' | 'confusion' | 'exam_hint';
  front: string;
  back?: string;
  explanation?: string;
  difficulty?: 'again' | 'hard' | 'good' | 'easy';
  nextReviewAt?: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
  // T7 (REDESIGN_PLAN_V2): FSRS algorithm state. Optional + nullable
  // so existing items keep working — first review under FSRS bootstraps
  // these fields. The scheduler reads/writes them via ts-fsrs's Card
  // shape, but we persist them flat on StudyItem for the focus-os
  // store's plain-JSON contract.
  fsrsStability?: number       // days expected above retrievability threshold
  fsrsDifficulty?: number      // 1..10 — FSRS's per-card difficulty
  fsrsLapses?: number          // count of times marked Again under FSRS
  fsrsState?: 'new' | 'learning' | 'review' | 'relearning'
  /** Last reviewed timestamp; used by both panic-mode ranking and the
   *  FSRS scheduler. Distinct from updatedAt (which moves on any edit). */
  lastReviewedAt?: number
}

export interface ConfusionItem {
  id: string;
  courseId?: string;
  sourceCaptureId?: string;
  question: string;
  context?: string;
  status: 'unresolved' | 'ask_professor' | 'ask_classmate' | 'review_textbook' | 'resolved';
  nextStep?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface CriticalEmailAlert {
  id: string;
  emailId: string;
  from: string;
  subject: string;
  receivedAt: number;
  alertLevel: 'critical' | 'important' | 'normal' | 'ignore';
  category:
    | 'immediate_action'
    | 'deadline'
    | 'financial_risk'
    | 'academic'
    | 'job'
    | 'security'
    | 'direct_human'
    | 'informational'
    | 'promotional';
  reason: string;
  nextAction?: string;
  deadlineDetected?: number;
  confidence: number;
  status: 'new' | 'alerted' | 'snoozed' | 'converted_to_task' | 'dismissed' | 'resolved';
  snoozedUntil?: number;
  alertedAt?: number;
  createdTaskId?: string;
}

export interface AttentionAlert {
  id: string;
  sourceType: 'deadline' | 'confusion' | 'study_review' | 'class_action' | 'assignment_checklist' | 'setup';
  sourceId?: string;
  courseId?: string;
  title: string;
  reason: string;
  actionLabel: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'snoozed' | 'dismissed' | 'resolved';
  dueAt?: number;
  snoozedUntil?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface Settings {
  hasCompletedOnboarding: boolean;
  hasGrantedAccessibility: boolean;
  captureShortcut: string;
  captureSilent: boolean;
  llmProvider?: 'anthropic' | 'openai';
  llmApiKeyEncrypted?: string;
  llmModel?: string;
  ollamaEndpoint?: string;    // default http://localhost:11434
  ollamaModel?: string;       // default gemma4:latest
  gmailEnabled: boolean;
  gmailEmail?: string;
  gmailAppPasswordEncrypted?: string;     // legacy: App Password path
  // OAuth2 path — works for Workspace accounts where App Passwords are blocked
  gmailOauthClientId?: string;
  gmailOauthClientSecretEncrypted?: string;
  gmailOauthRefreshTokenEncrypted?: string;
  gmailOauthAccessTokenEncrypted?: string;
  gmailOauthAccessTokenExpiresAt?: number; // ms epoch
  gmailFetchIntervalMin: number;
  gmailMaxResultsPerFetch: number;
  pillPosition: { x: number; y: number };
  pillEdge: 'top' | 'left' | 'right' | 'bottom';
  sidebarWidth: number;
  llmTelemetryConsent: boolean;
  aiMode: 'disabled' | 'openai' | 'anthropic' | 'local_server';
  experimentalFeatures: {
    aiTriage: boolean;
    activityClassifier: boolean;
    strictMode: boolean;
  };
  criticalEmailRules: {
    alwaysAlertSenders: string[];
    neverAlertSenders: string[];
    alertOnlyDirectEmails: boolean;
    alertCriticalOnlyDuringFocus: boolean;
    showDigestAfterFocus: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  hasCompletedOnboarding: false,
  hasGrantedAccessibility: false,
  captureShortcut: 'CommandOrControl+Shift+C',
  captureSilent: false,
  gmailEnabled: false,
  gmailFetchIntervalMin: 15,
  gmailMaxResultsPerFetch: 20,
  pillPosition: { x: 100, y: 40 },
  pillEdge: 'top',
  sidebarWidth: 320,
  llmTelemetryConsent: false,
  aiMode: 'disabled',
  experimentalFeatures: {
    aiTriage: false,
    activityClassifier: false,
    strictMode: false,
  },
  criticalEmailRules: {
    alwaysAlertSenders: [],
    neverAlertSenders: [],
    alertOnlyDirectEmails: false,
    alertCriticalOnlyDuringFocus: true,
    showDigestAfterFocus: true,
  },
};

export const STORE_SCHEMA = {
  captures:       { type: 'array',  default: [] },
  notes:          { type: 'array',  default: [] },
  todos:          { type: 'array',  default: [] },
  calendarEvents: { type: 'array',  default: [] },
  emails:         { type: 'array',  default: [] },
  categories:     { type: 'array',  default: [] },
  courses:        { type: 'array',  default: [] },
  assignments:    { type: 'array',  default: [] },
  academicDeadlines: { type: 'array', default: [] },
  classSessions:  { type: 'array',  default: [] },
  studyItems:     { type: 'array',  default: [] },
  confusionItems: { type: 'array',  default: [] },
  criticalEmailAlerts: { type: 'array', default: [] },
  attentionAlerts: { type: 'array', default: [] },
  settings: {
    type: 'object',
    default: DEFAULT_SETTINGS,
  },
} as const;

export interface StoreData {
  captures:       Capture[];
  notes:          Note[];
  todos:          Todo[];
  calendarEvents: CalendarEvent[];
  emails:         EmailDigestItem[];
  categories:     UserCategory[];
  courses:        Course[];
  assignments:    Assignment[];
  academicDeadlines: AcademicDeadline[];
  classSessions:  ClassSession[];
  studyItems:     StudyItem[];
  confusionItems: ConfusionItem[];
  criticalEmailAlerts: CriticalEmailAlert[];
  attentionAlerts: AttentionAlert[];
  settings:       Settings;
}
