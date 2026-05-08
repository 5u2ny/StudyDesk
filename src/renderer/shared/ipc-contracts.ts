import type {
  AcademicDeadline,
  Assignment,
  AttentionAlert,
  Capture,
  ClassSession,
  ConfusionItem,
  Course,
  CriticalEmailAlert,
  EmailDigestItem,
  Note,
  StudyItem,
  Todo,
  UserCategory,
  Settings,
} from '@schema';

export interface IPCContracts {
  // Capture
  'capture:list':   { req: { limit?: number; category?: string }; res: Capture[] };
  'capture:save':   { req: { text: string; source: Capture['source']; courseId?: string; category?: string }; res: Capture };
  'capture:delete': { req: { id: string }; res: void };
  'capture:pin':    { req: { id: string; pinned: boolean }; res: Capture };
  'capture:update': { req: { id: string; patch: Partial<Capture> }; res: Capture };

  // Notes
  'notes:list':   { req: void; res: Note[] };
  'notes:get':    { req: { id: string }; res: Note | null };
  'notes:create': { req: { title?: string; content?: string }; res: Note };
  'notes:update': { req: { id: string; patch: Partial<Note> }; res: Note };
  'notes:delete': { req: { id: string }; res: void };

  // Todo
  'todo:list':      { req: void; res: Todo[] };
  'todo:create':    { req: { text: string; category?: string }; res: Todo };
  'todo:update':    { req: { id: string; patch: Partial<Todo> }; res: Todo };
  'todo:setActive': { req: { id: string | null }; res: void };
  'todo:delete':    { req: { id: string }; res: void };

  // Academic
  'course:list': { req: { includeArchived?: boolean }; res: Course[] };
  'course:create': { req: Partial<Course> & { name: string }; res: Course };
  'course:update': { req: { id: string; patch: Partial<Course> }; res: Course };
  'course:archive': { req: { id: string }; res: Course };
  'course:get': { req: { id: string }; res: Course | undefined };
  'course:pickMaterialsFolder': { req: { courseId: string }; res: Course | null };
  'course:clearMaterialsFolder': { req: { courseId: string }; res: Course };
  'folder:readFile': { req: { path: string }; res: ArrayBuffer };
  'folder:recordImport': { req: { courseId: string; record: any }; res: boolean };
  'folder:rescan': { req: undefined; res: boolean };
  // T6 (REDESIGN_PLAN_V2): page + timestamp anchors. Both optional;
  // the handler tries to seek but always falls back to "just open"
  // if the OS / app combo doesn't support the anchor.
  'shell:openSourceFile': { req: { path: string; page?: number; timestamp?: string }; res: boolean };
  'notes:exportMarkdown': { req: { title: string; markdown: string }; res: { written: boolean; path: string; bytes: number } | null };
  'notes:exportPdf': { req: { noteId: string }; res: { written: boolean; path: string; bytes: number } | null };
  'notes:exportSlides': { req: { noteId: string }; res: { written: boolean; path: string; bytes: number } | null };
  'notes:publishStaticSite': { req: { courseId?: string }; res: { written: boolean; outDir: string; noteCount: number; bytes: number } | null };
  'notes:listRevisions': { req: { noteId: string }; res: Array<{ timestamp: number; size: number; title: string }> };
  'notes:restoreRevision': { req: { noteId: string; timestamp: number }; res: Note };
  // Flashcard sync (StudyMD-style note → cards)
  'study:syncNote': { req: { noteId: string; headingLevel?: number }; res: { created: number; updated: number; deleted: number; cards: StudyItem[] } };
  'study:syncAllNotes': { req: { headingLevel?: number }; res: { notesProcessed: number; totalCreated: number; totalUpdated: number; totalDeleted: number } };
  'study:cardsFromNote': { req: { noteId: string }; res: StudyItem[] };
  'study:syncCapture': { req: { capture: Capture; back?: string }; res: StudyItem };
  // Calendar export (.ics)
  'calendar:exportDeadlines': { req: { courseId?: string; includeCompleted?: boolean }; res: { written: boolean; path: string; count: number } | null };
  'assignment:list': { req: { courseId?: string; includeArchived?: boolean }; res: Assignment[] };
  'assignment:create': { req: Partial<Assignment> & { title: string }; res: Assignment };
  'assignment:update': { req: { id: string; patch: Partial<Assignment> }; res: Assignment };
  'assignment:delete': { req: { id: string }; res: void };
  'assignment:parse': { req: { text: string; rubricText?: string; courseId?: string; dueDate?: number; title?: string }; res: unknown };
  'assignment:markSubmitted': { req: { id: string }; res: Assignment };
  'deadline:list': { req: { includeCompleted?: boolean; courseId?: string }; res: AcademicDeadline[] };
  'deadline:create': { req: Partial<AcademicDeadline> & { title: string; deadlineAt: number }; res: AcademicDeadline };
  'deadline:update': { req: { id: string; patch: Partial<AcademicDeadline> }; res: AcademicDeadline };
  'deadline:delete': { req: { id: string }; res: void };
  'deadline:complete': { req: { id: string }; res: AcademicDeadline };
  'syllabus:parse': { req: { text: string; courseId?: string; term?: string }; res: unknown };
  'syllabus:confirmImport': {
    req: unknown;
    res: {
      courseId?: string;
      counts?: { assignments: number; deadlines: number; setupAlerts: number };
    };
  };
  'class:start': { req: { courseId?: string; title: string }; res: ClassSession };
  'class:update': { req: { id: string; patch: Partial<ClassSession> }; res: ClassSession };
  'class:end': { req: { id: string; patch?: Partial<ClassSession> }; res: ClassSession };
  'class:list': { req: { courseId?: string }; res: ClassSession[] };
  'class:get': { req: { id: string }; res: ClassSession | undefined };
  'study:list': { req: { courseId?: string; dueOnly?: boolean }; res: StudyItem[] };
  'study:create': { req: Partial<StudyItem> & { front: string }; res: StudyItem };
  'study:update': { req: { id: string; patch: Partial<StudyItem> }; res: StudyItem };
  'study:review': { req: { id: string; difficulty: NonNullable<StudyItem['difficulty']> }; res: StudyItem };
  'study:delete': { req: { id: string }; res: void };
  'confusion:list': { req: { courseId?: string; includeResolved?: boolean }; res: ConfusionItem[] };
  'confusion:create': { req: Partial<ConfusionItem> & { question: string }; res: ConfusionItem };
  'confusion:update': { req: { id: string; patch: Partial<ConfusionItem> }; res: ConfusionItem };
  'confusion:resolve': { req: { id: string }; res: ConfusionItem };
  'criticalAlerts:list': { req: { includeResolved?: boolean }; res: CriticalEmailAlert[] };
  'criticalAlerts:snooze': { req: { id: string; snoozedUntil: number }; res: CriticalEmailAlert };
  'criticalAlerts:dismiss': { req: { id: string }; res: CriticalEmailAlert };
  'criticalAlerts:resolve': { req: { id: string }; res: CriticalEmailAlert };
  'criticalAlerts:convertToTask': { req: { id: string }; res: CriticalEmailAlert };
  'attentionAlerts:list': { req: { includeResolved?: boolean }; res: AttentionAlert[] };
  'attentionAlerts:snooze': { req: { id: string; snoozedUntil: number }; res: AttentionAlert };
  'attentionAlerts:dismiss': { req: { id: string }; res: AttentionAlert };
  'attentionAlerts:resolve': { req: { id: string }; res: AttentionAlert };
  'today:get': { req: void; res: unknown };

  // Gmail
  'gmail:connect':       { req: { email: string; appPassword: string }; res: { ok: boolean; error?: string } };
  'gmail:oauthConnect':  { req: { clientId: string; clientSecret: string }; res: { ok: boolean; error?: string; email?: string } };
  'gmail:disconnect':    { req: void; res: void };
  'gmail:hasShippedOAuth': { req: void; res: boolean };
  'gmail:resetOAuthCredentials': { req: void; res: void };
  'gmail:fetchNow':      { req: void; res: EmailDigestItem[] };
  'gmail:list':          { req: void; res: EmailDigestItem[] };
  'gmail:archive':       { req: { id: string }; res: void };

  // Settings
  'focus:settings:get':    { req: void; res: Settings };
  'focus:settings:update': { req: Partial<Settings>; res: Settings };
  'focus:settings:setLLMKey': {
    req: { provider: 'anthropic' | 'openai'; key: string; model: string };
    res: void;
  };

  // Categories
  'category:list':   { req: void; res: UserCategory[] };
  'category:create': { req: { name: string; description: string; color: string }; res: UserCategory };
  'category:delete': { req: { id: string }; res: void };

  // Permissions
  'permission:checkAccessibility':    { req: void; res: boolean };
  'permission:openAccessibilitySettings': { req: void; res: void };
  'system:safeStorageAvailable': { req: void; res: boolean };

  // Window control
  'window:openNotes':    { req: { noteId?: string }; res: void };
  'window:openWorkspace': { req: { noteId?: string }; res: void };
  'window:openSettings': { req: void; res: void };

  // Timer
  'timer:toggle': { req: void; res: void };
}

export type IPCChannel = keyof IPCContracts;
