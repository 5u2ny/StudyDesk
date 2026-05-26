import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AcademicDeadline,
  Assignment,
  AttentionAlert,
  ClassSession,
  ConfusionItem,
  Course,
  CriticalEmailAlert,
  StoreData,
  StudyItem,
} from '../../shared/schema/index';
import { DEFAULT_SETTINGS } from '../../shared/schema/index';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaults(): StoreData {
  return {
    captures: [],
    notes: [],
    todos: [],
    calendarEvents: [],
    emails: [],
    categories: [],
    courses: [],
    assignments: [],
    academicDeadlines: [],
    classSessions: [],
    studyItems: [],
    confusionItems: [],
    criticalEmailAlerts: [],
    attentionAlerts: [],
    settings: clone(DEFAULT_SETTINGS),
  };
}

function storePath(): string {
  try {
    const userData = app.getPath('userData');
    const currentPath = path.join(userData, 'studydesk-store.json');
    const legacyPath = path.join(userData, 'focus-os-store.json');
    if (!fs.existsSync(currentPath) && fs.existsSync(legacyPath)) return legacyPath;
    return currentPath;
  } catch {
    const currentPath = path.join(process.cwd(), '.studydesk-store.test.json');
    const legacyPath = path.join(process.cwd(), '.focus-os-store.test.json');
    if (!fs.existsSync(currentPath) && fs.existsSync(legacyPath)) return legacyPath;
    return currentPath;
  }
}

class FocusStore {
  private readonly filePath: string;
  private data: StoreData;

  constructor() {
    this.filePath = storePath();
    this.data = this.load();
    this.persist();
  }

  private load(): StoreData {
    const base = defaults();
    try {
      if (!fs.existsSync(this.filePath)) return base;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      return {
        ...base,
        ...parsed,
        settings: {
          ...base.settings,
          ...(parsed.settings ?? {}),
          experimentalFeatures: {
            ...base.settings.experimentalFeatures,
            ...(parsed.settings?.experimentalFeatures ?? {}),
          },
          criticalEmailRules: {
            ...base.settings.criticalEmailRules,
            ...(parsed.settings?.criticalEmailRules ?? {}),
          },
        },
      };
    } catch (err: any) {
      // Auto-quarantine corrupt store (port from lyonzin/knowledge-rag).
      // Move the broken file aside instead of crashing on boot or
      // silently overwriting user data. The quarantined copy stays in
      // backups/auto-repair-<ts>/ so a user can recover by hand.
      this.quarantine(err?.message ?? 'unknown error');
      return base;
    }
  }

  /** Move a corrupt store file aside under
   *  `<userData>/backups/auto-repair-<timestamp>/studydesk-store.json` so
   *  the next boot starts from defaults instead of crashing. */
  private quarantine(reason: string): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const dir = path.dirname(this.filePath);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const quarantineDir = path.join(dir, 'backups', `auto-repair-${stamp}`);
      fs.mkdirSync(quarantineDir, { recursive: true });
      const dest = path.join(quarantineDir, path.basename(this.filePath));
      fs.renameSync(this.filePath, dest);
      console.warn(
        `[focusStore] corrupt store quarantined to ${dest} — reason: ${reason}. ` +
        `Started fresh; the broken file is preserved for manual recovery.`
      );
    } catch (mvErr: any) {
      // Quarantine itself failed — log and proceed with defaults so the
      // app still boots. The broken file will be overwritten on first
      // persist; that's acceptable since recovery from in-place corruption
      // is a lost cause anyway.
      console.warn(`[focusStore] quarantine failed: ${mvErr?.message}; proceeding with defaults`);
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get<K extends keyof StoreData>(key: K): StoreData[K] {
    return clone(this.data[key]);
  }

  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    this.data[key] = clone(value);
    this.persist();
  }

  // ── Capture helpers ────────────────────────────────────────────────────
  addCapture(c: import('../../shared/schema/index').Capture) {
    this.set('captures', [c, ...this.get('captures')]);
  }

  updateCapture(id: string, patch: Partial<import('../../shared/schema/index').Capture>) {
    this.set('captures', this.get('captures').map(c => c.id === id ? { ...c, ...patch } : c));
  }

  // ── Note helpers ───────────────────────────────────────────────────────
  addNote(n: import('../../shared/schema/index').Note) {
    this.set('notes', [n, ...this.get('notes')]);
  }

  updateNote(id: string, patch: Partial<import('../../shared/schema/index').Note>) {
    this.set('notes', this.get('notes').map(n => n.id === id ? { ...n, ...patch } : n));
  }

  // ── Todo helpers ───────────────────────────────────────────────────────
  addTodo(t: import('../../shared/schema/index').Todo) {
    this.set('todos', [t, ...this.get('todos')]);
  }

  updateTodo(id: string, patch: Partial<import('../../shared/schema/index').Todo>) {
    this.set('todos', this.get('todos').map(t => t.id === id ? { ...t, ...patch } : t));
  }

  // ── Academic helpers ──────────────────────────────────────────────────
  addCourse(course: Course) {
    this.set('courses', [course, ...this.get('courses')]);
  }

  updateCourse(id: string, patch: Partial<Course>) {
    this.set('courses', this.get('courses').map(c => c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c));
  }

  addAssignment(assignment: Assignment) {
    this.set('assignments', [assignment, ...this.get('assignments')]);
  }

  updateAssignment(id: string, patch: Partial<Assignment>) {
    this.set('assignments', this.get('assignments').map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a));
  }

  addAcademicDeadline(deadline: AcademicDeadline) {
    this.set('academicDeadlines', [deadline, ...this.get('academicDeadlines')]);
  }

  updateAcademicDeadline(id: string, patch: Partial<AcademicDeadline>) {
    this.set('academicDeadlines', this.get('academicDeadlines').map(d => d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d));
  }

  addClassSession(session: ClassSession) {
    this.set('classSessions', [session, ...this.get('classSessions')]);
  }

  updateClassSession(id: string, patch: Partial<ClassSession>) {
    this.set('classSessions', this.get('classSessions').map(s => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s));
  }

  addStudyItem(item: StudyItem) {
    this.set('studyItems', [item, ...this.get('studyItems')]);
  }

  updateStudyItem(id: string, patch: Partial<StudyItem>) {
    this.set('studyItems', this.get('studyItems').map(i => i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i));
  }

  addConfusionItem(item: ConfusionItem) {
    this.set('confusionItems', [item, ...this.get('confusionItems')]);
  }

  updateConfusionItem(id: string, patch: Partial<ConfusionItem>) {
    this.set('confusionItems', this.get('confusionItems').map(i => i.id === id ? { ...i, ...patch } : i));
  }

  addCriticalEmailAlert(alert: CriticalEmailAlert) {
    this.set('criticalEmailAlerts', [alert, ...this.get('criticalEmailAlerts')]);
  }

  updateCriticalEmailAlert(id: string, patch: Partial<CriticalEmailAlert>) {
    this.set('criticalEmailAlerts', this.get('criticalEmailAlerts').map(a => a.id === id ? { ...a, ...patch } : a));
  }

  addAttentionAlert(alert: AttentionAlert) {
    this.set('attentionAlerts', [alert, ...this.get('attentionAlerts')]);
  }

  updateAttentionAlert(id: string, patch: Partial<AttentionAlert>) {
    this.set('attentionAlerts', this.get('attentionAlerts').map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a));
  }

  // ── Email helpers ──────────────────────────────────────────────────────
  upsertEmail(e: import('../../shared/schema/index').EmailDigestItem) {
    const existing = this.get('emails');
    const idx = existing.findIndex(x => x.id === e.id);
    if (idx >= 0) {
      existing[idx] = e;
      this.set('emails', existing);
    } else {
      this.set('emails', [e, ...existing]);
    }
  }

  // ── Settings helpers ───────────────────────────────────────────────────
  getSettings(): import('../../shared/schema/index').Settings {
    return this.get('settings');
  }

  updateSettings(patch: Partial<import('../../shared/schema/index').Settings>) {
    this.set('settings', {
      ...this.get('settings'),
      ...patch,
      experimentalFeatures: {
        ...this.get('settings').experimentalFeatures,
        ...(patch.experimentalFeatures ?? {}),
      },
      criticalEmailRules: {
        ...this.get('settings').criticalEmailRules,
        ...(patch.criticalEmailRules ?? {}),
      },
    });
    return this.get('settings');
  }
}

export const focusStore = new FocusStore();
