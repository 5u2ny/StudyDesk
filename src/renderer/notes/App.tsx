import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AcademicDeadline, Assignment, AttentionAlert, Capture, ChecklistItem, ClassSession, ConfusionItem, Course, Note, StudyItem } from '@schema'
import { Spinner } from './components/Spinner'
import { EmptyState } from './components/EmptyState'
import { DashboardView as HomeDashboard } from './components/DashboardView'
import { Editor } from './Editor'
import { DailyJournalView } from './components/DailyJournalView'
import { ScanSyllabusDropZone } from './components/ScanSyllabusDropZone'
import { RelationMapView } from './components/RelationMapView'
import { TimelineView } from './components/TimelineView'
import { filterItems } from '@shared/lib/filterDsl'
import { lintNotes, summarizeIssues, type LintIssue } from './lib/noteHealth'
import { isDuplicateQuestion, isDuplicateFlashcard } from './lib/studyDedup'
import { CommandPalette } from './components/CommandPalette'
import { QuizMeBackModal } from './components/QuizMeBackModal'
import { PanicModeModal } from './components/PanicModeModal'
import { StudioPanel } from './components/StudioPanel'
import { NotesListView } from './components/NotesListView'
import { AddCourseModal } from './components/AddCourseModal'
import { FileDropZone, MaterialsView, inferMaterialKind } from './features/materials'
import { selectPanicItems } from './lib/panicMode'
import type { SearchHit } from './lib/searchIndex'
import { routePaletteHit } from './lib/paletteRouter'
import { parseTipTapJson, textFromTipTapJson, walkTipTapDoc } from '../../shared/tiptap'
import {
  extractSyllabusGradingComponents,
  extractSyllabusScheduleRows,
  type SyllabusGradingComponent,
  type SyllabusScheduleRow,
} from '../../shared/syllabusSchedule'
import {
  ShellContainer,
  IconRail,
  MainPanel,
  RightPanelCollapsedButton,
} from './components/WorkspaceShell'
import { ipc } from '@shared/ipc-client'
import { cn } from '@shared/lib/utils'
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Circle,
  ClipboardList,
  FileText,
  Folder,
  GraduationCap,
  HelpCircle,
  Image,
  MoreHorizontal,
  Network,
  PanelTop,
  PenLine,
  Play,
  Sparkles,
  Target,
  Layers,
  Upload,
  X,
} from 'lucide-react'

// ── Local review types (not persisted) ────────────────────────────────────────
interface AssignmentParseReview {
  title: string
  dueDate?: number
  deliverables: ChecklistItem[]
  formatRequirements: ChecklistItem[]
  rubricItems: ChecklistItem[]
  submissionChecklist: ChecklistItem[]
}

const MIN_EXTRACTED_PDF_CHARS = 120

interface SyllabusDeadlineReview {
  title: string
  deadlineAt: number
  type: string
  included: boolean
}

interface SyllabusAssignmentReview {
  title: string
  dueDate?: number
  weight?: string
  type: string
  included: boolean
}

interface SyllabusSetupReview {
  title: string
  category: string
  included: boolean
}

interface SyllabusClassMeetingReview {
  days: string[]
  startTime: string
  endTime: string
  location?: string
}

interface SyllabusParseReview {
  course: { name?: string; code?: string; professorName?: string; professorEmail?: string; term?: string; officeHours?: string; location?: string }
  classMeetings: SyllabusClassMeetingReview[]
  assignments: SyllabusAssignmentReview[]
  deadlines: SyllabusDeadlineReview[]
  setupTasks: SyllabusSetupReview[]
  readings: Array<{ title: string; chapter?: string }>
  scheduleRowCount: number
}

interface SyllabusConfirmResult {
  courseId?: string
  syllabusNoteId?: string
  counts: { deadlines: number; assignments: number; setupAlerts: number }
}

interface FlashcardDraft {
  front: string
  back: string
  type: 'flashcard' | 'concept' | 'definition'
}

interface QuizQuestionDraft {
  question: string
  answer?: string
}

interface StudySourceInfo {
  note?: Note
  capture?: Capture
  title: string
  kind: 'material' | 'note' | 'capture'
  isMaterial: boolean
  sourcePath?: string
}

// Ticket 1.1 — IA collapse 10 → 6 visible tabs.
// The type union still carries every tool id so the demoted ones
// (dashboard / quiz / assignment / syllabus / map / timeline) remain
// reachable via the "More" overflow menu and direct activeTool calls.
// Visible-in-tab-strip set is enforced in `tools` below.
type WorkspaceTool = 'today' | 'daily' | 'notes' | 'calendar' | 'grades' | 'deadlines' | 'flashcards' | 'materials' | 'class'
                   | 'dashboard' | 'quiz' | 'assignment' | 'syllabus' | 'map' | 'timeline'
type QuickAddKind = 'course' | 'deadline' | 'note' | 'assignment' | 'syllabus' | 'study' | 'question'

interface QuickAddForm {
  title: string
  detail: string
  code: string
  due: string
}

/** Block-level TipTap node types that should be separated by newlines. */
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'codeBlock',
  'bulletList', 'orderedList', 'listItem', 'horizontalRule',
])

function noteText(content: string): string {
  return textFromTipTapJson(content, { blockTypes: BLOCK_TYPES, fallback: content })
}

function makeQuestionCandidateKey(front: string, position: number): string {
  const s = front.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + position
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff
  return ('00000000' + (h >>> 0).toString(16)).slice(-8)
}

function extractQuestionDraftsFromText(text: string): QuizQuestionDraft[] {
  const questions: QuizQuestionDraft[] = []
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (line.length < 10) continue
    // Headings or short standalone lines -> concept question
    if (line.length < 60 && !line.includes('.')) {
      questions.push({ question: `What should you remember about ${line}?` })
    // Definition patterns
    } else if (/\b(is|means|refers to|defined as)\b/i.test(line)) {
      const term = line.split(/\b(is|means|refers to|defined as)\b/i)[0].trim()
      if (term.length > 3 && term.length < 80) {
        questions.push({ question: `What does "${term}" mean?`, answer: line })
      }
    // Longer meaningful sentences
    } else if (line.length > 40) {
      const shortened = line.slice(0, 80).replace(/[.,;:]+$/, '')
      questions.push({ question: `Why is this important: ${shortened}?`, answer: line })
    }
    if (questions.length >= 8) break
  }
  return questions
}

/** Count how many notes embed a sourceQuote pointing at the given path.
 *  DokuWiki-style backref: walks each note's TipTap JSON for sourceQuote
 *  nodes whose sourcePath attr matches. A note that embeds the same
 *  source twice still counts as one note. */
function countMaterialUsages(notes: Note[], materialPath: string): number {
  if (!materialPath) return 0
  let count = 0
  // Iterative DFS so we can early-exit cleanly when a match is found —
  // forEach can't break, and walking siblings of a hit wastes work on
  // large notes.
  for (const note of notes) {
    let json: any
    try { json = JSON.parse(note.content) } catch { continue }
    const stack: any[] = [json]
    let found = false
    while (stack.length && !found) {
      const n = stack.pop()
      if (!n) continue
      if (n.type === 'sourceQuote' && n.attrs?.sourcePath === materialPath) {
        found = true
        break
      }
      if (Array.isArray(n.content)) for (const c of n.content) stack.push(c)
    }
    if (found) count++
  }
  return count
}

function getStudySourceInfo(item: StudyItem, notes: Note[], courses: Course[], captures: Capture[]): StudySourceInfo | null {
  if (item.sourceNoteId) {
    const note = notes.find(n => n.id === item.sourceNoteId)
    if (note) {
      const record = courses
        .flatMap(course => course.materialsImportedFiles ?? [])
        .find(r => r.noteId === note.id)
      const sourcePath = record?.storedPath ?? record?.path
      return {
        note,
        title: record?.originalFilename ?? sourcePath?.split('/').pop() ?? note.title ?? 'Source material',
        kind: record ? 'material' : 'note',
        isMaterial: Boolean(record),
        sourcePath,
      }
    }
  }
  if (item.sourceCaptureId) {
    const capture = captures.find(c => c.id === item.sourceCaptureId)
    if (capture) {
      const source = capture.sourceApp ? ` from ${capture.sourceApp}` : ''
      return {
        capture,
        title: `Capture${source}`,
        kind: 'capture',
        isMaterial: false,
      }
    }
  }
  return null
}

function studySourceLabel(source: StudySourceInfo): string {
  if (source.kind === 'material') return 'Source material'
  if (source.kind === 'capture') return 'Source capture'
  return 'Source note'
}

function firstUsefulLine(text: string): string {
  return text.split(/[.\n]/).map(s => s.trim()).find(s => s.length > 8)?.slice(0, 140) ?? 'Review this concept'
}

function tipTapDocument(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: text.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: text.trim() }] }]
      : [],
  })
}

function PdfTextImportControl({
  title,
  description,
  onText,
  onTooShort,
  onError,
}: {
  title: string
  description: string
  onText: (payload: { title: string; text: string; pageCount?: number }) => void | Promise<void>
  onTooShort: (message: string) => void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      onError(`Use a PDF file for this import: ${file.name}`)
      return
    }
    setBusy(true)
    try {
      const { extractFileText } = await import('./lib/extractFileText')
      const result = await extractFileText(file)
      const text = result.text.trim()
      if (text.length < MIN_EXTRACTED_PDF_CHARS) {
        onTooShort(`"${file.name}" has very little embedded text. It may be a scanned PDF; use the image OCR fallback only if you need to extract text from the scan.`)
        return
      }
      await onText({ title: result.title || file.name.replace(/\.pdf$/i, ''), text, pageCount: result.pageCount })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onError(`PDF import failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`scan-drop-zone ${busy ? 'busy' : ''}`}>
      <div className="scan-drop-icon">
        {busy ? <Spinner size={16} /> : <FileText size={18} />}
      </div>
      <div className="scan-drop-body">
        <strong>{busy ? 'Extracting PDF text...' : title}</strong>
        <span>{description}</span>
      </div>
      <label className="scan-drop-button">
        Browse
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.target.value = ''
          }}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  )
}

function extractQuestionsFromNote(note: Note): QuizQuestionDraft[] {
  const text = noteText(note.content)
  const numbered = text.split(/\n+/).map(l => l.trim()).filter(l => /^\d+\.\s/.test(l)).map(l => ({ question: l.replace(/^\d+\.\s*/, '') }))
  return numbered.length > 0 ? numbered : extractQuestionDraftsFromText(text)
}

function defaultQuickAddForm(kind: QuickAddKind, selectedText = ''): QuickAddForm {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000)
  tomorrow.setMinutes(0, 0, 0)
  return {
    title: kind === 'course' ? '' : kind === 'deadline' ? 'New deadline' : kind === 'study' ? firstUsefulLine(selectedText) : '',
    detail: kind === 'study' ? 'Add the answer during review.' : '',
    code: '',
    due: tomorrow.toISOString().slice(0, 16),
  }
}

const ALL_TOOLS = ['today', 'daily', 'notes', 'calendar', 'deadlines', 'flashcards', 'materials', 'class', 'dashboard', 'quiz', 'assignment', 'syllabus', 'map', 'timeline'] as const

function initialWorkspaceTool(): WorkspaceTool {
  const tool = new URLSearchParams(window.location.search).get('tool')
  return (ALL_TOOLS as readonly string[]).includes(tool ?? '')
    ? (tool as WorkspaceTool)
    : 'today'
}

function initialQuickAdd(): QuickAddKind | null {
  const kind = new URLSearchParams(window.location.search).get('quickAdd')
  return kind === 'course' || kind === 'deadline' || kind === 'note' || kind === 'assignment' || kind === 'syllabus' || kind === 'study' || kind === 'question'
    ? kind
    : null
}

export default function App() {
  const initialQuickAddKind = initialQuickAdd()
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelectedRaw] = useState<Note | null>(null)
  // Story river (TiddlyWiki port): clicking a [[wiki-link]], backlink, or
  // subpage stacks the linked note BELOW the current one instead of replacing
  // it. Sidebar selection still replaces. The river is just a list of note
  // ids (not full Notes) so it survives notes-list refreshes cleanly.
  const [riverIds, setRiverIds] = useState<string[]>([])
  // setSelected wrapper that also clears the river — primary navigation
  // (sidebar, course switch, quickAdd) starts a fresh river. Accepts both
  // a direct value and the functional updater form so existing call sites
  // (refresh() uses the updater) keep working.
  const setSelected = useCallback((n: Note | null | ((prev: Note | null) => Note | null)) => {
    if (typeof n === 'function') setSelectedRaw(n)
    else setSelectedRaw(n)
    setRiverIds([])
  }, [])
  // Ref tracks the latest `selected` so the window-event listener (which
  // is registered once with empty deps) reads the current id, not stale.
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selected?.id ?? null }, [selected])

  const addToRiver = useCallback((noteId: string) => {
    if (!noteId) return
    setRiverIds(prev => prev.includes(noteId) || noteId === selectedIdRef.current ? prev : [...prev, noteId])
  }, [])
  const removeFromRiver = useCallback((noteId: string) => {
    setRiverIds(prev => prev.filter(id => id !== noteId))
  }, [])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [unlinkedCaptures, setUnlinkedCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [alerts, setAlerts] = useState<AttentionAlert[]>([])
  const [classSessions, setClassSessions] = useState<ClassSession[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [appView, setAppView] = useState<'dashboard' | 'workspace'>('dashboard')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<WorkspaceTool>(initialWorkspaceTool)
  const [status, setStatus] = useState('')
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(initialQuickAddKind)
  const [quickAddForm, setQuickAddForm] = useState<QuickAddForm>(initialQuickAddKind ? defaultQuickAddForm(initialQuickAddKind) : { title: '', detail: '', code: '', due: '' })
  const [showAddCourseModal, setShowAddCourseModal] = useState(false)
  const [focusedMaterialNoteId, setFocusedMaterialNoteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setExpandedSections(p => ({ ...p, [key]: !p[key] }))

  // ── Panel open/closed state — persisted to localStorage so the user's
  //    layout preferences survive a relaunch (P2.1 + P2.4 audit fixes).
  //    Pure-client state; no IPC needed. Reads run only on mount.
  const readPersistedBool = (key: string, fallback: boolean): boolean => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : v === '1'
    } catch { return fallback }
  }
  const readPersistedString = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    try {
      const v = localStorage.getItem(key)
      return (v && (allowed as readonly string[]).includes(v)) ? (v as T) : fallback
    } catch { return fallback }
  }
  const [rightPanelOpen, setRightPanelOpen]   = useState(() => readPersistedBool('studydesk:ui:rightOpen', false))
  const [rightTab, setRightTab]               = useState<'sources' | 'materials' | 'study' | 'health'>(
    () => readPersistedString('studydesk:ui:rightTab', ['sources', 'materials', 'study', 'health'] as const, 'sources')
  )
  // Persist on change.
  useEffect(() => { try { localStorage.setItem('studydesk:ui:rightOpen', rightPanelOpen ? '1' : '0') } catch { /* ignore */ } }, [rightPanelOpen])
  useEffect(() => { try { localStorage.setItem('studydesk:ui:rightTab', rightTab) } catch { /* ignore */ } }, [rightTab])

  // T1 (REDESIGN_PLAN_V2): cross-course command palette. Cmd+K from
  // anywhere opens the universal search modal. The wedge attack on
  // NotebookLM's #1 unmet need. State lifted to App so the hotkey can
  // be a single global listener.
  const [paletteOpen, setPaletteOpen] = useState(false)
  // T3 (REDESIGN_PLAN_V2): panic mode. Shows the 20 most-likely-to-
  // fail cards in the current course scope, ranked by a local
  // retrievability heuristic. State at App level so the trigger can
  // live anywhere (cmdk action / course header / FlashcardsView).
  // Panic-mode modal owns its state at App level. Studio panel
  // receives setPanicOpen directly via prop now (review C3) — the
  // previous window-event bridge was an unnecessary code smell since
  // the state lives one component above.
  const [panicOpen, setPanicOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
      // Cmd+Shift+L: link first unlinked capture to active note
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault()
        if (selected && unlinkedCaptures.length > 0) {
          ipc.invoke('capture:linkToNote', { captureIds: [unlinkedCaptures[0].id], noteId: selected.id })
            .then(() => Promise.all([
              ipc.invoke<Note[]>('notes:list'),
              ipc.invoke<Capture[]>('capture:unlinked', { limit: 100 }),
            ]))
            .then(([updatedNotes, updatedUnlinked]) => {
              setNotes(updatedNotes as Note[])
              setUnlinkedCaptures(updatedUnlinked as Capture[])
              setSelected((updatedNotes as Note[]).find(n => n.id === selected!.id) ?? selected)
              setStatus('Capture linked')
            })
            .catch(() => {})
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, unlinkedCaptures])

  // T4 (anti-shame): late-night mode. Between 22:00 and 05:00 the
  // workspace dials down: muted accents, lower contrast, smaller
  // exclamations in copy. The research finding this addresses:
  // r/CollegeRant — "Dark mode that doesn't yell at me when I open it
  // at 4am." Body element gets data-time-of-day so CSS can scope.
  useEffect(() => {
    const apply = () => {
      const h = new Date().getHours()
      const isLate = h >= 22 || h < 5
      document.body.dataset.timeOfDay = isLate ? 'late' : 'day'
    }
    apply()
    // Re-check every 5 min so it kicks in for users who leave the app
    // open through the threshold. No need to be exact.
    const t = window.setInterval(apply, 5 * 60 * 1000)
    return () => window.clearInterval(t)
  }, [])

  function pickDefaultWorkspaceNote(noteData: Note[], courseId?: string, avoidSyllabus = false): Note | null {
    const scoped = courseId ? noteData.filter(note => note.courseId === courseId) : noteData
    const nonSyllabus = scoped.find(note => note.documentType !== 'syllabus')
    if (nonSyllabus) return nonSyllabus
    if (avoidSyllabus) return null
    return scoped[0] ?? noteData.find(note => note.documentType !== 'syllabus') ?? noteData[0] ?? null
  }

  async function refresh(options: { defaultCourseId?: string; avoidSyllabusDefault?: boolean } = {}) {
    const [noteData, captureData, courseData, assignmentData, deadlineData, studyData, confusionData, alertData, classData] = await Promise.all([
      ipc.invoke<Note[]>('notes:list'),
      ipc.invoke<Capture[]>('capture:list', { limit: 80 }),
      ipc.invoke<Course[]>('course:list', {}),
      ipc.invoke<Assignment[]>('assignment:list', {}),
      ipc.invoke<AcademicDeadline[]>('deadline:list', {}),
      ipc.invoke<StudyItem[]>('study:list', {}),
      ipc.invoke<ConfusionItem[]>('confusion:list', {}),
      ipc.invoke<AttentionAlert[]>('attentionAlerts:list', {}),
      ipc.invoke<ClassSession[]>('class:list', {}),
    ])
    setNotes(noteData)
    setCaptures(captureData)
    setCourses(courseData)
    setAssignments(assignmentData)
    setDeadlines(deadlineData)
    setStudyItems(studyData)
    setConfusions(confusionData)
    setAlerts(alertData)
    setClassSessions(classData)
    setSelectedAssignmentId(prev => prev && assignmentData.some(a => a.id === prev) ? prev : null)
    setSelected(prev => {
      const preserved = prev ? noteData.find(note => note.id === prev.id) ?? null : null
      if (preserved && (!options.defaultCourseId || preserved.courseId === options.defaultCourseId)) return preserved
      return pickDefaultWorkspaceNote(
        noteData,
        options.defaultCourseId ?? selectedCourseId ?? undefined,
        options.avoidSyllabusDefault ?? false
      )
    })
    // Fetch unlinked captures for the CaptureInbox (non-critical, after all state setters)
    ipc.invoke<Capture[]>('capture:unlinked', { limit: 100 }).then(setUnlinkedCaptures).catch(() => {})
  }

  useEffect(() => {
    refresh().catch(() => {})
    // Trigger a rescan on workspace open so the watcher picks up files added while
    // the notes window was closed. The watcher's start() also runs scans at app
    // boot, but those events are lost if the notes window doesn't exist yet.
    ipc.invoke('folder:rescan', undefined).catch(() => {})
    ipc.on('notes:openNote', (noteId: string) => {
      ipc.invoke<Note>('notes:get', { id: noteId }).then(note => note && setSelected(note)).catch(() => {})
    })
    // [[wiki-link]] click handler — TipTap dispatches this when a user
    // clicks a rendered note-link in the editor. Story-river behavior:
    // the clicked note is appended BELOW the current one instead of
    // replacing it (TiddlyWiki port). IPC ensures fresh data — the
    // closure would otherwise capture stale `notes` state.
    const onNoteLinkClick = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId: string }>).detail
      if (!detail?.noteId) return
      ipc.invoke<Note>('notes:get', { id: detail.noteId }).then(target => {
        if (!target) return
        addToRiver(target.id)
      }).catch(() => {})
    }
    window.addEventListener('studydesk:open-note-link', onNoteLinkClick)
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
    })
    // Folder watcher: main process detects a new file → renderer reads, extracts, creates note
    ipc.on('folder:fileDetected', async (payload: { courseId: string; path: string; name: string; ext: string; size: number; mtime: number }) => {
      try {
        const buffer = await ipc.invoke<ArrayBuffer>('folder:readFile', { path: payload.path })
        const blob = new Blob([buffer])
        const file = new File([blob], payload.name)
        const { extractFileText } = await import('./lib/extractFileText')
        const result = await extractFileText(file)
        const trimmed = result.text.trim()
        if (!trimmed && !result.docJson) throw new Error('No extractable text')

        // Use rich TipTap JSON for .docx/.md imports; fall back to a
        // single-paragraph wrap for plain-text/.pdf where structure was lost.
        const content = result.docJson ? JSON.stringify(result.docJson) : tipTapDocument(trimmed)
        const note = await ipc.invoke<Note>('notes:create', { title: result.title, content })
        const materialKind = inferMaterialKind(payload.name, 'reading')
        const updated = await ipc.invoke<Note>('notes:update', {
          id: note.id,
          patch: { documentType: 'reading', courseId: payload.courseId, tags: [`folder-import`, `material:${materialKind.kind}`] },
        })
        setNotes(prev => [updated, ...prev.filter(n => n.id !== updated.id)])
        await ipc.invoke('folder:recordImport', {
          courseId: payload.courseId,
          record: { path: payload.path, mtime: payload.mtime, size: payload.size, importedAt: Date.now(), noteId: updated.id },
        })
        // Refresh the course in local state so the "N imported · auto-watching" counter updates
        const refreshedCourses = await ipc.invoke<Course[]>('course:list', {})
        setCourses(refreshedCourses)
        setStatus(`Auto-imported "${updated.title}" from course folder.`)
        setTimeout(() => setStatus(''), 3500)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Folder import failed'
        await ipc.invoke('folder:recordImport', {
          courseId: payload.courseId,
          record: { path: payload.path, mtime: payload.mtime, size: payload.size, importedAt: Date.now(), error: message },
        }).catch(() => {})
        console.warn('[folder import]', payload.name, message)
      }
    })
    return () => {
      ipc.off('notes:openNote'); ipc.off('capture:new'); ipc.off('folder:fileDetected')
      window.removeEventListener('studydesk:open-note-link', onNoteLinkClick)
    }
  }, [])

  // ── Derived filtered state ──────────────────────────────────────────────────
  const selectedText = useMemo(() => selected ? noteText(selected.content) : '', [selected])

  const selectedCourse = selectedCourseId ? courses.find(c => c.id === selectedCourseId) : undefined
  // Default to the most-recently-created course on first paint. After
  // a syllabus import this means the freshly-imported course is the
  // one whose assignments/deadlines populate the sidebar — which is
  // what the user expects when they just dropped a syllabus in.
  const currentCourse = selectedCourse ?? [...courses].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]

  // Filter by selectedCourseId when set
  const byCourse = <T extends { courseId?: string }>(items: T[]) =>
    selectedCourseId ? items.filter(i => i.courseId === selectedCourseId) : items

  // Filter DSL (TiddlyWiki port): when the user types `[tag[x]...]` the
  // query becomes a structured filter; otherwise falls back to plain
  // substring search across title + content. The same DSL is used for
  // captures by adapting Capture → FilterableItem (text→content).
  const visibleNotes = useMemo(
    () => filterItems(byCourse(notes), searchQuery, courses),
    [notes, searchQuery, selectedCourseId, courses]
  )
  const visibleCaptures = useMemo(() => {
    const adapter = byCourse(captures).map(c => ({
      id: c.id,
      title: c.text.slice(0, 80),
      content: c.text,
      courseId: c.courseId,
      tags: c.labels ?? [],
      documentType: c.source,
      updatedAt: c.createdAt,
      createdAt: c.createdAt,
      __orig: c,
    }))
    return filterItems(adapter, searchQuery, courses).map(a => (a as any).__orig as typeof captures[number])
  }, [captures, searchQuery, selectedCourseId, courses])
  const visibleAssignments = byCourse(assignments)
  const visibleDeadlines = byCourse(deadlines)
  const visibleStudyItems = byCourse(studyItems)
  const visibleConfusions = byCourse(confusions)
  const visibleClassSessions = byCourse(classSessions)
  const visibleAlerts = byCourse(alerts)

  const syllabusNotes = visibleNotes.filter(note => note.documentType === 'syllabus')
  const assignmentNotes = visibleNotes.filter(note => note.documentType === 'assignment_prompt')
  const classNotes = visibleNotes.filter(note => note.documentType === 'class_notes' || note.documentType === 'note')

  const orderedVisibleDeadlines = [...visibleDeadlines]
    .filter(d => !d.completed)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)

  const selectedLinkedAssignment = selected?.linkedAssignmentId
    ? assignments.find(a => a.id === selected.linkedAssignmentId)
    : undefined

  const activeAssignment = selectedAssignmentId
    ? assignments.find(a => a.id === selectedAssignmentId)
    : (selectedLinkedAssignment ?? visibleAssignments.find(a => a.status !== 'archived' && a.status !== 'submitted'))

  const activeAssignmentChecklistItems: ChecklistItem[] = activeAssignment
    ? [
        ...activeAssignment.deliverables,
        ...activeAssignment.formatRequirements,
        ...activeAssignment.rubricItems,
        ...activeAssignment.submissionChecklist,
      ]
    : []
  const checklistTotal = activeAssignmentChecklistItems.length
  const checklistDone = activeAssignmentChecklistItems.filter(i => i.completed).length
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0

  const now = Date.now()
  const dueStudyItems = visibleStudyItems.filter(i => !i.nextReviewAt || i.nextReviewAt <= now)
  const unresolvedConfusions = visibleConfusions.filter(c => c.status !== 'resolved')
  const activeAlerts = visibleAlerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed')
  const studySourceFor = useCallback((item: StudyItem) => getStudySourceInfo(item, notes, courses, captures), [notes, courses, captures])

  function openStudyItemSource(item: StudyItem) {
    const source = studySourceFor(item)
    if (!source) {
      setStatus('No source is linked for this study item.')
      return
    }
    const courseId = source.note?.courseId ?? source.capture?.courseId ?? item.courseId
    if (courseId) setSelectedCourseId(courseId)
    setAppView('workspace')
    if (source.kind === 'material' && source.note && source.sourcePath) {
      setFocusedMaterialNoteId(source.note.id)
      setActiveTool('materials')
      return
    }
    if (source.kind === 'capture') {
      setFocusedMaterialNoteId(null)
      setActiveTool('today')
      setStatus('Opened source capture context.')
      return
    }
    if (!source.note) {
      setStatus('Source record is no longer available.')
      return
    }
    setFocusedMaterialNoteId(null)
    setSelected(source.note)
    setActiveTool('notes')
  }

  async function handleCreate(type: Note['documentType'] = 'note') {
    const note = await ipc.invoke<Note>('notes:create', { title: type === 'note' ? 'Untitled note' : `New ${type.replace('_', ' ')}`, content: '' })
    const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType: type, tags: [] } })
    setNotes(prev => [updated, ...prev])
    setSelected(updated)
  }

  // Used by the FileDropZone — creates a note from extracted file text and links it to a course.
  async function handleCreateFromFile(input: { title: string; content: string; docJson?: unknown; courseId?: string; documentType?: Note['documentType'] }): Promise<string> {
    // Prefer rich-parsed TipTap JSON when available (.docx, .md). Fallback
    // to plain-text-wrapped-in-paragraph for .pdf and .txt where structure
    // isn't reliably reconstructable.
    const content = input.docJson ? JSON.stringify(input.docJson) : tipTapDocument(input.content)
    const note = await ipc.invoke<Note>('notes:create', { title: input.title || 'Imported file', content })
    const updated = await ipc.invoke<Note>('notes:update', {
      id: note.id,
      patch: {
        documentType: input.documentType ?? 'reading',
        courseId: input.courseId,
        tags: [`material:${inferMaterialKind(input.title, input.documentType ?? 'reading').kind}`],
      },
    })
    setNotes(prev => [updated, ...prev])
    setSelected(updated)
    setStatus(`Imported "${updated.title}".`)
    setTimeout(() => setStatus(''), 3000)
    return updated.id
  }

  function openQuickAdd(kind: QuickAddKind) {
    setQuickAdd(kind)
    setQuickAddForm(defaultQuickAddForm(kind, selectedText))
  }

  async function submitQuickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!quickAdd) return
    const title = quickAddForm.title.trim()
    const detail = quickAddForm.detail.trim()
    const fallbackTitle = quickAdd === 'course' ? 'New course' : quickAdd === 'question' ? 'New question' : 'Untitled'
    switch (quickAdd) {
      case 'course':
        await ipc.invoke<Course>('course:create', { name: title || fallbackTitle, code: quickAddForm.code.trim() || undefined })
        setStatus('Course added.')
        break
      case 'deadline':
        await ipc.invoke<AcademicDeadline>('deadline:create', {
          title: title || fallbackTitle,
          deadlineAt: quickAddForm.due ? new Date(quickAddForm.due).getTime() : Date.now() + 24 * 60 * 60_000,
          courseId: currentCourse?.id,
          type: 'assignment',
          sourceType: 'manual',
        })
        setStatus('Deadline added.')
        break
      case 'study':
        await ipc.invoke<StudyItem>('study:create', { front: title || firstUsefulLine(selectedText), back: detail || undefined, type: 'flashcard', courseId: currentCourse?.id })
        setStatus('Flashcard added.')
        break
      case 'question':
        await ipc.invoke<ConfusionItem>('confusion:create', { question: title || fallbackTitle, context: detail || undefined, courseId: currentCourse?.id })
        setStatus('Question added.')
        break
      case 'syllabus':
      case 'assignment':
      case 'note': {
        const documentType: Note['documentType'] = quickAdd === 'syllabus' ? 'syllabus' : quickAdd === 'assignment' ? 'assignment_prompt' : 'note'
        const note = await ipc.invoke<Note>('notes:create', { title: title || fallbackTitle, content: tipTapDocument(detail) })
        const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType, courseId: currentCourse?.id, tags: [] } })
        setSelected(updated)
        setStatus(`${quickAdd === 'assignment' ? 'Assignment prompt' : quickAdd === 'syllabus' ? 'Syllabus note' : 'Note'} added.`)
        break
      }
    }
    setQuickAdd(null)
    await refresh()
  }

  const autoTagTimer = useRef<number>(0)
  async function handleUpdate(id: string, patch: Partial<Note>) {
    const updated = await ipc.invoke<Note>('notes:update', { id, patch })
    setNotes(prev => prev.map(n => n.id === id ? updated : n))
    setSelected(updated)
    // Debounced auto-tag: run 3s after the last content change
    if (patch.content) {
      window.clearTimeout(autoTagTimer.current)
      autoTagTimer.current = window.setTimeout(async () => {
        try {
          const { tags } = await ipc.invoke<{ tags: string[] }>('notes:autoTag', { noteId: id })
          if (tags.length > 0) {
            setNotes(prev => prev.map(n => n.id === id ? { ...n, tags } : n))
            setSelected(prev => prev && prev.id === id ? { ...prev, tags } : prev)
          }
        } catch { /* auto-tag is best-effort */ }
      }, 3000)
    }
  }

  async function handleDelete(id: string) {
    try {
      await ipc.invoke('notes:delete', { id })
      const remaining = notes.filter(n => n.id !== id)
      setNotes(remaining)
      setSelected(remaining[0] ?? null)
    } catch (e) { console.error('handleDelete failed:', e) }
  }

  function handleToolSave(message: string) {
    return () => { setStatus(message); refresh().catch(() => {}) }
  }

  async function startClass() {
    try {
      const title = selectedCourse ? `${selectedCourse.code ?? selectedCourse.name} class session` : 'Class session'
      await ipc.invoke('class:start', { courseId: selected?.courseId, title })
      setStatus('Class mode started. Capture notes and questions as you work.')
      await refresh()
    } catch (e) { console.error('startClass failed:', e) }
  }

  async function completeDeadline(id: string) {
    try {
      await ipc.invoke('deadline:complete', { id })
      setStatus('Deadline marked complete.')
      await refresh()
    } catch (e) { console.error('completeDeadline failed:', e) }
  }

  async function reviewStudyItem(id: string, difficulty: NonNullable<StudyItem['difficulty']>) {
    try {
      await ipc.invoke('study:review', { id, difficulty })
      setStatus(`Study item reviewed: ${difficulty}.`)
      await refresh()
    } catch (e) { console.error('reviewStudyItem failed:', e) }
  }

  async function resolveConfusion(id: string) {
    try {
      await ipc.invoke('confusion:resolve', { id })
      setStatus('Question marked resolved.')
      await refresh()
    } catch (e) { console.error('resolveConfusion failed:', e) }
  }

  async function resolveAlert(id: string) {
    try {
      await ipc.invoke('attentionAlerts:resolve', { id })
      setStatus('Alert resolved.')
      await refresh()
    } catch (e) { console.error('resolveAlert failed:', e) }
  }

  async function endClassSession(id: string) {
    try {
      await ipc.invoke('class:end', { id })
      setStatus('Class session ended.')
      await refresh()
    } catch (e) { console.error('endClassSession failed:', e) }
  }

  // Primary tabs in the main tab strip.
  const tools: Array<{ id: WorkspaceTool; label: string; icon: React.ReactNode }> = [
    { id: 'today',      label: 'Today',     icon: <PanelTop size={14} /> },
    { id: 'notes',      label: 'Notes',     icon: <FileText size={14} /> },
    { id: 'calendar',   label: 'Calendar',  icon: <CalendarDays size={14} /> },
    { id: 'grades',     label: 'Grades',    icon: <BarChart3 size={14} /> },
    { id: 'deadlines',  label: 'Deadlines', icon: <Clock3 size={14} /> },
    { id: 'quiz',       label: 'Quiz',      icon: <HelpCircle size={14} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <Layers size={14} /> },
    { id: 'materials',  label: 'Materials', icon: <Folder size={14} /> },
  ]
  // Overflow menu for less-used tools.
  const demotedTools: Array<{ id: WorkspaceTool; label: string; icon: React.ReactNode; hint?: string }> = [
    { id: 'daily',      label: 'Daily Journal', icon: <CalendarDays size={14} />, hint: 'Reflection & journaling' },
    { id: 'map',        label: 'Map',           icon: <Network size={14} />,      hint: 'Relationship graph' },
  ]
  const [showMoreTools, setShowMoreTools] = useState(false)
  const moreToolsRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!showMoreTools) return
    const onDoc = (e: MouseEvent) => {
      if (moreToolsRef.current && !moreToolsRef.current.contains(e.target as Node)) setShowMoreTools(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMoreTools(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [showMoreTools])

  // ── SurfSense-style three-column shell render ─────────────────────────────
  const exportDeadlines = async () => {
    const result = await ipc.invoke<{ written: boolean; path: string; count: number } | null>(
      'calendar:exportDeadlines',
      { courseId: selectedCourseId ?? undefined }
    )
    if (result) {
      setStatus(`Exported ${result.count} deadline${result.count === 1 ? '' : 's'} to ${result.path.split('/').pop()}`)
      setTimeout(() => setStatus(''), 4000)
    }
  }

  const sourcesContent = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-white/50">Upcoming Deadlines</span>
          <div className="flex items-center gap-2">
            {orderedVisibleDeadlines.length > 0 && (
              <button
                onClick={exportDeadlines}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold text-white/55 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
                title="Export to .ics calendar file"
              >
                <CalendarDays size={9} />Export
              </button>
            )}
            <span className="text-2xs text-white/40">{orderedVisibleDeadlines.length}</span>
          </div>
        </div>
        {orderedVisibleDeadlines.length > 0 ? (
          <div className="space-y-1.5">
            {orderedVisibleDeadlines.slice(0, 6).map(d => {
              // Three buckets: overdue (past), today (within 24h), future
              // (Nd). The previous code clamped past dates to 0 with
              // Math.max(0, …) and labelled them all TODAY, which is why
              // every past deadline read TODAY instead of OVERDUE.
              const msDelta = d.deadlineAt - Date.now()
              const isOverdue = msDelta < 0
              const isToday = !isOverdue && msDelta < 86_400_000
              const daysLeft = Math.ceil(msDelta / 86_400_000)
              const sourceNote = d.sourceId ? notes.find(n => n.id === d.sourceId) : undefined
              const pillLabel = isOverdue ? 'OVERDUE' : isToday ? 'TODAY' : `${daysLeft}d`
              const isUrgent = isOverdue || isToday
              // Audit fix (P2.5): rows without a source note used to be
              // styled as buttons (hover state, click affordance) but had
              // onClick={undefined}. Now we collapse them to a non-button
              // container with default cursor — no false promise of click.
              const clickable = !!sourceNote
              return (
                <button
                  key={d.id}
                  onClick={clickable ? () => setSelected(sourceNote!) : undefined}
                  disabled={!clickable}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-lg border transition-colors group',
                    !clickable && 'cursor-default',
                    isOverdue
                      ? clickable ? 'bg-[var(--sd-danger-soft)] border-[var(--sd-danger)] hover:bg-[var(--sd-danger-soft)]' : 'bg-[var(--sd-danger-soft)] border-[var(--sd-danger)]'
                      : isToday
                        ? clickable ? 'bg-[var(--sd-warn-soft)] border-[var(--sd-warn)] hover:bg-[var(--sd-warn-soft)]' : 'bg-[var(--sd-warn-soft)] border-[var(--sd-warn)]'
                        : clickable ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]' : 'bg-white/[0.03] border-white/[0.06]'
                  )}
                  title={clickable ? 'Open source note' : 'No source note linked'}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <CalendarDays size={11} className={isOverdue ? 'text-[var(--sd-danger)]' : isToday ? 'text-[var(--sd-warn)]' : 'text-white/55'} />
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white/90">{d.title}</span>
                    <span className={cn(
                      'shrink-0 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tabular-nums',
                      isOverdue ? 'bg-[var(--sd-danger-soft)] text-[var(--sd-danger)]'
                        : isToday ? 'bg-[var(--sd-warn-soft)] text-[var(--sd-warn)]'
                        : 'bg-white/[0.06] text-white/60'
                    )}>{pillLabel}</span>
                  </div>
                  <div className="text-xs text-white/45">{formatDue(d.deadlineAt)}</div>
                  {sourceNote && (
                    <div className="mt-1 inline-flex items-center gap-1 text-2xs text-white/45 group-hover:text-blue-300">
                      <FileText size={9} /> {sourceNote.title.slice(0, 28)}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-white/35 italic px-2 py-3">No deadlines yet</div>
        )}
      </div>

      {activeAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-white/50">Local Alerts</span>
            <span className="text-2xs text-white/40">{activeAlerts.length}</span>
          </div>
          <div className="space-y-1.5">
            {activeAlerts.slice(0, 4).map(alert => (
              <div key={alert.id} className="px-2.5 py-2 rounded-lg bg-[var(--sd-warn-soft)] border border-[var(--sd-warn)]">
                <div className="flex items-start gap-2">
                  <Target size={11} className="text-[var(--sd-warn)] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/90 truncate">{alert.title}</div>
                    <div className="text-xs text-white/55 mt-0.5">{alert.reason}</div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="px-2 py-0.5 rounded text-2xs font-semibold bg-[var(--sd-success-soft)] text-[var(--sd-success)] hover:bg-[var(--sd-success-soft)] transition-colors"
                      >Resolve</button>
                      {/* Audit fix (P1.1): the attentionAlerts:snooze IPC was
                          declared, handler-implemented, and used by the
                          floating window — but the workspace had no Snooze
                          button. Added with two presets (1h, 1 day) so the
                          common cases don't need a date picker. */}
                      <button
                        onClick={() => ipc.invoke('attentionAlerts:snooze', { id: alert.id, snoozedUntil: Date.now() + 60 * 60 * 1000 }).then(() => refresh()).catch(() => {})}
                        className="px-2 py-0.5 rounded text-2xs font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
                        title="Snooze for 1 hour"
                      >Snooze 1h</button>
                      <button
                        onClick={() => ipc.invoke('attentionAlerts:snooze', { id: alert.id, snoozedUntil: Date.now() + 24 * 60 * 60 * 1000 }).then(() => refresh()).catch(() => {})}
                        className="px-2 py-0.5 rounded text-2xs font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
                        title="Snooze until tomorrow"
                      >Tomorrow</button>
                      <button
                        onClick={() => ipc.invoke('attentionAlerts:dismiss', { id: alert.id }).then(() => refresh()).catch(() => {})}
                        className="px-2 py-0.5 rounded text-2xs font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
                      >Dismiss</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Static-site publish button (used in materials panel)
  const publishStaticSite = async () => {
    try {
      const result = await ipc.invoke<{ written: boolean; outDir: string; noteCount: number } | null>(
        'notes:publishStaticSite',
        { courseId: selectedCourseId ?? undefined }
      )
      if (result) {
        setStatus(`Published ${result.noteCount} note${result.noteCount === 1 ? '' : 's'} to ${result.outDir}`)
        setTimeout(() => setStatus(''), 4500)
      }
    } catch (err) { console.warn('[publishStaticSite]', err) }
  }

  const materialsContent = (
    <div className="space-y-3">
      {selectedCourse ? (
        <>
          <MaterialsFolderRow
            course={selectedCourse}
            onPick={async () => {
              const updated = await ipc.invoke<Course | null>('course:pickMaterialsFolder', { courseId: selectedCourse.id })
              if (updated) {
                setCourses(prev => prev.map(c => c.id === updated.id ? updated : c))
                setStatus(`Watching ${updated.materialsFolderPath} for new files.`)
                setTimeout(() => setStatus(''), 3500)
              }
            }}
            onClear={async () => {
              const updated = await ipc.invoke<Course>('course:clearMaterialsFolder', { courseId: selectedCourse.id })
              setCourses(prev => prev.map(c => c.id === updated.id ? updated : c))
            }}
          />
          {(selectedCourse.materialsImportedFiles ?? []).filter(r => r.noteId).length > 0 && (
            <div>
              <div className="text-2xs font-bold uppercase tracking-wider text-white/50 mb-2">Imported files</div>
              <div className="space-y-1">
                {(selectedCourse.materialsImportedFiles ?? []).filter(r => r.noteId).slice(0, 20).map(r => {
                  const note = notes.find(n => n.id === r.noteId)
                  const fname = r.path.split('/').pop()
                  // DokuWiki-style backref count: how many notes embed a
                  // sourceQuote pointing at this material.
                  const usageCount = countMaterialUsages(notes, r.path)
                  return (
                    <button
                      key={r.path}
                      onClick={note ? () => setSelected(note) : undefined}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] text-left transition-colors"
                      title={usageCount > 0 ? `Cited in ${usageCount} note${usageCount === 1 ? '' : 's'}` : 'No citations yet'}
                    >
                      <FileText size={11} className="text-white/45 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm text-white/80">{fname}</span>
                      {usageCount > 0 && (
                        <span className="text-2xs px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/70 shrink-0 tabular-nums">
                          {usageCount}×
                        </span>
                      )}
                      <span className="text-2xs text-white/35 shrink-0">{new Date(r.importedAt).toLocaleDateString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {/* Static-site publish (MkDocs port) */}
          <div className="pt-3 border-t border-white/[0.06]">
            <button
              onClick={publishStaticSite}
              className="w-full px-3 py-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-white/80 hover:text-white transition-colors"
              title="Generate a browsable static HTML site from this course's notes"
            >
              Publish as static site…
            </button>
            <p className="text-2xs text-white/35 mt-1 leading-snug">
              Renders this course's notes as a folder of HTML pages with built-in search.
            </p>
          </div>
        </>
      ) : (
        <div className="text-xs text-white/40 italic px-2 py-3">
          Pick a course in the rail to manage its materials folder.
        </div>
      )}
    </div>
  )

  const studyContent = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-white/50">Study Queue</span>
          <span className="text-2xs text-white/40">{dueStudyItems.length}</span>
        </div>
        {dueStudyItems.length > 0 ? (
          <div className="space-y-1.5">
            {dueStudyItems.slice(0, 6).map(item => {
              const source = studySourceFor(item)
              return (
                <div key={item.id} className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-sm font-semibold text-white/90 truncate">{item.front}</div>
                  <div className="text-2xs text-white/45 mt-0.5 capitalize">{item.type}</div>
                  {source && (
                    <div className="study-source-strip">
                      <span>{studySourceLabel(source)}: {source.title}</span>
                      <button onClick={() => openStudyItemSource(item)}>Open source</button>
                    </div>
                  )}
                  {/* Audit fix (P0.1): Study sub-tab was readonly. Add the
                      same difficulty buttons the Cards tab uses so a user
                      can actually grade items from the right rail without
                      leaving Today. */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {(['again', 'hard', 'good', 'easy'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => reviewStudyItem(item.id, d)}
                        className="flex-1 px-1.5 py-1 rounded text-2xs font-semibold uppercase tracking-wider bg-white/[0.04] hover:bg-white/[0.10] text-white/70 hover:text-white transition-colors"
                        title={`Mark as ${d}`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-white/35 italic px-2 py-3">No items due</div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-white/50">Unresolved Questions</span>
          <span className="text-2xs text-white/40">{unresolvedConfusions.length}</span>
        </div>
        {unresolvedConfusions.length > 0 ? (
          <div className="space-y-1">
            {unresolvedConfusions.slice(0, 5).map(q => (
              <div key={q.id} className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="text-sm text-white/85 leading-snug">{q.question}</div>
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  {q.nextStep && (
                    <div className="text-2xs text-blue-300 capitalize flex-1 min-w-0 truncate">→ {q.nextStep.replace(/_/g, ' ')}</div>
                  )}
                  {/* Audit fix (P0.1): the Resolve action existed as IPC
                      (confusion:resolve) and as a handler (resolveConfusion)
                      but no button surfaced it from the right panel. */}
                  <button
                    onClick={() => resolveConfusion(q.id)}
                    className="shrink-0 px-2 py-0.5 rounded text-2xs font-semibold bg-[var(--sd-success-soft)] hover:bg-[var(--sd-success-soft)] text-[var(--sd-success)] hover:text-[var(--sd-success)] transition-colors"
                    title="Mark question as resolved"
                  >Resolve</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-white/35 italic px-2 py-3">No unresolved questions</div>
        )}
      </div>
    </div>
  )

  // Note Health (nashsu/llm_wiki port — lint heuristics, no LLM)
  const lintIssues = useMemo<LintIssue[]>(() => lintNotes(notes), [notes])
  const lintSummary = useMemo(() => summarizeIssues(lintIssues), [lintIssues])
  const healthContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs font-bold uppercase tracking-wider text-white/50">Note Health</span>
        <span className="text-2xs text-white/40">{lintIssues.length} issue{lintIssues.length === 1 ? '' : 's'}</span>
      </div>
      {lintIssues.length === 0 ? (
        <div className="text-center py-8 px-3">
          <div className="text-sm text-white/55">All clear</div>
          <div className="text-xs text-white/35 mt-1">No orphan links, missing parents, or stale notes.</div>
        </div>
      ) : (
        <>
          {lintSummary.warnCount > 0 && (
            <div className="text-xs text-[var(--sd-warn)] mb-2">
              {lintSummary.warnCount} warning{lintSummary.warnCount === 1 ? '' : 's'} · {lintSummary.infoCount} info
            </div>
          )}
          <div className="space-y-1.5">
            {lintIssues.slice(0, 30).map((issue, i) => (
              <button
                key={`${issue.noteId}-${issue.kind}-${i}`}
                onClick={() => {
                  const target = notes.find(n => n.id === issue.noteId)
                  if (target) setSelected(target)
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={
                    'text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ' +
                    (issue.severity === 'warn'
                      ? 'bg-[var(--sd-warn-soft)] text-[var(--sd-warn)] border border-[var(--sd-warn)]'
                      : 'bg-white/[0.06] text-white/55 border border-white/[0.08]')
                  }>
                    {issue.kind.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white/90 truncate">{issue.noteTitle}</div>
                <div className="text-xs text-white/55 mt-0.5">{issue.message}</div>
              </button>
            ))}
            {lintIssues.length > 30 && (
              <div className="text-xs text-white/40 italic px-2 py-1">
                +{lintIssues.length - 30} more issues
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  // ── Dashboard / Workspace view switch ──────────────────────────────────────
  const enterCourse = (courseId: string) => {
    setSelectedCourseId(courseId)
    setAppView('workspace')
    setSelected(pickDefaultWorkspaceNote(notes, courseId, true))
  }

  const handleCourseCreatedFromModal = (course: Course) => {
    setSelectedCourseId(course.id)
    setAppView('workspace')
    setActiveTool('materials')
    refresh({ defaultCourseId: course.id, avoidSyllabusDefault: true }).catch(() => {})
  }

  const openCourseMaterialsFromModal = (courseId: string) => {
    setSelectedCourseId(courseId)
    setAppView('workspace')
    setActiveTool('materials')
    setShowAddCourseModal(false)
    refresh({ defaultCourseId: courseId, avoidSyllabusDefault: true }).catch(() => {})
  }

  if (appView === 'dashboard') {
    return (
      <>
        <HomeDashboard
          courses={courses}
          deadlines={deadlines}
          alerts={alerts}
          assignments={assignments}
          studyItems={studyItems}
          onEnterCourse={enterCourse}
          onAddCourse={() => setShowAddCourseModal(true)}
        />
        {quickAdd && (
          <QuickAddSheet
            kind={quickAdd}
            form={quickAddForm}
            onChange={setQuickAddForm}
            onClose={() => setQuickAdd(null)}
            onSubmit={submitQuickAdd}
          />
        )}
        {showAddCourseModal && (
          <AddCourseModal
            onClose={() => setShowAddCourseModal(false)}
            onCourseCreated={handleCourseCreatedFromModal}
            onOpenMaterials={openCourseMaterialsFromModal}
            onStatus={setStatus}
          />
        )}
      </>
    )
  }

  return (
    <ShellContainer>
      <IconRail
        courses={courses}
        activeCourseId={selectedCourseId}
        onSelectCourse={(id) => {
          setSelectedCourseId(id)
          const firstNote = id ? notes.find(n => n.courseId === id) : undefined
          if (firstNote) setSelected(firstNote)
          setActiveTool('today')
        }}
        onAddCourse={() => setShowAddCourseModal(true)}
      />

      {/* Main Panel — tabs + WorkspaceSurface (SurfSense MainContentPanel) */}
      <MainPanel
        tabs={tools}
        activeTabId={activeTool}
        onTabSelect={(id) => setActiveTool(id as WorkspaceTool)}
        rightActions={
          <>
            {/* Audit fix (P0.2): Bell + Settings gear were decorative no-ops
                with a hardcoded red-dot. Removed. */}

            {/* More-tools overflow menu — only rendered when demotedTools is non-empty. */}
            {demotedTools.length > 0 && (
            <div className="relative" ref={moreToolsRef}>
              <button
                onClick={() => setShowMoreTools(v => !v)}
                aria-haspopup="menu"
                aria-expanded={showMoreTools}
                className={cn(
                  'h-7 px-2 rounded-md flex items-center gap-1 text-xs font-medium whitespace-nowrap transition-colors',
                  showMoreTools
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/55 hover:text-white/90 hover:bg-white/[0.04]'
                )}
                title="More tools"
              >
                <MoreHorizontal size={14} /> More
              </button>
              {showMoreTools && (
                <div role="menu" className="absolute right-0 top-[calc(100%+4px)] min-w-[220px] p-1 rounded-lg bg-[var(--sd-ink-0)] border border-white/[0.10] shadow-2xl z-50">
                  {demotedTools.map(t => (
                    <button
                      key={t.id}
                      role="menuitem"
                      onClick={() => { setActiveTool(t.id); setShowMoreTools(false) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-white/85 hover:bg-white/[0.06] text-left"
                      title={t.hint}
                    >
                      <span className="shrink-0 text-white/55">{t.icon}</span>
                      <span className="flex-1">{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            {!rightPanelOpen && (
              <button
                onClick={() => setRightPanelOpen(true)}
                className="ml-1 px-2.5 h-8 rounded-md flex items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
              >
                <PanelTop size={12} className="rotate-90" /> Studio
              </button>
            )}
          </>
        }
      >
        <WorkspaceSurface
          activeTool={activeTool}
          selected={selected}
          selectedText={selectedText}
          captures={visibleCaptures}
          notes={notes}
          courses={courses}
          deadlines={orderedVisibleDeadlines}
          assignments={visibleAssignments}
          studyItems={visibleStudyItems}
          confusions={unresolvedConfusions}
          alerts={activeAlerts}
          classSessions={visibleClassSessions}
          currentCourse={currentCourse}
          linkedAssignment={selectedLinkedAssignment}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onCreateFromFile={handleCreateFromFile}
          onAssignmentSave={handleToolSave('Assignment checklist saved.')}
          onSyllabusConfirm={handleToolSave('Syllabus deadlines imported.')}
          onFlashcardSave={handleToolSave('Flashcards saved to study queue.')}
          onQuizSave={(note: Note) => { setSelected(note); setStatus('Quiz draft created.'); refresh() }}
          onStartClass={startClass}
          onCompleteDeadline={completeDeadline}
          onReviewStudyItem={reviewStudyItem}
          onResolveConfusion={resolveConfusion}
          onResolveAlert={resolveAlert}
          onEndClassSession={endClassSession}
          onRefresh={refresh}
          onStatus={setStatus}
          onSelect={setSelected}
          riverIds={riverIds}
          onAddToRiver={addToRiver}
          onRemoveFromRiver={removeFromRiver}
          onNavigate={setActiveTool}
          onSelectCourse={(id) => {
            setSelectedCourseId(id)
            const firstNote = id ? notes.find(n => n.courseId === id) : undefined
            if (firstNote) setSelected(firstNote)
          }}
          onOpenPanic={() => setPanicOpen(true)}
          focusedMaterialNoteId={focusedMaterialNoteId}
          onOpenStudyItemSource={openStudyItemSource}
          getStudySourceInfo={studySourceFor}
        />
      </MainPanel>

      {/* Right Panel — Studio. NotebookLM affordance: vertical stack of
          generation cards (Brief, Study Guide, Quiz me, Open questions).
          Replaces the previous Documents sub-tab strip per user redesign
          request. */}
      {rightPanelOpen ? (
        <aside className="hidden md:flex w-[320px] shrink-0 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: 'var(--sd-ink-1)' }}>
          <StudioPanel
            notes={notes}
            confusions={unresolvedConfusions}
            courseId={currentCourse?.id}
            onOpenQuizMeBack={() => window.dispatchEvent(new CustomEvent('studydesk:quiz-me-back-open'))}
            hasActiveNote={!!selected}
            activeNoteId={selected?.id}
            activeNoteContent={selected?.content}
            onOpenNote={(n) => setSelected(n)}
            onCreateNote={async (title, content) => {
              const note = await ipc.invoke<Note>('notes:create', {
                title,
                content,
              })
              await refresh()
              setSelected(notes.find(n => n.id === note.id) ?? note)
              setActiveTool('today')
            }}
            onSaveFlashcards={async (cards) => {
              for (const c of cards) {
                await ipc.invoke('study:create', { front: c.front, back: c.back, courseId: currentCourse?.id })
              }
              refresh()
            }}
            onStatus={setStatus}
          />
        </aside>
      ) : (
        <RightPanelCollapsedButton
          onClick={() => setRightPanelOpen(true)}
          badge={orderedVisibleDeadlines.filter(d => Math.ceil((d.deadlineAt - Date.now()) / 86_400_000) <= 1).length}
        />
      )}

      {/* T1: Cross-course command palette. Cmd+K opens it from anywhere. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={notes}
        captures={captures}
        studyItems={studyItems}
        deadlines={deadlines}
        assignments={assignments}
        classSessions={classSessions}
        courses={courses}
        onPick={(hit: SearchHit) => {
          // Bug 4 fix: route via the pure decision function in
          // paletteRouter. The previous inline router treated 'capture'
          // and 'study' results as if they were notes — looked up
          // notes.find(...) which silently returned undefined for
          // non-note ids, so clicking a capture or study hit did nothing.
          const action = routePaletteHit(hit, notes)
          if (action.type === 'open-note') {
            if (action.note.courseId) setSelectedCourseId(action.note.courseId)
            setSelected(action.note)
            setActiveTool(action.tool)
          } else if (action.type === 'switch-tool') {
            if (action.courseId) setSelectedCourseId(action.courseId)
            setActiveTool(action.tool)
          }
          // 'noop' falls through silently — the only case is a note
          // that's been deleted between index build and click.
        }}
      />

      {/* T3: Panic mode — surfaces the most-likely-to-fail cards. */}
      <PanicModeModal
        open={panicOpen}
        onClose={() => setPanicOpen(false)}
        items={selectPanicItems(visibleStudyItems, { courseId: currentCourse?.id, limit: 20 })}
        getStudySourceInfo={studySourceFor}
        onOpenStudyItemSource={openStudyItemSource}
        onReview={async (id, difficulty) => {
          await reviewStudyItem(id, difficulty)
        }}
      />

      {/* Add Course Modal (workspace context) */}
      {showAddCourseModal && (
        <AddCourseModal
          onClose={() => setShowAddCourseModal(false)}
          onCourseCreated={handleCourseCreatedFromModal}
          onOpenMaterials={openCourseMaterialsFromModal}
          onStatus={setStatus}
        />
      )}

      {/* Status banner overlay */}
      {status && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 backdrop-blur-md flex items-center gap-3 text-sm text-blue-100 shadow-lg">
          {status}
          <button
            onClick={() => setStatus('')}
            className="text-blue-200/70 hover:text-blue-100 font-bold"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* QuickAdd overlay (form sheet for adding course/note/etc.) */}
      {quickAdd && (
        <QuickAddSheet
          kind={quickAdd}
          form={quickAddForm}
          onChange={setQuickAddForm}
          onClose={() => setQuickAdd(null)}
          onSubmit={submitQuickAdd}
        />
      )}
    </ShellContainer>
  )
}

function WorkspaceSurface({
  activeTool,
  selected,
  selectedText,
  captures,
  notes,
  courses,
  deadlines,
  assignments,
  studyItems,
  confusions,
  alerts,
  classSessions,
  currentCourse,
  linkedAssignment,
  onUpdate,
  onDelete,
  onCreate,
  onCreateFromFile,
  onAssignmentSave,
  onSyllabusConfirm,
  onFlashcardSave,
  onQuizSave,
  onStartClass,
  onCompleteDeadline,
  onReviewStudyItem,
  onResolveConfusion,
  onResolveAlert,
  onEndClassSession,
  onRefresh,
  onStatus,
  onSelect,
  riverIds,
  onAddToRiver,
  onRemoveFromRiver,
  onNavigate,
  onSelectCourse,
  onOpenPanic,
  focusedMaterialNoteId,
  onOpenStudyItemSource,
  getStudySourceInfo,
}: {
  activeTool: WorkspaceTool
  selected: Note | null
  selectedText: string
  captures: Capture[]
  notes: Note[]
  courses: Course[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  studyItems: StudyItem[]
  confusions: ConfusionItem[]
  alerts: AttentionAlert[]
  classSessions: ClassSession[]
  currentCourse?: Course
  linkedAssignment?: Assignment
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (type?: Note['documentType']) => Promise<void>
  onCreateFromFile: (input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
  onAssignmentSave: () => void
  onSyllabusConfirm: () => void
  onFlashcardSave: () => void
  onQuizSave: (note: Note) => void
  onStartClass: () => Promise<void>
  onCompleteDeadline: (id: string) => Promise<void>
  onReviewStudyItem: (id: string, difficulty: NonNullable<StudyItem['difficulty']>) => Promise<void>
  onResolveConfusion: (id: string) => Promise<void>
  onResolveAlert: (id: string) => Promise<void>
  onEndClassSession: (id: string) => Promise<void>
  onRefresh: () => void
  onStatus: (msg: string) => void
  onSelect: (note: Note) => void
  riverIds: string[]
  onAddToRiver: (noteId: string) => void
  onRemoveFromRiver: (noteId: string) => void
  /** Tab navigation, threaded down so widgets like the dashboard's
   *  "Review day" button can switch tabs without lifting state. */
  onNavigate: (tool: WorkspaceTool) => void
  onSelectCourse: (courseId: string | null) => void
  /** Opens the T3 panic-mode modal scoped to current course. */
  onOpenPanic: () => void
  focusedMaterialNoteId: string | null
  onOpenStudyItemSource: (item: StudyItem) => void
  getStudySourceInfo: (item: StudyItem) => StudySourceInfo | null
}) {
  switch (activeTool) {
    case 'dashboard':
      return (
        <DashboardView
          courses={courses}
          deadlines={deadlines}
          assignments={assignments}
          captures={captures}
          studyItems={studyItems}
          alerts={alerts}
          currentCourse={currentCourse}
          onCompleteDeadline={onCompleteDeadline}
          onResolveAlert={onResolveAlert}
          onNavigate={onNavigate}
        />
      )
    case 'notes':
      return <NotesListView notes={notes} currentCourse={currentCourse} onSelect={(n) => { onSelect(n); onNavigate('today') }} onCreate={onCreate} />
    case 'daily':
      return <DailyJournalView notes={notes} currentCourse={currentCourse} onUpdate={onUpdate} onRefresh={onRefresh} onSelect={onSelect} />
    case 'calendar':
      return <CourseCalendarView currentCourse={currentCourse} notes={notes} deadlines={deadlines} assignments={assignments} alerts={alerts} />
    case 'grades':
      return <GradeManagementView currentCourse={currentCourse} notes={notes} assignments={assignments} />
    case 'deadlines':
      // Ticket 1.1: full-width deadlines list. View toggle for Timeline
      // is rendered inline by DeadlinesView so the user can swap layouts.
      return <DeadlinesView deadlines={deadlines} notes={notes} captures={captures} studyItems={studyItems} courses={courses} courseId={currentCourse?.id} onSelectNote={onSelect} onCompleteDeadline={onCompleteDeadline} />
    case 'quiz':
      return <QuizView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} studyItems={studyItems} onReviewStudyItem={onReviewStudyItem} onRefresh={onRefresh} onOpenStudyItemSource={onOpenStudyItemSource} getStudySourceInfo={getStudySourceInfo} />
    case 'flashcards':
      return <FlashcardsView selectedText={selectedText} studyItems={studyItems} courseId={currentCourse?.id} onReviewStudyItem={onReviewStudyItem} onSave={onFlashcardSave} onStatus={onStatus} onOpenPanic={onOpenPanic} onOpenStudyItemSource={onOpenStudyItemSource} getStudySourceInfo={getStudySourceInfo} />
    case 'materials':
      // Ticket 1.1: materials gets its own tab now. The right-rail
      // Materials slot still exists for course-context-while-editing,
      // but the canonical surface is here.
      return (
        <MaterialsView
          selectedCourse={currentCourse}
          notes={notes}
          studyItems={studyItems}
          focusedMaterialNoteId={focusedMaterialNoteId}
          onCreateFromFile={onCreateFromFile}
          onSelectNote={onSelect}
          onRefresh={onRefresh}
          onStatus={onStatus}
          countMaterialUsages={countMaterialUsages}
          extractQuestionDraftsFromText={extractQuestionDraftsFromText}
          makeQuestionCandidateKey={makeQuestionCandidateKey}
          noteText={noteText}
        />
      )
    case 'assignment':
      return <AssignmentParserView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} deadlines={deadlines} onSave={onAssignmentSave} />
    case 'syllabus':
      return <SyllabusImportView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} onCreate={onCreate} onConfirm={onSyllabusConfirm} onRefresh={onRefresh} onStatus={onStatus} />
    case 'class':
      return <ClassModeView currentCourse={currentCourse} captures={captures} confusions={confusions} classSessions={classSessions} onStartClass={onStartClass} onResolveConfusion={onResolveConfusion} onEndClassSession={onEndClassSession} onRefresh={onRefresh} />
    case 'map':
      return <RelationMapView notes={notes} courses={courses} deadlines={deadlines} assignments={assignments} studyItems={studyItems} captures={captures} courseId={currentCourse?.id} onSelectNote={onSelect} />
    case 'timeline':
      return <TimelineView notes={notes} deadlines={deadlines} captures={captures} studyItems={studyItems} courses={courses} courseId={currentCourse?.id} onSelectNote={onSelect} />
    case 'today':
    default:
      return (
        <DashboardView
          courses={courses}
          deadlines={deadlines}
          assignments={assignments}
          captures={captures}
          studyItems={studyItems}
          alerts={alerts}
          currentCourse={currentCourse}
          onCompleteDeadline={onCompleteDeadline}
          onResolveAlert={onResolveAlert}
          onNavigate={onNavigate}
        />
      )
  }
}

// ── Grade Management tab ───────────────────────────────────────────────────
// Renderer-only first pass: syllabus weights + manual what-if scoring. This
// avoids a store/schema migration until the product shape proves itself.
interface GradeEntry {
  score: string
  possible: string
}

interface GradebookDraft {
  target: string
  entries: Record<string, GradeEntry>
}

const DEFAULT_GRADEBOOK: GradebookDraft = { target: '90', entries: {} }

function GradeManagementView({
  currentCourse,
  notes,
  assignments,
}: {
  currentCourse?: Course
  notes: Note[]
  assignments: Assignment[]
}) {
  const storageKey = `studydesk.gradebook.${currentCourse?.id ?? 'none'}`
  const syllabusNote = currentCourse
    ? notes
      .filter(n => n.courseId === currentCourse.id && n.documentType === 'syllabus')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined
  const syllabusText = syllabusNote ? noteText(syllabusNote.content) : ''
  const extractedComponents = syllabusText ? extractSyllabusGradingComponents(syllabusText) : []
  const components = normalizeGradeComponents(extractedComponents)

  const [draft, setDraft] = useState<GradebookDraft>(() => loadGradebookDraft(storageKey))

  useEffect(() => {
    setDraft(loadGradebookDraft(storageKey))
  }, [storageKey])

  useEffect(() => {
    if (!currentCourse) return
    localStorage.setItem(storageKey, JSON.stringify(draft))
  }, [currentCourse, draft, storageKey])

  if (!currentCourse) {
    return (
      <section className="phase3-card">
        <header className="phase3-header">
          <div>
            <p className="phase3-eyebrow">Grade Management</p>
            <h1>Pick a course</h1>
            <span>Select a course with an imported syllabus to calculate grade progress and what-if targets.</span>
          </div>
        </header>
      </section>
    )
  }

  const target = clampPercent(Number.parseFloat(draft.target) || 0)
  const rows = components.map(component => {
    const entry = draft.entries[component.key] ?? { score: '', possible: '100' }
    const score = Number.parseFloat(entry.score)
    const possible = Number.parseFloat(entry.possible)
    const hasScore = Number.isFinite(score) && Number.isFinite(possible) && possible > 0
    const percent = hasScore ? clampPercent((score / possible) * 100) : undefined
    const weightedEarned = percent === undefined ? 0 : component.weight * (percent / 100)
    return { ...component, entry, hasScore, percent, weightedEarned }
  })

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0)
  const gradedWeight = rows.reduce((sum, row) => sum + (row.hasScore ? row.weight : 0), 0)
  const remainingWeight = Math.max(0, totalWeight - gradedWeight)
  const earnedWeighted = rows.reduce((sum, row) => sum + row.weightedEarned, 0)
  const currentAverage = gradedWeight > 0 ? (earnedWeighted / gradedWeight) * 100 : undefined
  const projectedWeighted = earnedWeighted + (remainingWeight * ((currentAverage ?? target) / 100))
  const projectedFinal = totalWeight > 0 ? (projectedWeighted / totalWeight) * 100 : 0
  const targetWeighted = totalWeight * (target / 100)
  const neededOnRemaining = remainingWeight > 0 ? ((targetWeighted - earnedWeighted) / remainingWeight) * 100 : undefined
  const courseAssignments = assignments.filter(a => a.courseId === currentCourse.id && a.status !== 'archived')
  const recommendations = gradeFocusRecommendations(rows, target, neededOnRemaining)

  function updateEntry(key: string, patch: Partial<GradeEntry>) {
    setDraft(prev => ({
      ...prev,
      entries: {
        ...prev.entries,
        [key]: { ...(prev.entries[key] ?? { score: '', possible: '100' }), ...patch },
      },
    }))
  }

  return (
    <section className="phase3-card gradebook-view">
      <header className="phase3-header gradebook-header">
        <div>
          <p className="phase3-eyebrow">Grade Management</p>
          <h1>{currentCourse.code ?? currentCourse.name}</h1>
          <span>
            {components.length > 0
              ? `${components.length} syllabus grading component${components.length === 1 ? '' : 's'} · ${formatGradePercent(totalWeight)} total weight`
              : 'No syllabus grading components captured yet.'}
          </span>
        </div>
        <div className="gradebook-target">
          <label htmlFor="target-grade">Target grade</label>
          <div>
            <input
              id="target-grade"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={draft.target}
              onChange={e => setDraft(prev => ({ ...prev, target: e.target.value }))}
            />
            <span>%</span>
          </div>
        </div>
      </header>

      {components.length === 0 ? (
        <div className="gradebook-empty">
          <BarChart3 size={22} />
          <strong>No grade weights found</strong>
          <span>Import a syllabus with a grading section to start the grade calculator.</span>
        </div>
      ) : (
        <div className="gradebook-grid">
          <section className="phase3-panel gradebook-components">
            <h2>Grade components</h2>
            <div className="gradebook-component-list">
              {rows.map(row => (
                <article key={row.key} className="gradebook-component">
                  <div>
                    <strong>{row.title}</strong>
                    <span>{formatGradePercent(row.weight)} of final grade</span>
                  </div>
                  <label>
                    Score
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.entry.score}
                      onChange={e => updateEntry(row.key, { score: e.target.value })}
                      placeholder="--"
                    />
                  </label>
                  <label>
                    Out of
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.entry.possible}
                      onChange={e => updateEntry(row.key, { possible: e.target.value })}
                    />
                  </label>
                  <output>{row.percent === undefined ? 'Not entered' : `${formatGradePercent(row.percent)}% earned`}</output>
                </article>
              ))}
            </div>
          </section>

          <section className="phase3-panel gradebook-summary">
            <h2>What-if calculator</h2>
            <div className="gradebook-metrics">
              <GradeMetric label="Current average" value={currentAverage === undefined ? '--' : `${formatGradePercent(currentAverage)}%`} />
              <GradeMetric label="Weighted earned" value={`${formatGradePercent(earnedWeighted)} / ${formatGradePercent(totalWeight)}`} />
              <GradeMetric label="Projected final" value={`${formatGradePercent(projectedFinal)}%`} />
              <GradeMetric label="Needed on remaining" value={neededOnRemaining === undefined ? 'Complete' : `${formatGradePercent(neededOnRemaining)}%`} warn={neededOnRemaining !== undefined && neededOnRemaining > 100} />
            </div>

            <div className="gradebook-progress" aria-label="Weighted grade progress">
              <span style={{ width: `${Math.min(100, (earnedWeighted / Math.max(totalWeight, 1)) * 100)}%` }} />
            </div>
            <p>
              {remainingWeight > 0
                ? `${formatGradePercent(remainingWeight)}% of the course is still unscored.`
                : 'All weighted components have manual scores.'}
            </p>
          </section>

          <section className="phase3-panel gradebook-focus">
            <h2>Focus recommendations</h2>
            {recommendations.length === 0 ? (
              <CourseCalendarEmpty text="Enter scores to generate focus recommendations." />
            ) : (
              <ul>
                {recommendations.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>

          <section className="phase3-panel gradebook-context">
            <h2>Course context</h2>
            <div className="gradebook-context-list">
              <span><GraduationCap size={13} /> {currentCourse.professorName ?? 'Instructor not captured'}</span>
              <span><CalendarDays size={13} /> {currentCourse.term ?? 'Term not captured'}</span>
              <span><ClipboardList size={13} /> {courseAssignments.length} active assignment{courseAssignments.length === 1 ? '' : 's'}</span>
              <span><BookOpen size={13} /> {syllabusNote ? syllabusNote.title : 'No syllabus source note'}</span>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function GradeMetric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('gradebook-metric', warn && 'gradebook-metric-warn')}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function loadGradebookDraft(storageKey: string): GradebookDraft {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return DEFAULT_GRADEBOOK
    const parsed = JSON.parse(raw) as Partial<GradebookDraft>
    return {
      target: typeof parsed.target === 'string' ? parsed.target : DEFAULT_GRADEBOOK.target,
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    }
  } catch {
    return DEFAULT_GRADEBOOK
  }
}

function normalizeGradeComponents(components: SyllabusGradingComponent[]) {
  return components.map(component => ({
    key: component.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: component.title,
    weight: Number.parseFloat(component.weight),
  })).filter(component => component.key && Number.isFinite(component.weight) && component.weight > 0)
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatGradePercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function gradeFocusRecommendations(
  rows: Array<ReturnType<typeof normalizeGradeComponents>[number] & { hasScore: boolean; percent?: number }>,
  target: number,
  neededOnRemaining?: number
) {
  const recommendations: string[] = []
  const unscored = rows.filter(row => !row.hasScore).sort((a, b) => b.weight - a.weight)
  if (unscored[0]) recommendations.push(`Prioritize ${unscored[0].title}; it still controls ${formatGradePercent(unscored[0].weight)}% of the final grade.`)
  if (unscored[1]) recommendations.push(`Next highest open lever: ${unscored[1].title} at ${formatGradePercent(unscored[1].weight)}%.`)

  const belowTarget = rows
    .filter(row => row.hasScore && row.percent !== undefined && row.percent < target)
    .sort((a, b) => ((target - (b.percent ?? 0)) * b.weight) - ((target - (a.percent ?? 0)) * a.weight))
  if (belowTarget[0]) recommendations.push(`${belowTarget[0].title} is below target; improving it has the largest scored-component impact.`)

  if (neededOnRemaining !== undefined) {
    if (neededOnRemaining > 100) recommendations.push('The current target is mathematically out of reach without extra credit or changed weights.')
    else if (neededOnRemaining >= 90) recommendations.push(`Remaining work needs about ${formatGradePercent(neededOnRemaining)}% on average, so focus on high-weight components first.`)
    else recommendations.push(`Target is reachable with about ${formatGradePercent(neededOnRemaining)}% average on remaining work.`)
  }

  return recommendations.slice(0, 4)
}

// ── Deadlines tab ─────────────────────────────────────────────────────────
// Full-width view of all deadlines with a List ↔ Timeline view toggle.
// Replaces the old `timeline` standalone tab — Timeline is now a render
// mode within Deadlines, per Ticket 1.1.
function DeadlinesView({
  deadlines, notes, captures, studyItems, courses, courseId, onSelectNote, onCompleteDeadline,
}: {
  deadlines: AcademicDeadline[]
  notes: Note[]
  captures: Capture[]
  studyItems: StudyItem[]
  courses: Course[]
  courseId?: string
  onSelectNote: (n: Note) => void
  onCompleteDeadline: (id: string) => Promise<void>
}) {
  const [view, setView] = useState<'list' | 'timeline'>('list')
  const filtered = deadlines.filter(d => !courseId || d.courseId === courseId).sort((a, b) => a.deadlineAt - b.deadlineAt)
  return (
    <section className="phase3-card">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Deadlines</p>
          <h1>{filtered.length} upcoming</h1>
          <span>List view groups by status; Timeline view plots by week.</span>
        </div>
        <div className="phase3-actions" role="tablist" aria-label="Deadlines view mode">
          <button
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={cn('outline-button', view === 'list' && 'review-button')}
          >List</button>
          <button
            role="tab"
            aria-selected={view === 'timeline'}
            onClick={() => setView('timeline')}
            className={cn('outline-button', view === 'timeline' && 'review-button')}
          >Timeline</button>
        </div>
      </header>
      {view === 'timeline' ? (
        <TimelineView notes={notes} deadlines={deadlines} captures={captures} studyItems={studyItems} courses={courses} courseId={courseId} onSelectNote={onSelectNote} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No deadlines" description="No deadlines for this course yet. Import a syllabus or add them manually." />
      ) : (
        <div className="px-4 pb-4 space-y-1.5">
          {filtered.map(d => {
            const msDelta = d.deadlineAt - Date.now()
            const isOverdue = msDelta < 0 && !d.completed
            const isToday   = !isOverdue && msDelta < 86_400_000
            const daysLeft  = Math.ceil(msDelta / 86_400_000)
            const sourceNote = d.sourceId ? notes.find(n => n.id === d.sourceId) : undefined
            const pillLabel = d.completed ? 'DONE' : isOverdue ? 'OVERDUE' : isToday ? 'TODAY' : `${daysLeft}d`
            return (
              <div
                key={d.id}
                className={cn(
                  'px-3 py-2.5 rounded-lg border flex items-center gap-3',
                  d.completed
                    ? 'bg-[var(--sd-success-soft)] border-[var(--sd-success)] opacity-70'
                    : isOverdue ? 'bg-[var(--sd-danger-soft)] border-[var(--sd-danger)]'
                    : isToday   ? 'bg-[var(--sd-warn-soft)] border-[var(--sd-warn)]'
                    : 'bg-white/[0.03] border-white/[0.06]'
                )}
              >
                <CalendarDays size={13} className={d.completed ? 'text-[var(--sd-success)]' : isOverdue ? 'text-[var(--sd-danger)]' : isToday ? 'text-[var(--sd-warn)]' : 'text-white/55'} />
                <button
                  onClick={sourceNote ? () => onSelectNote(sourceNote) : undefined}
                  disabled={!sourceNote}
                  className={cn('flex-1 min-w-0 text-left', !sourceNote && 'cursor-default')}
                  title={sourceNote ? 'Open source note' : undefined}
                >
                  <div className="text-md font-semibold text-white/95 truncate">{d.title}</div>
                  <div className="text-xs text-white/55">{formatDue(d.deadlineAt)}{d.type ? ` · ${d.type}` : ''}</div>
                </button>
                <span className={cn(
                  'shrink-0 px-2 py-0.5 rounded text-2xs font-bold uppercase tabular-nums',
                  d.completed ? 'bg-[var(--sd-success-soft)] text-[var(--sd-success)]'
                    : isOverdue ? 'bg-[var(--sd-danger-soft)] text-[var(--sd-danger)]'
                    : isToday ? 'bg-[var(--sd-warn-soft)] text-[var(--sd-warn)]'
                    : 'bg-white/[0.06] text-white/60'
                )}>{pillLabel}</span>
                {!d.completed && (
                  <button
                    onClick={() => onCompleteDeadline(d.id)}
                    className="shrink-0 px-2 py-0.5 rounded text-2xs font-semibold bg-[var(--sd-success-soft)] text-[var(--sd-success)] hover:bg-[var(--sd-success-soft)] transition-colors"
                  >Complete</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Course Calendar tab ────────────────────────────────────────────────────
// Renderer-only view over existing course, syllabus note, deadline, assignment,
// and alert data. When a syllabus schedule exists, it becomes the primary
// calendar surface; generic deadlines stay supplemental.
function CourseCalendarView({
  currentCourse,
  notes,
  deadlines,
  assignments,
  alerts,
}: {
  currentCourse?: Course
  notes: Note[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  alerts: AttentionAlert[]
}) {
  if (!currentCourse) {
    return (
      <section className="phase3-card">
        <header className="phase3-header">
          <div>
            <p className="phase3-eyebrow">Course Calendar</p>
            <h1>Pick a course</h1>
            <span>Import or select a course to see upcoming work, readings, and preparation tasks.</span>
          </div>
        </header>
      </section>
    )
  }

  const syllabusNote = notes
    .filter(n => n.courseId === currentCourse.id && n.documentType === 'syllabus')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const syllabusText = syllabusNote ? noteText(syllabusNote.content) : ''
  const scheduleRows = syllabusText ? extractSyllabusScheduleRows(syllabusText) : []

  const activeAssignments = assignments
    .filter(a => a.status !== 'archived' && a.status !== 'submitted')
    .sort((a, b) => (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER))

  const upcomingDeadlines = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)

  const assignmentDeadlineIds = new Set(upcomingDeadlines.map(d => d.assignmentId).filter(Boolean))
  const assignmentDueItems = activeAssignments
    .filter(a => a.dueDate && !assignmentDeadlineIds.has(a.id))
    .map(a => ({
      id: `assignment-${a.id}`,
      title: a.title,
      detail: a.description || `${a.priority} priority assignment`,
      date: a.dueDate,
      type: 'assignment',
    }))

  const alertDueItems = alerts
    .filter(a => a.dueAt)
    .map(a => ({
      id: `alert-${a.id}`,
      title: a.title,
      detail: a.reason,
      date: a.dueAt,
      type: a.sourceType,
    }))

  const comingUp = [
    ...upcomingDeadlines.map(d => ({
      id: `deadline-${d.id}`,
      title: d.title,
      detail: d.type.replace('_', ' '),
      date: d.deadlineAt,
      type: d.type,
    })),
    ...assignmentDueItems,
    ...alertDueItems,
  ].sort((a, b) => (a.date ?? Number.MAX_SAFE_INTEGER) - (b.date ?? Number.MAX_SAFE_INTEGER)).slice(0, 8)

  const readingItems = upcomingDeadlines
    .filter(d => d.type === 'reading' || /\b(read|chapter|case|article|coursepack)\b/i.test(d.title))
    .slice(0, 6)

  const dueAssignments = [
    ...upcomingDeadlines.filter(d => ['assignment', 'project', 'presentation', 'quiz', 'exam'].includes(d.type)),
    ...assignmentDueItems.map(a => ({
      id: a.id,
      title: a.title,
      deadlineAt: a.date ?? 0,
      type: 'assignment' as AcademicDeadline['type'],
      completed: false,
    })),
  ].sort((a, b) => a.deadlineAt - b.deadlineAt).slice(0, 6)

  const prepAlerts = alerts
    .filter(a => a.sourceType === 'setup' || a.sourceType === 'class_action' || /\b(prepare|setup|before class|review|bring)\b/i.test(`${a.title} ${a.reason}`))
    .slice(0, 6)

  const prepMeetings = upcomingDeadlines
    .filter(d => d.type === 'office_hours' || d.type === 'meeting')
    .slice(0, 3)

  const nextDate = comingUp[0]?.date

  if (scheduleRows.length > 0) {
    const milestoneCount = scheduleRows.reduce((sum, row) => sum + row.milestones.length, 0)
    const prepCount = scheduleRows.reduce((sum, row) => sum + row.readings.length + row.prepItems.length, 0)
    return (
      <section className="phase3-card course-calendar-view">
        <header className="phase3-header course-calendar-schedule-header">
          <div>
            <p className="phase3-eyebrow">Course Calendar</p>
            <h1>{currentCourse.code ?? currentCourse.name}</h1>
            <span>
              {scheduleRows.length} syllabus week{scheduleRows.length === 1 ? '' : 's'} · {prepCount} prep item{prepCount === 1 ? '' : 's'} · {milestoneCount} milestone{milestoneCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="course-calendar-meta" aria-label="Course details">
            <span><BookOpen size={13} /> {currentCourse.name}</span>
            {currentCourse.professorName && <span><GraduationCap size={13} /> {currentCourse.professorName}</span>}
            {currentCourse.location && <span><PanelTop size={13} /> {currentCourse.location}</span>}
            {currentCourse.term && <span><CalendarDays size={13} /> {currentCourse.term}</span>}
          </div>
        </header>

        <div className="syllabus-calendar-list">
          {scheduleRows.map((row, index) => (
            <SyllabusCalendarWeek
              key={`${row.weekLabel}-${row.dateLabel}-${index}`}
              row={row}
              supplementalMilestones={milestonesForScheduleRow(row, upcomingDeadlines, activeAssignments)}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="phase3-card course-calendar-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Course Calendar</p>
          <h1>{currentCourse.code ?? currentCourse.name}</h1>
          <span>
            {nextDate
              ? `Next up: ${comingUp[0].title} on ${formatCalendarDate(nextDate)}.`
              : 'No dated work is available yet. Import a syllabus to populate the course calendar.'}
          </span>
        </div>
        <div className="course-calendar-meta" aria-label="Course details">
          <span><BookOpen size={13} /> {currentCourse.name}</span>
          {currentCourse.professorName && <span><GraduationCap size={13} /> {currentCourse.professorName}</span>}
          {currentCourse.location && <span><PanelTop size={13} /> {currentCourse.location}</span>}
          {currentCourse.term && <span><CalendarDays size={13} /> {currentCourse.term}</span>}
        </div>
      </header>

      <div className="course-calendar-grid">
        <section className="phase3-panel course-calendar-main">
          <h2>Coming up</h2>
          {comingUp.length === 0 ? (
            <CourseCalendarEmpty text="No upcoming course items yet." />
          ) : comingUp.map((item, index) => (
            <CourseCalendarRow
              key={item.id}
              icon={<CalendarDays size={15} />}
              title={item.title}
              detail={`${formatCalendarDate(item.date)} · ${item.detail}`}
              meta={index === 0 ? 'Next' : item.type.replace('_', ' ')}
              urgent={isDueSoon(item.date)}
            />
          ))}
        </section>

        <section className="phase3-panel">
          <h2>Read before class</h2>
          {readingItems.length === 0 ? (
            <CourseCalendarEmpty text="No syllabus schedule rows captured yet." />
          ) : readingItems.map(item => (
            <CourseCalendarRow
              key={item.id}
              icon={<BookOpen size={15} />}
              title={item.title}
              detail={formatCalendarDate(item.deadlineAt)}
              meta="Reading"
              urgent={isDueSoon(item.deadlineAt)}
            />
          ))}
        </section>

        <section className="phase3-panel">
          <h2>Assignments due</h2>
          {dueAssignments.length === 0 ? (
            <CourseCalendarEmpty text="No active assignment due dates yet." />
          ) : dueAssignments.map(item => (
            <CourseCalendarRow
              key={item.id}
              icon={<ClipboardList size={15} />}
              title={item.title}
              detail={formatCalendarDate(item.deadlineAt)}
              meta={item.type.replace('_', ' ')}
              urgent={isDueSoon(item.deadlineAt)}
            />
          ))}
        </section>

        <section className="phase3-panel">
          <h2>Prepare before class</h2>
          {prepAlerts.length === 0 && prepMeetings.length === 0 ? (
            <CourseCalendarEmpty text="No setup or class prep alerts yet." />
          ) : (
            <>
              {prepAlerts.map(alert => (
                <CourseCalendarRow
                  key={alert.id}
                  icon={<Target size={15} />}
                  title={alert.title}
                  detail={alert.reason}
                  meta={alert.actionLabel || alert.priority}
                  urgent={alert.priority === 'critical' || alert.priority === 'high'}
                />
              ))}
              {prepMeetings.map(item => (
                <CourseCalendarRow
                  key={item.id}
                  icon={<Clock3 size={15} />}
                  title={item.title}
                  detail={formatCalendarDate(item.deadlineAt)}
                  meta={item.type.replace('_', ' ')}
                  urgent={isDueSoon(item.deadlineAt)}
                />
              ))}
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function SyllabusCalendarWeek({
  row,
  supplementalMilestones,
}: {
  row: SyllabusScheduleRow
  supplementalMilestones: string[]
}) {
  const prepItems = [...row.readings, ...row.prepItems]
  const milestones = uniqueCalendarLabels([...row.milestones, ...supplementalMilestones])
  return (
    <article className="syllabus-calendar-week">
      <div className="syllabus-calendar-date">
        <strong>{row.weekLabel}</strong>
        <span>{row.dateLabel}</span>
      </div>
      <div className="syllabus-calendar-body">
        {row.theme && <div className="syllabus-calendar-theme">{row.theme}</div>}
        <h2>{row.topic}</h2>
        <div className="syllabus-calendar-lanes">
          <SyllabusCalendarLane
            icon={<BookOpen size={14} />}
            label="Class prep"
            empty="No readings or prep captured"
            items={prepItems}
          />
          <SyllabusCalendarLane
            icon={<Target size={14} />}
            label="Milestones"
            empty="No assignment or exam milestone"
            items={milestones}
          />
        </div>
      </div>
    </article>
  )
}

function SyllabusCalendarLane({
  icon,
  label,
  empty,
  items,
}: {
  icon: React.ReactNode
  label: string
  empty: string
  items: string[]
}) {
  return (
    <section className="syllabus-calendar-lane">
      <h3>{icon}{label}</h3>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
    </section>
  )
}

function CourseCalendarRow({
  icon,
  title,
  detail,
  meta,
  urgent,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  meta: string
  urgent?: boolean
}) {
  return (
    <div className={cn('course-calendar-row', urgent && 'course-calendar-row-urgent')}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <em>{detail}</em>
      </div>
      <small>{meta}</small>
    </div>
  )
}

function CourseCalendarEmpty({ text }: { text: string }) {
  return <div className="course-calendar-empty">{text}</div>
}

function uniqueCalendarLabels(values: string[]) {
  const seen = new Set<string>()
  return values.map(v => v.trim()).filter(Boolean).filter(value => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function milestonesForScheduleRow(row: SyllabusScheduleRow, deadlines: AcademicDeadline[], assignments: Assignment[]) {
  if (!row.startAt && !row.endAt) return []
  const start = startOfDay(row.startAt ?? row.endAt!)
  const end = endOfDay(row.endAt ?? row.startAt!)
  const deadlineLabels = deadlines
    .filter(d => d.deadlineAt >= start && d.deadlineAt <= end && d.type !== 'reading')
    .map(d => d.title)
  const assignmentLabels = assignments
    .filter(a => a.dueDate && a.dueDate >= start && a.dueDate <= end)
    .map(a => a.title)
  return uniqueCalendarLabels([...deadlineLabels, ...assignmentLabels])
}

function startOfDay(value: number) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(value: number) {
  const d = new Date(value)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function formatCalendarDate(value?: number) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function isDueSoon(value?: number) {
  if (!value) return false
  const delta = value - Date.now()
  return delta < 3 * 86_400_000
}

function DocumentWorkspace({
  selected,
  selectedText,
  captures,
  notes,
  courses,
  studyItems,
  riverIds,
  currentCourse,
  linkedAssignment,
  onUpdate,
  onDelete,
  onCreate,
  onCreateFromFile,
  onRefresh,
  onSelect,
  onAddToRiver,
  onRemoveFromRiver,
  onStatus,
}: {
  selected: Note | null
  selectedText: string
  captures: Capture[]
  notes: Note[]
  courses: Course[]
  studyItems: StudyItem[]
  riverIds: string[]
  onAddToRiver: (noteId: string) => void
  onRemoveFromRiver: (noteId: string) => void
  currentCourse?: Course
  linkedAssignment?: Assignment
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (type?: Note['documentType']) => Promise<void>
  onCreateFromFile: (input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
  onRefresh: () => void
  onSelect: (n: Note) => void
  /** Status-toast pass-through so export failures and other end-of-flow
   *  events can surface to the user instead of dying in console.warn. */
  onStatus: (msg: string) => void
}) {
  const [questionStatus, setQuestionStatus] = useState('')
  // Attic revisions UI (DokuWiki port)
  const [showRevisions, setShowRevisions] = useState(false)
  // T2 (REDESIGN_PLAN_V2): "Quiz me back" — extract candidate cards
  // from the active note and let the user grade Keep/Skip/Edit each
  // before any of them become real study items. AI-as-draft principle.
  const [showQuizMeBack, setShowQuizMeBack] = useState(false)
  const [quizCandidates, setQuizCandidates] = useState<ReadonlyArray<import('./lib/extractCards').CardCandidate>>([])
  function openQuizMeBack() {
    if (!selected) return
    import('./lib/extractCards').then(({ extractCardCandidates }) => {
      const cands = extractCardCandidates(selected.content)
      setQuizCandidates(cands)
      setShowQuizMeBack(true)
    })
  }

  // Listen for the Studio panel's "Quiz me back" / "Panic mode" trigger
  // events. DOM event bridge avoids lifting modal state to App level.
  useEffect(() => {
    const onQuiz = () => openQuizMeBack()
    window.addEventListener('studydesk:quiz-me-back-open', onQuiz)
    return () => {
      window.removeEventListener('studydesk:quiz-me-back-open', onQuiz)
    }
  }, [selected])
  // UX: collapse the noisy export/history/delete row behind a single
  // "More" menu so the document header is breathable. Inline buttons
  // remain only for actions that are contextual (Create question on
  // selection) or genuinely primary (+ Subpage).
  const [showMore, setShowMore] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!showMore) return
    const onDoc = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMore(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMore(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [showMore])
  const [revisions, setRevisions] = useState<Array<{ timestamp: number; size: number; title: string }>>([])
  useEffect(() => {
    if (!showRevisions || !selected) { setRevisions([]); return }
    let cancelled = false
    ipc.invoke<Array<{ timestamp: number; size: number; title: string }>>('notes:listRevisions', { noteId: selected.id })
      .then(list => { if (!cancelled) setRevisions(list) })
      .catch(() => { if (!cancelled) setRevisions([]) })
    return () => { cancelled = true }
  }, [showRevisions, selected?.id])

  async function restoreRevision(timestamp: number) {
    if (!selected) return
    try {
      const restored = await ipc.invoke<Note>('notes:restoreRevision', { noteId: selected.id, timestamp })
      setShowRevisions(false)
      onSelect(restored)
      onRefresh()
    } catch (e) {
      console.warn('[restoreRevision]', e)
    }
  }

  // Reverse-link discovery: scan all notes' content (TipTap JSON serialized
  // as a string) for occurrences of the current note's id inside a noteLink
  // mark. Cheap because we already have all notes in memory and the content
  // is just a string. ~O(n) per render, acceptable for hundreds of notes.
  const backlinks = useMemo(() => {
    if (!selected) return []
    const targetId = selected.id
    return notes.filter(n => {
      if (n.id === targetId) return false
      // The TipTap JSON string contains `"noteId":"<id>"` for each link
      return typeof n.content === 'string' && n.content.includes(`"noteId":"${targetId}"`)
    })
  }, [notes, selected])

  // Hierarchical subpages (port from suitenumerique/docs): walk parentId
  // chain to build the breadcrumb, and find direct children for the
  // "Subpages" footer. Cycle-guard with a Set so a corrupted parentId
  // loop doesn't infinite-loop the renderer.
  const parentChain = useMemo(() => {
    if (!selected?.parentId) return [] as Note[]
    const chain: Note[] = []
    const seen = new Set<string>()
    let id: string | undefined = selected.parentId
    while (id && !seen.has(id)) {
      seen.add(id)
      const parent = notes.find(n => n.id === id)
      if (!parent) break
      chain.unshift(parent)
      id = parent.parentId
    }
    return chain
  }, [notes, selected])

  const children = useMemo(() => {
    if (!selected) return [] as Note[]
    return notes.filter(n => n.parentId === selected.id)
  }, [notes, selected])

  // Source coverage (ussumant/llm-wiki-compiler port): walks the current
  // note for SourceQuote nodes and reports how many distinct sources
  // back this note plus how recent the most-recently-imported one is.
  // Pure metadata — no AI involved. Surfaces a stale-source warning
  // when the freshest source is older than 18 months.
  const sourceCoverage = useMemo(() => {
    if (!selected?.content) return { count: 0, freshestDays: null as number | null }
    const json = parseTipTapJson(selected.content)
    if (!json) return { count: 0, freshestDays: null }
    const paths = new Set<string>()
    walkTipTapDoc(json, node => {
      const sourcePath = node.attrs?.sourcePath
      if (node.type === 'sourceQuote' && typeof sourcePath === 'string') paths.add(sourcePath)
    })
    if (paths.size === 0) return { count: 0, freshestDays: null }
    // Look up freshness via course materialsImportedFiles
    let freshest = 0
    for (const c of courses) {
      for (const r of c.materialsImportedFiles ?? []) {
        if (paths.has(r.path) && r.importedAt > freshest) freshest = r.importedAt
      }
    }
    if (!freshest) return { count: paths.size, freshestDays: null }
    return { count: paths.size, freshestDays: Math.floor((Date.now() - freshest) / 86_400_000) }
  }, [selected?.content, courses])

  // Inline comments (suitenumerique/docs port): collected by walking
  // the TipTap JSON for spans with the inlineComment mark. Each entry
  // is { id, text, quote } where quote is the underlying selected text.
  const inlineComments = useMemo(() => {
    if (!selected?.content) return [] as Array<{ id: string; text: string; quote: string }>
    const json = parseTipTapJson(selected.content)
    if (!json) return []
    const seen = new Set<string>()
    const out: Array<{ id: string; text: string; quote: string }> = []
    walkTipTapDoc(json, (node, parent) => {
      if (node.type === 'text' && Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          if (mark?.type === 'inlineComment' && mark.attrs?.commentId && !seen.has(String(mark.attrs.commentId))) {
            seen.add(String(mark.attrs.commentId))
            out.push({
              id: String(mark.attrs.commentId),
              text: typeof mark.attrs.text === 'string' ? mark.attrs.text : '',
              quote: node.text ?? parent?.text ?? '',
            })
          }
        }
      }
    })
    return out
  }, [selected?.content])

  // Footnotes (MediaWiki port): collected in document order from the
  // current note's TipTap JSON so the list numbering matches the
  // CSS-counter superscript numbering inside the editor.
  const footnotes = useMemo(() => {
    if (!selected?.content) return [] as string[]
    const json = parseTipTapJson(selected.content)
    if (!json) return []
    const out: string[] = []
    walkTipTapDoc(json, node => {
      if (node.type === 'footnote' && typeof node.attrs?.content === 'string') {
        out.push(node.attrs.content)
      }
    })
    return out
  }, [selected?.content])

  const createSubpage = useCallback(async () => {
    if (!selected) return
    const note = await ipc.invoke<Note>('notes:create', { title: 'Untitled subpage', content: '' })
    const updated = await ipc.invoke<Note>('notes:update', {
      id: note.id,
      patch: { documentType: 'note', courseId: selected.courseId, parentId: selected.id, tags: [] },
    })
    onRefresh()
    onSelect(updated)
  }, [selected, onRefresh, onSelect])

  async function createQuestionFromDoc() {
    if (!selected || !selectedText) return
    const text = selectedText.trim().slice(0, 200)
    const question = text.includes('?') ? text : `What should I understand about: ${text.split(/[.\n]/)[0]?.slice(0, 100) || text.slice(0, 100)}?`
    if (!question.trim()) return
    await ipc.invoke('confusion:create', { question, context: `From note: ${selected.title}`, courseId: selected.courseId ?? currentCourse?.id })
    setQuestionStatus('Question created.')
    onRefresh()
    setTimeout(() => setQuestionStatus(''), 2000)
  }

  return (
    <section className="studydesk-document-card">
      <header className="document-card-header">
        <div>
          <button className="ghost-icon"><ChevronRight size={16} /></button>
          <span>{selected?.documentType?.replace('_', ' ') ?? 'Document'}</span>
        </div>
        <div className="document-actions">
          {selected && <span>Saved {new Date(selected.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          <button className="icon-pill compact"><MoreHorizontal size={16} /></button>
        </div>
      </header>
      {selected ? (
        <>
          <div className="document-context-row">
            {currentCourse && <><span>{currentCourse.code ?? currentCourse.name}</span><Circle size={4} fill="currentColor" /></>}
            {/* Parent-page breadcrumb (suitenumerique/docs port) */}
            {parentChain.map(p => (
              <React.Fragment key={p.id}>
                <button className="breadcrumb-link" onClick={() => onSelect(p)}>{p.title || 'Untitled'}</button>
                <span className="breadcrumb-sep">›</span>
              </React.Fragment>
            ))}
            <span>{selected.documentType?.replace('_', ' ') ?? 'note'}</span>
            {linkedAssignment?.dueDate && <><Circle size={4} fill="currentColor" /><span>Due {formatDue(linkedAssignment.dueDate)}</span></>}
            {/* Coverage badge: count of distinct SourceQuote sources + freshness */}
            {sourceCoverage.count > 0 && (
              <span
                className={`coverage-badge ${
                  sourceCoverage.freshestDays !== null && sourceCoverage.freshestDays > 540 ? 'is-stale' : ''
                }`}
                title={
                  sourceCoverage.freshestDays === null
                    ? `${sourceCoverage.count} cited source${sourceCoverage.count === 1 ? '' : 's'}`
                    : `${sourceCoverage.count} cited source${sourceCoverage.count === 1 ? '' : 's'}, freshest imported ${sourceCoverage.freshestDays}d ago${sourceCoverage.freshestDays > 540 ? ' (>18mo — may be outdated)' : ''}`
                }
              >
                <BookOpen size={10} />
                {sourceCoverage.count} src
                {sourceCoverage.freshestDays !== null && sourceCoverage.freshestDays > 540 && <span className="coverage-stale-icon">⚠️</span>}
              </span>
            )}
            {selectedText && <button onClick={createQuestionFromDoc}>Create question</button>}
            <button onClick={createSubpage} title="Add a subpage under this note">+ Subpage</button>
            {/* Collapsed overflow: export / history / delete. Keeps the
                document header lean — most users export rarely and never
                want a one-click Delete next to their primary actions. */}
            <div className="document-more-menu" ref={moreMenuRef}>
              <button
                onClick={() => setShowMore(v => !v)}
                aria-haspopup="menu"
                aria-expanded={showMore}
                title="More actions"
              >
                More <ChevronRight size={11} style={{ transform: showMore ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }} />
              </button>
              {showMore && (
                <div className="document-more-popover" role="menu">
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setShowMore(false)
                      if (!selected) return
                      try {
                        const json = JSON.parse(selected.content)
                        const { tipTapJsonToMarkdown } = await import('./lib/exportMarkdown')
                        const md = tipTapJsonToMarkdown(json)
                        await ipc.invoke('notes:exportMarkdown', { title: selected.title || 'note', markdown: md })
                        onStatus('Markdown exported.')
                      } catch (err) {
                        // Audit fix (P1.3): export errors used to die in
                        // console.warn — user had no idea why nothing
                        // happened. Now surfaces via the existing toast.
                        const msg = err instanceof Error ? err.message : String(err)
                        onStatus(`Markdown export failed: ${msg}`)
                      }
                    }}
                  >Export .md</button>
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setShowMore(false)
                      if (!selected) return
                      try {
                        await ipc.invoke('notes:exportPdf', { noteId: selected.id })
                        onStatus('PDF exported.')
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err)
                        onStatus(`PDF export failed: ${msg}`)
                      }
                    }}
                  >Export PDF</button>
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setShowMore(false)
                      if (!selected) return
                      try {
                        await ipc.invoke('notes:exportSlides', { noteId: selected.id })
                        onStatus('Slide deck exported.')
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err)
                        onStatus(`Slides export failed: ${msg}`)
                      }
                    }}
                  >Export as slides</button>
                  <button
                    role="menuitem"
                    onClick={() => { setShowMore(false); openQuizMeBack() }}
                  >Quiz me back…</button>
                  <button
                    role="menuitem"
                    onClick={() => { setShowMore(false); setShowRevisions(true) }}
                  >Version history…</button>
                  <div className="document-more-divider" role="separator" />
                  <button
                    role="menuitem"
                    className="is-destructive"
                    onClick={() => {
                      setShowMore(false)
                      if (selected && window.confirm(`Delete "${selected.title || 'Untitled'}"? This cannot be undone.`)) {
                        onDelete(selected.id)
                      }
                    }}
                  >Delete note</button>
                </div>
              )}
            </div>
            {questionStatus && <em>{questionStatus}</em>}
          </div>
          <Editor
            key={selected.id}
            note={selected}
            captures={captures}
            onUpdate={(patch) => onUpdate(selected.id, patch)}
          />
          {/* Talk / sidecar pane (MediaWiki port) — scratch space per note */}
          <ScratchPane
            note={selected}
            onUpdate={(patch) => onUpdate(selected.id, patch)}
          />
          {inlineComments.length > 0 && (
            <section className="document-comments" aria-label="Inline comments">
              <header><span>Comments</span><em>{inlineComments.length}</em></header>
              <ul>
                {inlineComments.map(c => (
                  <li key={c.id}>
                    <div className="comment-quote">"{c.quote.slice(0, 80)}{c.quote.length > 80 ? '…' : ''}"</div>
                    <div className="comment-body">{c.text}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {footnotes.length > 0 && (
            <section className="document-footnotes" aria-label="Footnotes">
              <header><span>Footnotes</span><em>{footnotes.length}</em></header>
              <ol>
                {footnotes.map((text, i) => (
                  <li key={i} id={`footnote-${i + 1}`}>
                    <span className="footnote-text">{text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {children.length > 0 && (
            <section className="document-subpages" aria-label="Subpages of this note">
              <header><span>Subpages</span><em>{children.length}</em></header>
              <ul>
                {children.slice(0, 12).map(c => (
                  <li key={c.id}>
                    <button onClick={() => onSelect(c)} className="document-backlink-item">
                      <span className="dot" aria-hidden="true">└</span>
                      <strong>{c.title || 'Untitled'}</strong>
                      <em>{(c.documentType ?? 'note').replace('_', ' ')}</em>
                    </button>
                  </li>
                ))}
                {children.length > 12 && (
                  <li className="document-backlink-more">+{children.length - 12} more</li>
                )}
              </ul>
            </section>
          )}
          {backlinks.length > 0 && (
            <section className="document-backlinks" aria-label="Linked from these notes">
              <header><span>Linked from</span><em>{backlinks.length}</em></header>
              <ul>
                {backlinks.slice(0, 8).map(n => (
                  <li key={n.id}>
                    <button onClick={() => onSelect(n)} className="document-backlink-item">
                      <span className="dot" aria-hidden="true">•</span>
                      <strong>{n.title || 'Untitled'}</strong>
                      <em>{(n.documentType ?? 'note').replace('_', ' ')}</em>
                    </button>
                  </li>
                ))}
                {backlinks.length > 8 && (
                  <li className="document-backlink-more">+{backlinks.length - 8} more</li>
                )}
              </ul>
            </section>
          )}
          <footer className="document-footer">
            <span>Last saved {new Date(selected.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </footer>
          {/* Story river: notes opened via [[wiki-link]] click stack here */}
          {riverIds.length > 0 && (
            <section className="river-stack" aria-label="Linked notes opened from this note">
              {riverIds.map(rid => {
                const rn = notes.find(n => n.id === rid)
                if (!rn) return null
                return (
                  <RiverNoteCard
                    key={rid}
                    note={rn}
                    onOpen={() => onSelect(rn)}
                    onClose={() => onRemoveFromRiver(rid)}
                  />
                )
              })}
            </section>
          )}
        </>
      ) : (
        <div className="notes-empty">
          <div className="notes-empty-hero">
            <h2>Pick up where you left off</h2>
            <p>
              Open a note from the sidebar, drop in a PDF or syllabus, or
              start a fresh page. Hit <kbd>/</kbd> in any note for blocks,
              <kbd>[[</kbd> to link to another note.
            </p>
          </div>
          <FileDropZone
            courseId={currentCourse?.id}
            documentType="reading"
            onCreate={onCreateFromFile}
            onCreated={() => onRefresh()}
            onWarning={onStatus}
          />
          <div className="notes-empty-actions">
            <button className="notes-create-btn" onClick={() => onCreate('note')}>New blank note</button>
            <button className="notes-create-btn ghost" onClick={() => onCreate('daily_entry')}>Today's daily entry</button>
            <button className="notes-create-btn ghost" onClick={() => onCreate('assignment_prompt')}>Assignment prompt</button>
          </div>
        </div>
      )}
      {/* T2: Quiz-me-back review modal — extract candidates, user keeps/skips/edits, kept ones become study items. */}
      <QuizMeBackModal
        open={showQuizMeBack}
        onClose={() => setShowQuizMeBack(false)}
        candidates={quizCandidates}
        existingFronts={studyItems.map(s => s.front ?? '')}
        onCommit={async (kept) => {
          let created = 0
          try {
            for (const c of kept) {
              await ipc.invoke('study:create', { front: c.front, back: c.back, type: 'flashcard', courseId: currentCourse?.id, sourceNoteId: selected?.id })
              created++
            }
            onStatus(`${created} card${created === 1 ? '' : 's'} added to study queue.`)
            onRefresh()
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            onStatus(`Stopped after ${created}/${kept.length}: ${msg}`)
          }
        }}
      />

      {/* Revisions modal (DokuWiki attic port) */}
      {showRevisions && selected && (
        <div className="revisions-modal-backdrop" onClick={() => setShowRevisions(false)}>
          <div className="revisions-modal" onClick={e => e.stopPropagation()}>
            <header>
              <span>Revision history · {selected.title || 'Untitled'}</span>
              <button onClick={() => setShowRevisions(false)} aria-label="Close">×</button>
            </header>
            {revisions.length === 0 ? (
              <div className="revisions-empty">No prior revisions yet — keep editing and a snapshot is saved every ~30s.</div>
            ) : (
              <ul>
                {revisions.map(rev => (
                  <li key={rev.timestamp}>
                    <button className="revisions-row" onClick={() => restoreRevision(rev.timestamp)}>
                      <span className="revisions-when">{new Date(rev.timestamp).toLocaleString()}</span>
                      <span className="revisions-title">{rev.title || 'Untitled'}</span>
                      <span className="revisions-size">{(rev.size / 1024).toFixed(1)} KB</span>
                      <span className="revisions-restore">Restore</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function AssignmentParserView({ selected, selectedText, courseId, deadlines, onSave }: { selected: Note | null; selectedText: string; courseId?: string; deadlines: AcademicDeadline[]; onSave: () => void }) {
  const [review, setReview] = useState<AssignmentParseReview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfSource, setPdfSource] = useState<{ note: Note; text: string; pageCount?: number } | null>(null)
  const assignmentText = pdfSource?.text.trim() || selectedText
  const sourceNote = pdfSource?.note ?? selected

  useEffect(() => {
    setPdfSource(null)
    setReview(null)
    setError(null)
  }, [selected?.id])

  async function handlePdfText(payload: { title: string; text: string; pageCount?: number }) {
    const note = await ipc.invoke<Note>('notes:create', {
      title: payload.title || 'Imported assignment prompt',
      content: tipTapDocument(payload.text),
    })
    const updated = await ipc.invoke<Note>('notes:update', {
      id: note.id,
      patch: { documentType: 'assignment_prompt', courseId, tags: [] },
    })
    setPdfSource({ note: updated, text: payload.text, pageCount: payload.pageCount })
    setReview(null)
    setError(null)
  }

  async function handleParse() {
    if (!assignmentText) return
    setParsing(true)
    setError(null)
    try {
      const result = await ipc.invoke<AssignmentParseReview>('assignment:parse', { text: assignmentText, courseId, title: sourceNote?.title })
      // Defensive: parser may return partial. Initialize empty arrays.
      setReview({
        title: result?.title ?? sourceNote?.title ?? '',
        dueDate: result?.dueDate,
        deliverables: result?.deliverables ?? [],
        formatRequirements: result?.formatRequirements ?? [],
        rubricItems: result?.rubricItems ?? [],
        submissionChecklist: result?.submissionChecklist ?? [],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not parse this assignment: ${msg}`)
    } finally { setParsing(false) }
  }

  async function handleSave() {
    if (!review || !sourceNote) return
    setSaving(true)
    setError(null)
    const title = review.title.trim() || sourceNote.title || 'Untitled assignment'
    const patch = {
      title,
      courseId,
      dueDate: review.dueDate,
      sourceType: 'assignment_prompt' as const,
      sourceId: sourceNote.id,
      deliverables: review.deliverables,
      formatRequirements: review.formatRequirements,
      rubricItems: review.rubricItems,
      submissionChecklist: review.submissionChecklist,
    }
    try {
      let assignmentId: string
      if (sourceNote.linkedAssignmentId) {
        const updated = await ipc.invoke<Assignment>('assignment:update', { id: sourceNote.linkedAssignmentId, patch })
        assignmentId = updated.id
      } else {
        const created = await ipc.invoke<Assignment>('assignment:create', patch)
        assignmentId = created.id
        await ipc.invoke('notes:update', { id: sourceNote.id, patch: { documentType: 'assignment_prompt', linkedAssignmentId: assignmentId, courseId } })
      }
      if (review.dueDate) {
        const existing = deadlines.find(d => d.assignmentId === assignmentId || (d.sourceId === sourceNote.id && d.sourceType === 'assignment_prompt'))
        if (existing) {
          await ipc.invoke('deadline:update', { id: existing.id, patch: { title: review.title, deadlineAt: review.dueDate, courseId } })
        } else {
          await ipc.invoke('deadline:create', { title: review.title, deadlineAt: review.dueDate, courseId, assignmentId, type: 'assignment', sourceType: 'assignment_prompt', sourceId: sourceNote.id, confirmed: true })
        }
      }
      setReview(null)
      onSave()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // The assignment may have been created even if the deadline step
      // failed. Tell the user honestly so they can verify in the
      // Assignments list before re-saving and creating a duplicate.
      setError(`Save failed (some changes may have been written): ${msg}`)
    } finally { setSaving(false) }
  }

  return (
    <section className="parser-card">
      <header className="parser-header">
        <div className="parser-tab"><FileText size={15} /> {sourceNote?.title || 'Assignment prompt'}</div>
        {!review
          ? <button className="review-button" onClick={handleParse} disabled={!assignmentText || parsing}><Sparkles size={15} /> {parsing ? 'Parsing...' : 'Parse assignment'}</button>
          : <button className="review-button" onClick={handleSave} disabled={saving}><Sparkles size={15} /> {saving ? 'Saving...' : 'Save assignment'}</button>
        }
      </header>
      {!review && (
        <PdfTextImportControl
          title="Upload assignment PDF"
          description="Extract embedded PDF text locally, then parse deliverables and rubric items."
          onText={handlePdfText}
          onTooShort={setError}
          onError={setError}
        />
      )}
      {error && (
        <div className="phase3-error" role="alert">
          <strong>Something went wrong:</strong> {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {!assignmentText && !review && (
        <EmptyHint message="No assignment text" hint="Upload an assignment PDF or select a document with assignment text to parse." />
      )}
      {assignmentText && !review && (
        <div className="parser-grid">
          <article className="parser-source">
            <p className="eyebrow">Source: <strong>{sourceNote?.title}</strong></p>
            {pdfSource?.pageCount && <p className="empty-hint">{pdfSource.pageCount} PDF page{pdfSource.pageCount === 1 ? '' : 's'} extracted locally.</p>}
            <p>{assignmentText.slice(0, 300)}{assignmentText.length > 300 ? '...' : ''}</p>
          </article>
          <article className="parser-details">
            <p className="empty-hint">Click "Parse assignment" to extract details for review.</p>
          </article>
        </div>
      )}
      {review && (
        <div className="parser-grid">
          <article className="parser-source">
            <label><span>Title</span><input value={review.title} onChange={e => setReview({ ...review, title: e.target.value })} /></label>
            <label><span>Due date</span><input type="datetime-local" value={review.dueDate ? new Date(review.dueDate).toISOString().slice(0, 16) : ''} onChange={e => setReview({ ...review, dueDate: e.target.value ? new Date(e.target.value).getTime() : undefined })} /></label>
          </article>
          <article className="parser-details">
            <h2><Sparkles size={17} /> Extracted details</h2>
            <ReviewChecklistSection title="Deliverables" items={review.deliverables} />
            <ReviewChecklistSection title="Format requirements" items={review.formatRequirements} />
            <ReviewChecklistSection title="Rubric items" items={review.rubricItems} />
            <ReviewChecklistSection title="Submission checklist" items={review.submissionChecklist} />
          </article>
        </div>
      )}
    </section>
  )
}

function ReviewChecklistSection({ title, items }: { title: string; items: ChecklistItem[] }) {
  if (items.length === 0) return <div className="review-section"><strong>{title}</strong><em>Not found</em></div>
  return (
    <div className="review-section">
      <strong>{title}</strong>
      {items.map(item => <div key={item.id} className="check-row"><span>{'○'}</span><span>{item.text}</span></div>)}
    </div>
  )
}

function DashboardView({
  courses,
  deadlines,
  assignments,
  captures,
  studyItems,
  alerts,
  currentCourse,
  onCompleteDeadline,
  onResolveAlert,
  onNavigate,
}: {
  courses: Course[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  captures: Capture[]
  studyItems: StudyItem[]
  alerts: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>[]
  currentCourse?: Course
  onCompleteDeadline: (id: string) => Promise<void>
  onResolveAlert: (id: string) => Promise<void>
  /** Switch to a sibling workspace tab. Used by the "Review day" CTA. */
  onNavigate: (tool: WorkspaceTool) => void
}) {
  const now = Date.now()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const endOfWeek = now + 7 * 86_400_000
  const openDeadlines = deadlines
    .filter(deadline => !deadline.completed)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)
  const activeAssignments = assignments
    .filter(a => a.status !== 'archived' && a.status !== 'submitted')
    .sort((a, b) => (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER))
  const dueStudyItems = studyItems
    .filter(item => !item.nextReviewAt || item.nextReviewAt <= endOfToday.getTime())
    .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0))
  const todayDeadlines = openDeadlines.filter(deadline => deadline.deadlineAt <= endOfToday.getTime())
  const upcomingDeadlines = openDeadlines.filter(deadline => deadline.deadlineAt > endOfToday.getTime() && deadline.deadlineAt <= endOfWeek)
  const visibleAlerts = alerts.slice(0, 4)
  const recentCaptures = captures.slice(0, 4)
  const primaryAction = todayDeadlines[0]?.title
    ?? activeAssignments[0]?.title
    ?? dueStudyItems[0]?.front
    ?? visibleAlerts[0]?.title
    ?? 'Pick one study action'

  const workQueue = [
    ...todayDeadlines.slice(0, 3).map(deadline => ({
      id: `deadline-${deadline.id}`,
      eyebrow: deadline.deadlineAt < now ? 'Overdue deadline' : 'Due today',
      title: deadline.title,
      meta: formatDue(deadline.deadlineAt),
      action: 'Complete',
      onAction: () => void onCompleteDeadline(deadline.id),
      tone: deadline.deadlineAt < now ? 'critical' : 'warning',
    })),
    ...activeAssignments.slice(0, 3).map(assignment => ({
      id: `assignment-${assignment.id}`,
      eyebrow: 'Assignment',
      title: assignment.title,
      meta: assignment.dueDate ? `Due ${formatDue(assignment.dueDate)}` : assignment.status.replace(/_/g, ' '),
      action: 'Open deadlines',
      onAction: () => onNavigate('deadlines'),
      tone: 'neutral',
    })),
    ...dueStudyItems.slice(0, 3).map(item => ({
      id: `study-${item.id}`,
      eyebrow: item.type === 'question' ? 'Quiz review' : 'Flashcard review',
      title: item.front,
      meta: item.reviewCount > 0 ? `${item.reviewCount} review${item.reviewCount === 1 ? '' : 's'}` : 'New item',
      action: item.type === 'question' ? 'Quiz' : 'Flashcards',
      onAction: () => onNavigate(item.type === 'question' ? 'quiz' : 'flashcards'),
      tone: 'study',
    })),
    ...visibleAlerts.slice(0, 2).map(alert => ({
      id: `alert-${alert.id}`,
      eyebrow: `${alert.priority} reminder`,
      title: alert.title,
      meta: alert.reason,
      action: 'Resolve',
      onAction: () => void onResolveAlert(alert.id),
      tone: alert.priority === 'critical' ? 'critical' : 'neutral',
    })),
  ].slice(0, 7)

  return (
    <section className="phase3-card dashboard-view today-dashboard">
      <header className="phase3-header today-dashboard-header">
        <div>
          <p className="phase3-eyebrow">Today</p>
          <h1>{currentCourse ? currentCourse.code ?? currentCourse.name : 'What to work on now'}</h1>
          <span>{currentCourse ? primaryAction : 'Pick a course from the left rail to see today’s work.'}</span>
        </div>
        <div className="today-header-actions" aria-label="Today actions">
          <button className="outline-button" onClick={() => onNavigate('deadlines')}><Clock3 size={14} /> Deadlines</button>
          <button className="review-button" onClick={() => onNavigate(dueStudyItems.some(item => item.type === 'question') ? 'quiz' : 'flashcards')}>
            <Layers size={14} /> Study {dueStudyItems.length > 0 ? `(${dueStudyItems.length})` : ''}
          </button>
        </div>
      </header>

      <div className="today-summary-grid">
        <MetricCard label="Due today" value={todayDeadlines.length} detail={upcomingDeadlines.length > 0 ? `${upcomingDeadlines.length} next 7 days` : 'No near deadline'} icon={<CalendarDays size={20} />} />
        <MetricCard label="Study due" value={dueStudyItems.length} detail={`${studyItems.length} total study items`} icon={<Layers size={20} />} />
        <MetricCard label="Reminders" value={alerts.length} detail="Notifications and alerts" icon={<Bell size={20} />} />
        <MetricCard label="Captures" value={captures.length} detail="Inbox moved here" icon={<ClipboardList size={20} />} />
      </div>

      <div className="today-dashboard-grid">
        <section className="today-panel today-focus-panel">
          <div className="today-panel-heading">
            <div>
              <p className="phase3-eyebrow">Do next</p>
              <h2>Priority queue</h2>
            </div>
            <button className="outline-button" onClick={() => onNavigate('calendar')}>Calendar</button>
          </div>
          {workQueue.length > 0 ? (
            <div className="today-work-list">
              {workQueue.map(item => (
                <article key={item.id} className={cn('today-work-item', `tone-${item.tone}`)}>
                  <div>
                    <span>{item.eyebrow}</span>
                    <strong>{item.title}</strong>
                    <em>{item.meta}</em>
                  </div>
                  <button onClick={item.onAction}>{item.action}</button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyHint message="Nothing urgent today" hint="Use this space for the next deadline, reminder, capture, or study item." />
          )}
        </section>

        <section className="today-panel">
          <div className="today-panel-heading">
            <div>
              <p className="phase3-eyebrow">Course</p>
              <h2>Context</h2>
            </div>
          </div>
          {currentCourse ? (
            <div className="today-course-context">
              <strong>{currentCourse.code ?? currentCourse.name}</strong>
              <span>{currentCourse.name}</span>
              {currentCourse.professorName && <em>{currentCourse.professorName}</em>}
              {currentCourse.location && <em>{currentCourse.location}</em>}
            </div>
          ) : (
            <EmptyHint message="No course selected" hint="Use the course rail on the left to switch context." />
          )}
        </section>

        <section className="today-panel">
          <div className="today-panel-heading">
            <div>
              <p className="phase3-eyebrow">Reminders</p>
              <h2>Notifications</h2>
            </div>
          </div>
          {visibleAlerts.length > 0 ? visibleAlerts.map(alert => (
            <div className="compact-row action-row today-compact-row" key={alert.id}>
              <Bell size={18} />
              <div><strong>{alert.title}</strong><em>{alert.reason}</em></div>
              <button onClick={() => onResolveAlert(alert.id)}>Resolve</button>
            </div>
          )) : <EmptyHint message="No reminders" hint="Alerts and notifications will show here instead of the old left column." />}
        </section>

        <section className="today-panel">
          <div className="today-panel-heading">
            <div>
              <p className="phase3-eyebrow">Capture inbox</p>
              <h2>Recent captures</h2>
            </div>
            <button className="outline-button" onClick={() => onNavigate('notes')}>Notes</button>
          </div>
          {recentCaptures.length > 0 ? recentCaptures.map(capture => (
            <article key={capture.id} className="today-capture-card">
              <p>{capture.text}</p>
              <span>{capture.sourceApp ?? capture.source} · {new Date(capture.createdAt).toLocaleDateString()}</span>
            </article>
          )) : <EmptyHint message="No captures yet" hint="Start capture from the notch, then triage clips here." />}
        </section>
      </div>
    </section>
  )
}

function QuizView({
  selected,
  selectedText,
  courseId,
  studyItems,
  onReviewStudyItem,
  onRefresh,
  onOpenStudyItemSource,
  getStudySourceInfo,
}: {
  selected: Note | null
  selectedText: string
  courseId?: string
  studyItems: StudyItem[]
  onReviewStudyItem: (id: string, difficulty: NonNullable<StudyItem['difficulty']>) => Promise<void>
  onRefresh: () => void
  onOpenStudyItemSource: (item: StudyItem) => void
  getStudySourceInfo: (item: StudyItem) => StudySourceInfo | null
}) {
  const [drafts, setDrafts] = useState<QuizQuestionDraft[]>([])
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const [activeDraftIndex, setActiveDraftIndex] = useState(0)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [draftAnswerRevealed, setDraftAnswerRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  function generate() {
    if (!selectedText) return
    const next = extractQuestionDraftsFromText(selectedText)
    setDrafts(next)
    setActiveDraftIndex(0)
    setDraftAnswerRevealed(false)
    setError(null)
    setStatusMsg(next.length > 0
      ? `${next.length} question candidate${next.length === 1 ? '' : 's'} ready to review.`
      : 'No question candidates found in the selected document.')
  }

  function removeQuestion(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index))
    setActiveDraftIndex(index => Math.max(0, Math.min(index, drafts.length - 2)))
    setDraftAnswerRevealed(false)
  }

  function updateQuestion(index: number, value: string) {
    setDrafts(prev => prev.map((q, i) => i === index ? { ...q, question: value } : q))
  }

  function updateQuestionAnswer(index: number, value: string) {
    setDrafts(prev => prev.map((q, i) => i === index ? { ...q, answer: value } : q))
  }

  const questions = studyItems.filter(item => item.type === 'question')
  const activeIndex = Math.min(activeQuestionIndex, Math.max(questions.length - 1, 0))
  const activeQuestion = questions[activeIndex]
  const activeSource = activeQuestion ? getStudySourceInfo(activeQuestion) : null
  const activeDraft = drafts[activeDraftIndex]
  const selectedSourceTitle = selected?.title ?? 'Selected document'

  useEffect(() => {
    if (activeQuestionIndex >= questions.length) {
      setActiveQuestionIndex(Math.max(questions.length - 1, 0))
    }
  }, [activeQuestionIndex, questions.length])

  useEffect(() => {
    if (activeDraftIndex >= drafts.length) {
      setActiveDraftIndex(Math.max(drafts.length - 1, 0))
    }
  }, [activeDraftIndex, drafts.length])

  useEffect(() => {
    setAnswerRevealed(false)
  }, [activeQuestion?.id])

  useEffect(() => {
    setDraftAnswerRevealed(false)
  }, [activeDraftIndex])

  async function reviewActiveQuestion(difficulty: 'again' | 'good') {
    if (!activeQuestion || saving) return
    setSaving(true)
    setError(null)
    try {
      await onReviewStudyItem(activeQuestion.id, difficulty)
      setStatusMsg(difficulty === 'again' ? 'Scheduled for another pass.' : 'Marked as known.')
      setAnswerRevealed(false)
      if (questions.length > 1) {
        setActiveQuestionIndex(index => Math.min(index + 1, questions.length - 1))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not review question: ${msg}`)
    } finally { setSaving(false) }
  }

  async function saveActiveQuestionForReview() {
    if (!activeQuestion || saving) return
    setSaving(true)
    setError(null)
    try {
      await ipc.invoke('study:update', { id: activeQuestion.id, patch: { nextReviewAt: Date.now() } })
      setStatusMsg('Question kept in the review queue.')
      onRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not keep question for review: ${msg}`)
    } finally { setSaving(false) }
  }

  async function saveDraftQuestion(index: number) {
    const draft = drafts[index]
    if (!draft || saving) return
    const front = draft.question.trim()
    if (!front) return
    setSaving(true)
    setError(null)
    try {
      if (isDuplicateQuestion(studyItems, front)) {
        removeQuestion(index)
        setStatusMsg('Skipped duplicate question.')
        return
      }
      await ipc.invoke('study:create', {
        courseId: selected?.courseId ?? courseId,
        sourceNoteId: selected?.id,
        sourceCardKey: makeQuestionCandidateKey(front, index + 1),
        type: 'question',
        front,
        back: draft.answer,
        explanation: draft.answer,
      })
      removeQuestion(index)
      setStatusMsg(`Saved question for review${selected?.title ? ` from "${selected.title}"` : ''}.`)
      onRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not save question: ${msg}`)
    } finally { setSaving(false) }
  }

  return (
    <section className="phase3-card quiz-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Quiz</p>
          <h1>Self-check questions</h1>
          <span>{questions.length > 0 ? 'Reveal the answer, then mark whether you knew it.' : 'Generate or save questions from source materials to start a quiz session.'}</span>
        </div>
        <div className="phase3-actions">
          {drafts.length > 0 && (
            <button className="outline-button" onClick={() => { setDrafts([]); setDraftAnswerRevealed(false); setStatusMsg(null) }} disabled={saving}>
              Clear candidates
            </button>
          )}
          <button className="review-button" onClick={generate} disabled={!selectedText || saving}>
            <HelpCircle size={15} /> Extract questions
          </button>
        </div>
      </header>
      {error && (
        <div className="phase3-error" role="alert">
          <strong>Something went wrong:</strong> {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {statusMsg && !error && (
        <div className="phase3-status" role="status">{statusMsg}</div>
      )}

      {drafts.length > 0 && activeDraft && (
        <div className="quiz-study-shell">
          <div className="flashcard-study-topline">
            <span>Candidate {activeDraftIndex + 1} of {drafts.length}</span>
            <span>{selected ? selectedSourceTitle : 'Unsourced question'}</span>
          </div>
          <article className="flashcard-study-card quiz-study-card">
            <div className="flashcard-study-prompt">
              <span>Question candidate</span>
              <textarea
                className="quiz-study-edit"
                value={activeDraft.question}
                onChange={e => updateQuestion(activeDraftIndex, e.target.value)}
                aria-label="Question"
              />
            </div>

            {selected && (
              <div className="study-source-strip">
                <span>Source note: {selectedSourceTitle}</span>
                <button
                  onClick={() => onOpenStudyItemSource({
                    id: `draft-${selected.id}`,
                    courseId: selected.courseId ?? courseId,
                    sourceNoteId: selected.id,
                    type: 'question',
                    front: activeDraft.question,
                    reviewCount: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  })}
                >
                  Open source
                </button>
              </div>
            )}

            <div className={cn('flashcard-study-answer', !draftAnswerRevealed && 'is-hidden')}>
              {draftAnswerRevealed ? (
                <textarea
                  className="quiz-study-edit quiz-study-answer-edit"
                  value={activeDraft.answer ?? ''}
                  onChange={e => updateQuestionAnswer(activeDraftIndex, e.target.value)}
                  placeholder="Optional answer or explanation"
                  aria-label="Answer or explanation"
                />
              ) : (
                <button className="flashcard-reveal-button" onClick={() => setDraftAnswerRevealed(true)}>
                  Reveal answer
                </button>
              )}
            </div>

            <footer className="flashcard-study-footer">
              {draftAnswerRevealed ? (
                <div className="review-actions quiz-review-actions" aria-label="Review generated question">
                  <button disabled={saving} onClick={() => void saveDraftQuestion(activeDraftIndex)}>Save for review</button>
                  <button disabled={saving} onClick={() => removeQuestion(activeDraftIndex)}>Skip</button>
                </div>
              ) : (
                <div className="flashcard-study-hint">Review the prompt before saving it to your study queue.</div>
              )}
            </footer>
          </article>
        </div>
      )}

      {drafts.length === 0 && activeQuestion && (
        <div className="quiz-study-shell">
          <div className="flashcard-study-topline">
            <span>Question {activeIndex + 1} of {questions.length}</span>
            <span>{activeQuestion.reviewCount} review{activeQuestion.reviewCount === 1 ? '' : 's'}</span>
          </div>
          <article className="flashcard-study-card quiz-study-card">
            <div className="flashcard-study-prompt">
              <span>Self-check</span>
              <h2>{activeQuestion.front}</h2>
            </div>

            {activeSource && (
              <div className="study-source-strip">
                <span>{studySourceLabel(activeSource)}: {activeSource.title}</span>
                <button onClick={() => onOpenStudyItemSource(activeQuestion)}>Open source</button>
              </div>
            )}

            <div className={cn('flashcard-study-answer', !answerRevealed && 'is-hidden')}>
              {answerRevealed ? (
                <p>{activeQuestion.back || activeQuestion.explanation || 'No answer has been saved for this question yet.'}</p>
              ) : (
                <button className="flashcard-reveal-button" onClick={() => setAnswerRevealed(true)}>
                  Reveal answer
                </button>
              )}
            </div>

            <footer className="flashcard-study-footer">
              {answerRevealed ? (
                <div className="review-actions quiz-review-actions" aria-label="Grade this question">
                  <button disabled={saving} onClick={() => void reviewActiveQuestion('good')}>Knew it</button>
                  <button disabled={saving} onClick={() => void reviewActiveQuestion('again')}>Missed it</button>
                  <button disabled={saving} onClick={() => void saveActiveQuestionForReview()}>Save for review</button>
                </div>
              ) : (
                <div className="flashcard-study-hint">Answer from memory before revealing.</div>
              )}
            </footer>
          </article>
          {questions.length > 1 && (
            <div className="flashcard-study-nav">
              <button
                className="outline-button"
                onClick={() => setActiveQuestionIndex(index => Math.max(index - 1, 0))}
                disabled={activeIndex === 0}
              >
                Previous
              </button>
              <button
                className="outline-button"
                onClick={() => setActiveQuestionIndex(index => Math.min(index + 1, questions.length - 1))}
                disabled={activeIndex >= questions.length - 1}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {drafts.length === 0 && !activeQuestion && (
        <div className="phase3-panel">
          {selectedText ? (
            <p className="empty-hint">Click "Extract questions" to create local question candidates from the selected document. Nothing is saved until you review it.</p>
          ) : (
            <EmptyHint message="No quiz questions yet" hint="Select a material or note, extract questions, then save them for review." />
          )}
        </div>
      )}
    </section>
  )
}

function FlashcardsView({
  selectedText,
  studyItems,
  courseId,
  onReviewStudyItem,
  onSave,
  onStatus,
  onOpenPanic,
  onOpenStudyItemSource,
  getStudySourceInfo,
}: {
  selectedText: string
  studyItems: StudyItem[]
  courseId?: string
  onReviewStudyItem: (id: string, difficulty: NonNullable<StudyItem['difficulty']>) => Promise<void>
  onSave: () => void
  onStatus: (msg: string) => void
  onOpenPanic: () => void
  onOpenStudyItemSource: (item: StudyItem) => void
  getStudySourceInfo: (item: StudyItem) => StudySourceInfo | null
}) {
  const [drafts, setDrafts] = useState<FlashcardDraft[]>([])
  const [syncing, setSyncing] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [reviewingCard, setReviewingCard] = useState(false)

  function generate() {
    if (!selectedText) return
    const cards: FlashcardDraft[] = []
    const lines = selectedText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 5)
    for (const line of lines) {
      // Lines containing ':' -> front/back
      if (line.includes(':')) {
        const [front, ...rest] = line.split(':')
        const back = rest.join(':').trim()
        if (front.trim().length > 3 && back.length > 3) {
          cards.push({ front: front.trim(), back, type: 'flashcard' })
          continue
        }
      }
      // Definition patterns
      const defMatch = line.match(/^(.+?)\b(is|means|refers to|defined as)\b(.+)/i)
      if (defMatch && defMatch[1].trim().length > 3 && defMatch[3].trim().length > 5) {
        cards.push({ front: defMatch[1].trim(), back: defMatch[3].trim(), type: 'definition' })
        continue
      }
      // Short standalone lines -> concept
      if (line.length < 60 && !line.includes('.')) {
        cards.push({ front: line, back: '', type: 'concept' })
      }
      if (cards.length >= 10) break
    }
    setDrafts(cards)
  }

  function removeDraft(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index))
  }

  function updateDraft(index: number, patch: Partial<FlashcardDraft>) {
    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, ...patch } : d))
  }

  async function handleSave() {
    if (drafts.length === 0) return
    const validDrafts = drafts.filter(d => d.front.trim().length > 0)
    let saved = 0
    let skipped = 0
    try {
      for (const draft of validDrafts) {
        const front = draft.front.trim()
        const back = draft.back?.trim() || undefined
        if (isDuplicateFlashcard(studyItems, front, back)) { skipped++; continue }
        await ipc.invoke('study:create', { front, back, type: 'flashcard', courseId })
        saved++
      }
      setDrafts([])
      onStatus(skipped > 0 ? `${saved} saved, ${skipped} skipped (duplicates).` : `${saved} flashcards saved.`)
      onSave()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStatus(`Saved ${saved}/${validDrafts.length} before failing: ${msg}`)
    }
  }

  // T4 (anti-shame): how many cards are overdue right now? Surfaces in
  // the "Forgive me" affordance copy so the user knows what they're
  // resetting before they tap. Counts items with nextReviewAt in the
  // past, since the SR scheduler is what shames the most.
  const overdueCount = studyItems.filter(s => (s.nextReviewAt ?? 0) > 0 && s.nextReviewAt! < Date.now()).length

  // T4 (anti-shame): Anki-bankruptcy. Reset every overdue card's
  // nextReviewAt to now so the queue isn't a wall of shame, but DO NOT
  // touch reviewCount or difficulty history — that's the data, the
  // schedule is the story. The research finding this addresses:
  // "1,800 cards due. I haven't opened it in 11 days. I'd rather fail
  // the exam than see that due count." n~45 across r/medicalschool +
  // r/Anki anonymous threads.
  async function forgiveBacklog() {
    if (overdueCount === 0) return
    if (!window.confirm(`Reschedule ${overdueCount} overdue card${overdueCount === 1 ? '' : 's'} for today?\n\nYour review history is preserved — only the due date changes. The pile won't shame you anymore.`)) return
    let touched = 0
    try {
      const overdue = studyItems.filter(s => (s.nextReviewAt ?? 0) > 0 && s.nextReviewAt! < Date.now())
      for (const item of overdue) {
        await ipc.invoke('study:update', { id: item.id, patch: { nextReviewAt: Date.now() } })
        touched++
      }
      onStatus(`${touched} card${touched === 1 ? '' : 's'} forgiven. Open Cards when you're ready.`)
      onSave()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStatus(`Reset stopped after ${touched} card${touched === 1 ? '' : 's'}: ${msg}`)
    }
  }

  const cards = studyItems.filter(item => item.type === 'flashcard' || item.type === 'definition' || item.type === 'concept')
  const activeIndex = Math.min(activeCardIndex, Math.max(cards.length - 1, 0))
  const activeCard = cards[activeIndex]
  const activeSource = activeCard ? getStudySourceInfo(activeCard) : null

  useEffect(() => {
    if (activeCardIndex >= cards.length) {
      setActiveCardIndex(Math.max(cards.length - 1, 0))
    }
  }, [activeCardIndex, cards.length])

  useEffect(() => {
    setAnswerRevealed(false)
  }, [activeCard?.id])

  async function reviewActiveCard(difficulty: NonNullable<StudyItem['difficulty']>) {
    if (!activeCard || reviewingCard) return
    setReviewingCard(true)
    try {
      await onReviewStudyItem(activeCard.id, difficulty)
      setAnswerRevealed(false)
      if (cards.length > 1) {
        setActiveCardIndex(index => Math.min(index + 1, cards.length - 1))
      }
    } finally {
      setReviewingCard(false)
    }
  }

  return (
    <section className="phase3-card flashcards-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Flashcards</p>
          <h1>Active recall</h1>
          <span>{selectedText ? 'Review saved cards or generate candidates from the selected source.' : 'Review saved cards or select a source to generate more.'}</span>
        </div>
        <div className="flashcards-header-actions">
          {/* T4 anti-shame: Forgive backlog. Only renders when there
              actually IS a backlog so it doesn't sit there as a guilt
              trigger when things are caught up. */}
          {drafts.length === 0 && overdueCount > 0 && (
            <button
              className="outline-button"
              onClick={forgiveBacklog}
              title="Reset due dates on overdue cards back to today. Review history is preserved — only the schedule changes."
            >
              Forgive {overdueCount}
            </button>
          )}
          {/* T3 panic mode: surfaces here too — same surface where
              users already manage their cards. Only renders when
              there's enough material to rank. */}
          {drafts.length === 0 && studyItems.length >= 5 && (
            <button
              className="outline-button"
              onClick={onOpenPanic}
              title="Show the cards you're most likely to fail. Drill these first."
            >
              Plan cram
            </button>
          )}
          {drafts.length === 0 && (
            <button
              className="review-button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                try {
                  const r = await ipc.invoke<{ notesProcessed: number; totalCreated: number; totalUpdated: number; totalDeleted: number }>('study:syncAllNotes', {})
                  // Defensive: backend may evolve. Don't crash on missing fields.
                  const c = r?.totalCreated ?? 0, u = r?.totalUpdated ?? 0, d = r?.totalDeleted ?? 0, np = r?.notesProcessed ?? 0
                  onStatus(`Sync: +${c} new, ${u} updated, ${d} removed across ${np} note(s).`)
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  onStatus(`Sync failed: ${msg}`)
                } finally {
                  setSyncing(false)
                }
                onSave()
              }}
              title="Re-derive flashcards from all notes (heading-based, level 3)"
            >
              {syncing ? <Spinner size={15} /> : <Sparkles size={15} />} Sync from notes
            </button>
          )}
          {drafts.length === 0
            ? <button className="review-button" onClick={generate} disabled={!selectedText}><ClipboardList size={15} /> Extract from source</button>
            : <button className="review-button" onClick={handleSave}><ClipboardList size={15} /> Save flashcards ({drafts.length})</button>
          }
        </div>
      </header>
      {drafts.length > 0 && (
        <div className="flashcard-board">
          {drafts.map((draft, index) => (
            <article className="study-card" key={index}>
              <span>Draft {index + 1} <button className="inline-action" onClick={() => removeDraft(index)}>Remove</button></span>
              <input value={draft.front} onChange={e => updateDraft(index, { front: e.target.value })} placeholder="Front" className="quiz-edit-input" />
              <input value={draft.back} onChange={e => updateDraft(index, { back: e.target.value })} placeholder="Back" className="quiz-edit-input" />
              <small>{draft.type}</small>
            </article>
          ))}
        </div>
      )}
      {drafts.length === 0 && activeCard && (
        <div className="flashcard-study-shell">
          <div className="flashcard-study-topline">
            <span>Card {activeIndex + 1} of {cards.length}</span>
            <span>{activeCard.reviewCount} review{activeCard.reviewCount === 1 ? '' : 's'}</span>
          </div>
          <article className="flashcard-study-card">
            <div className="flashcard-study-prompt">
              <span>{activeCard.type}</span>
              <h2>{activeCard.front}</h2>
            </div>

            {activeSource && (
              <div className="study-source-strip">
                <span>{studySourceLabel(activeSource)}: {activeSource.title}</span>
                <button onClick={() => onOpenStudyItemSource(activeCard)}>Open source</button>
              </div>
            )}

            <div className={cn('flashcard-study-answer', !answerRevealed && 'is-hidden')}>
              {answerRevealed ? (
                <p>{activeCard.back || 'No answer has been saved for this card yet.'}</p>
              ) : (
                <button className="flashcard-reveal-button" onClick={() => setAnswerRevealed(true)}>
                  Reveal answer
                </button>
              )}
            </div>

            <footer className="flashcard-study-footer">
              {answerRevealed ? (
                <div className="review-actions flashcard-review-actions" aria-label="Grade this card">
                  {(['again', 'hard', 'good', 'easy'] as const).map(difficulty => (
                    <button
                      key={difficulty}
                      disabled={reviewingCard}
                      onClick={() => void reviewActiveCard(difficulty)}
                    >
                      {reviewingCard ? 'Saving...' : difficulty}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flashcard-study-hint">Try to answer before revealing.</div>
              )}
            </footer>
          </article>
          {cards.length > 1 && (
            <div className="flashcard-study-nav">
              <button
                className="outline-button"
                onClick={() => setActiveCardIndex(index => Math.max(index - 1, 0))}
                disabled={activeIndex === 0}
              >
                Previous
              </button>
              <button
                className="outline-button"
                onClick={() => setActiveCardIndex(index => Math.min(index + 1, cards.length - 1))}
                disabled={activeIndex >= cards.length - 1}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      {drafts.length === 0 && cards.length === 0 && !selectedText && (
        <EmptyState icon={Layers} title="No flashcards yet" description="Select a document to generate flashcards, or create them manually." />
      )}
    </section>
  )
}

function SyllabusImportView({ selected, selectedText, courseId, onCreate, onConfirm, onRefresh, onStatus }: {
  selected: Note | null
  selectedText: string
  courseId?: string
  onCreate: (type?: Note['documentType']) => Promise<void>
  onConfirm: () => void
  onRefresh: () => void
  onStatus: (msg: string) => void
}) {
  const [review, setReview] = useState<SyllabusParseReview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<SyllabusConfirmResult | null>(null)
  const [rawPaste, setRawPaste] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** Text to parse: raw paste takes priority over note content. */
  const parseText = rawPaste.trim() || selectedText

  async function handleSyllabusPdfText(payload: { title: string; text: string; pageCount?: number }) {
    const pageCount = payload.pageCount ?? 1
    setRawPaste(prev => prev ? `${prev}\n\n${payload.text}` : payload.text)
    setReview(null)
    setConfirmResult(null)
    setError(null)
    onStatus(`Extracted ${pageCount} PDF page${pageCount === 1 ? '' : 's'} from "${payload.title}".`)
  }

  // ── Parse ───────────────────────────────────────────────────────────
  async function handleParse() {
    if (!parseText) return
    setParsing(true)
    setError(null)
    try {
      const r = await ipc.invoke<{
        course?: SyllabusParseReview['course']
        classMeetings?: SyllabusClassMeetingReview[]
        assignments?: Array<{ title: string; dueDate?: number; weight?: string; type: string }>
        deadlines?: Array<{ title: string; deadlineAt: number; type: string }>
        readings?: Array<{ title: string; chapter?: string }>
        setupTasks?: Array<{ title: string; category: string }>
        scheduleRows?: unknown[]
      }>('syllabus:parse', { text: parseText, courseId })
      // Defensive: every field must be optional in case the parser returns
      // a partial result on a malformed syllabus. The previous code crashed
      // on `r.course.foo` access if the AI failed to identify a course.
      setReview({
        course: r?.course ?? { code: '', name: '', term: '' },
        classMeetings: r?.classMeetings ?? [],
        assignments: (r?.assignments ?? []).map(a => ({ ...a, included: true })),
        deadlines: (r?.deadlines ?? []).map(d => ({ title: d.title, deadlineAt: d.deadlineAt, type: d.type, included: true })),
        setupTasks: (r?.setupTasks ?? []).map(t => ({ ...t, included: true })),
        readings: r?.readings ?? [],
        scheduleRowCount: r?.scheduleRows?.length ?? 0,
      })
      setConfirmResult(null)
    } catch (err) {
      // Surface the failure in the UI rather than leaving the user
      // staring at a "parsing…" state forever.
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Parse failed: ${msg}`)
      onStatus(`Parse failed: ${msg}`)
    } finally { setParsing(false) }
  }

  // ── Confirm ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!review) return
    setConfirming(true)
    setError(null)
    const payload = {
      courseId,
      course: !courseId ? review.course : undefined,
      syllabusNoteId: selected?.id,
      sourceText: !selected ? parseText : undefined,
      assignments: review.assignments.filter(a => a.included).map(a => ({
        title: a.title, dueDate: a.dueDate, confirmed: true,
      })),
      deadlines: review.deadlines.filter(d => d.included).map(d => ({
        title: d.title, deadlineAt: d.deadlineAt, type: d.type,
        confirmed: true, sourceType: 'syllabus', sourceId: selected?.id,
      })),
      setupTasks: review.setupTasks.filter(t => t.included).map(t => ({
        title: t.title, category: t.category, confirmed: true,
      })),
    }
    try {
      const result = await ipc.invoke<SyllabusConfirmResult>('syllabus:confirmImport', payload)
      if (selected) {
        await ipc.invoke('notes:update', { id: selected.id, patch: { documentType: 'syllabus', courseId: result?.courseId ?? courseId } })
      }
      setConfirmResult(result)
      // Defensive: backend may evolve and not return counts. Don't crash.
      const c = result?.counts ?? { assignments: 0, deadlines: 0, setupAlerts: 0 }
      onStatus(`Import complete: ${c.assignments} assignment(s), ${c.deadlines} deadline(s), ${c.setupAlerts} setup task(s).`)
      onRefresh()
      onConfirm()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Import failed: ${msg}`)
      onStatus(`Import failed: ${msg}`)
    } finally { setConfirming(false) }
  }

  // ── Inline edit helpers ─────────────────────────────────────────────
  function updateCourse(field: keyof SyllabusParseReview['course'], value: string) {
    if (!review) return
    setReview({ ...review, course: { ...review.course, [field]: value } })
  }

  function toggleAssignment(i: number) {
    if (!review) return
    const next = [...review.assignments]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, assignments: next })
  }
  function editAssignment(i: number, field: keyof SyllabusAssignmentReview, value: string | number) {
    if (!review) return
    const next = [...review.assignments]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, assignments: next })
  }

  function toggleDeadline(i: number) {
    if (!review) return
    const next = [...review.deadlines]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, deadlines: next })
  }
  function editDeadline(i: number, field: keyof SyllabusDeadlineReview, value: string | number) {
    if (!review) return
    const next = [...review.deadlines]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, deadlines: next })
  }

  function toggleSetup(i: number) {
    if (!review) return
    const next = [...review.setupTasks]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, setupTasks: next })
  }
  function editSetup(i: number, field: keyof SyllabusSetupReview, value: string) {
    if (!review) return
    const next = [...review.setupTasks]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, setupTasks: next })
  }

  function resetImport() { setReview(null); setConfirmResult(null) }

  // ── Post-import onboarding ──────────────────────────────────────────
  if (confirmResult) {
    const c = confirmResult.counts
    return (
      <section className="phase3-card syllabus-view">
        <header className="phase3-header">
          <div>
            <p className="phase3-eyebrow">Import complete</p>
            <h1>Syllabus imported successfully</h1>
          </div>
          <div className="phase3-actions">
            <button className="outline-button" onClick={resetImport}><Upload size={15} /> Import another</button>
          </div>
        </header>
        <div className="syllabus-grid">
          <section className="phase3-panel">
            <h2>Created records</h2>
            <div className="source-preview">
              <span>{c.assignments} assignment(s)</span>
              <span>{c.deadlines} deadline(s)</span>
              <span>{c.setupAlerts} setup task(s)</span>
            </div>
          </section>
          <section className="phase3-panel wide">
            <h2>Next steps: upload course materials</h2>
            <p className="empty-hint" style={{ marginBottom: 8 }}>
              The syllabus tells you what to study, but the materials contain the actual content.
              Upload each type to unlock flashcards, quizzes, and study tools.
            </p>
            <div className="syllabus-onboarding-list">
              <div className="timeline-row"><BookOpen size={14} /><div><strong>Readings and textbook chapters</strong><em>Upload PDFs or paste text for each assigned reading.</em></div></div>
              <div className="timeline-row"><FileText size={14} /><div><strong>Cases (HBP coursepack)</strong><em>Upload case PDFs to enable case analysis prep.</em></div></div>
              <div className="timeline-row"><ClipboardList size={14} /><div><strong>Assignment prompts</strong><em>Upload assignment briefs to extract deliverables and checklists.</em></div></div>
              <div className="timeline-row"><PanelTop size={14} /><div><strong>Lecture slides</strong><em>Upload slides to capture key concepts and exam hints.</em></div></div>
              <div className="timeline-row"><Target size={14} /><div><strong>Generate flashcards</strong><em>Available after uploading readings or slides.</em></div></div>
              <div className="timeline-row"><HelpCircle size={14} /><div><strong>Generate quizzes</strong><em>Available after uploading readings or slides.</em></div></div>
            </div>
          </section>
        </div>
      </section>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <section className="phase3-card syllabus-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Syllabus import</p>
          <h1>Extract course structure and deadlines</h1>
          <span>Parse syllabus text, review and edit, then confirm import.</span>
        </div>
        <div className="phase3-actions">
          <button className="outline-button" onClick={() => onCreate('syllabus')}><Upload size={15} /> New syllabus note</button>
          {!review
            ? <button className="review-button" onClick={handleParse} disabled={!parseText || parsing}><Sparkles size={15} /> {parsing ? 'Parsing...' : 'Parse syllabus'}</button>
            : <button className="review-button" onClick={handleConfirm} disabled={confirming}><Sparkles size={15} /> {confirming ? 'Importing...' : 'Confirm import'}</button>
          }
        </div>
      </header>
      {error && (
        <div className="phase3-error" role="alert">
          <strong>Something went wrong:</strong> {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {!review && (
        <div className="syllabus-grid">
          <section className="phase3-panel">
            <h2>Upload syllabus PDF</h2>
            <PdfTextImportControl
              title="Upload PDF syllabus"
              description="Extract embedded PDF text locally and send it through the existing syllabus parser."
              onText={handleSyllabusPdfText}
              onTooShort={(message) => {
                setError(message)
                onStatus(message)
              }}
              onError={(message) => {
                setError(message)
                onStatus(message)
              }}
            />
            <h2>Paste syllabus text</h2>
            <textarea
              className="syllabus-paste-area"
              placeholder="Paste your syllabus text here (plain text works best)..."
              value={rawPaste}
              onChange={e => setRawPaste(e.target.value)}
              rows={12}
            />
            {rawPaste.trim() && (
              <p className="empty-hint" style={{ marginTop: 6 }}>{rawPaste.trim().split('\n').length} lines pasted. Click "Parse syllabus" to extract.</p>
            )}
            {/* Image OCR fallback (port from syllabus-scanner concept).
                Drops the OCR'd text into the same paste area so the existing
                regex parser handles it identically to typed/pasted text. */}
            <ScanSyllabusDropZone onText={(text) => setRawPaste(prev => prev ? `${prev}\n\n${text}` : text)} />
          </section>
          <section className="phase3-panel wide">
            {selected && selectedText && !rawPaste.trim() ? (
              <>
                <h2>Or use selected note</h2>
                <div className="source-preview">
                  <FileText size={22} />
                  <strong>{selected.title ?? 'Untitled'}</strong>
                  <span>{selected.documentType?.replace('_', ' ') ?? 'document'}</span>
                </div>
                <p className="empty-hint" style={{ marginTop: 8 }}>Note content will be used if the paste area is empty.</p>
              </>
            ) : !rawPaste.trim() ? (
              <>
                <h2>Or select a syllabus note</h2>
                <p className="empty-hint">Create a syllabus note from the sidebar, paste text into it, then return here.</p>
              </>
            ) : (
              <p className="empty-hint">Pasted text will be used. Click "Parse syllabus" to extract course structure.</p>
            )}
          </section>
        </div>
      )}

      {review && (
        <div className="syllabus-grid">
          {/* ── Course info (editable) ─────────────────────────────── */}
          <section className="phase3-panel">
            <h2>Course info</h2>
            <div className="syllabus-form">
              <label>Code <input value={review.course.code ?? ''} onChange={e => updateCourse('code', e.target.value)} /></label>
              <label>Name <input value={review.course.name ?? ''} onChange={e => updateCourse('name', e.target.value)} /></label>
              <label>Instructor <input value={review.course.professorName ?? ''} onChange={e => updateCourse('professorName', e.target.value)} /></label>
              <label>Email <input value={review.course.professorEmail ?? ''} onChange={e => updateCourse('professorEmail', e.target.value)} /></label>
              <label>Term <input value={review.course.term ?? ''} onChange={e => updateCourse('term', e.target.value)} /></label>
            </div>
            {review.classMeetings.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Class meetings</h2>
                {review.classMeetings.map((m, i) => (
                  <div className="timeline-row" key={i}>
                    <Clock3 size={14} />
                    <div>
                      <strong>{m.days.join('/')}</strong>
                      <em>{m.startTime} - {m.endTime}</em>
                      {m.location && <em>{m.location}</em>}
                    </div>
                  </div>
                ))}
              </>
            )}
            {review.readings.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Readings ({review.readings.length})</h2>
                {review.readings.slice(0, 10).map((r, i) => (
                  <div className="timeline-row" key={i}>
                    <BookOpen size={14} />
                    <div><strong>{r.title}</strong>{r.chapter && <em>{r.chapter}</em>}</div>
                  </div>
                ))}
                {review.readings.length > 10 && <p className="empty-hint">+{review.readings.length - 10} more</p>}
              </>
            )}
            {review.scheduleRowCount > 0 && (
              <p className="empty-hint" style={{ marginTop: 8 }}>{review.scheduleRowCount} schedule row(s) extracted.</p>
            )}
          </section>

          {/* ── Right column: assignments, deadlines, setup ────────── */}
          <section className="phase3-panel wide">
            {/* Assignments */}
            <h2>Assignments ({review.assignments.filter(a => a.included).length}/{review.assignments.length})</h2>
            {review.assignments.length === 0 && <EmptyHint message="No assignments found" hint="No graded components detected." />}
            {review.assignments.map((a, i) => (
              <div className="timeline-row" key={`a-${i}`}>
                <input type="checkbox" checked={a.included} onChange={() => toggleAssignment(i)} />
                <div style={{ flex: 1 }}>
                  <input className="syllabus-inline-edit" value={a.title} onChange={e => editAssignment(i, 'title', e.target.value)} />
                  <em>
                    {a.weight && <span>{a.weight}</span>}
                    {a.dueDate && <span> - {formatDue(a.dueDate)}</span>}
                    {' '}{a.type}
                  </em>
                </div>
              </div>
            ))}

            {/* Deadlines */}
            <h2 style={{ marginTop: 16 }}>Deadlines ({review.deadlines.filter(d => d.included).length}/{review.deadlines.length})</h2>
            {review.deadlines.length === 0 && <EmptyHint message="No deadlines found" hint="No dates detected in this document." />}
            {review.deadlines.map((d, i) => (
              <div className="timeline-row" key={`d-${i}`}>
                <input type="checkbox" checked={d.included} onChange={() => toggleDeadline(i)} />
                <div style={{ flex: 1 }}>
                  <input className="syllabus-inline-edit" value={d.title} onChange={e => editDeadline(i, 'title', e.target.value)} />
                  <em>
                    {formatDue(d.deadlineAt)}
                    {' - '}
                    <select className="syllabus-inline-select" value={d.type} onChange={e => editDeadline(i, 'type', e.target.value)}>
                      <option value="assignment">assignment</option>
                      <option value="exam">exam</option>
                      <option value="quiz">quiz</option>
                      <option value="reading">reading</option>
                      <option value="project">project</option>
                      <option value="presentation">presentation</option>
                      <option value="other">other</option>
                    </select>
                  </em>
                </div>
              </div>
            ))}

            {/* Setup tasks */}
            {review.setupTasks.length > 0 && (
              <>
                <h2 style={{ marginTop: 16 }}>Setup tasks ({review.setupTasks.filter(t => t.included).length}/{review.setupTasks.length})</h2>
                {review.setupTasks.map((t, i) => (
                  <div className="timeline-row" key={`s-${i}`}>
                    <input type="checkbox" checked={t.included} onChange={() => toggleSetup(i)} />
                    <div style={{ flex: 1 }}>
                      <input className="syllabus-inline-edit" value={t.title} onChange={e => editSetup(i, 'title', e.target.value)} />
                      <em>
                        <select className="syllabus-inline-select" value={t.category} onChange={e => editSetup(i, 'category', e.target.value)}>
                          <option value="textbook">textbook</option>
                          <option value="software">software</option>
                          <option value="account">account</option>
                          <option value="material">material</option>
                          <option value="other">other</option>
                        </select>
                      </em>
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

function ClassModeView({
  currentCourse,
  captures,
  confusions,
  classSessions,
  onStartClass,
  onResolveConfusion,
  onEndClassSession,
  onRefresh,
}: {
  currentCourse?: Course
  captures: Capture[]
  confusions: ConfusionItem[]
  classSessions: ClassSession[]
  onStartClass: () => Promise<void>
  onResolveConfusion: (id: string) => Promise<void>
  onEndClassSession: (id: string) => Promise<void>
  onRefresh: () => void
}) {
  const [questionInput, setQuestionInput] = useState('')
  const [actionInput, setActionInput] = useState('')
  const activeSession = classSessions.find(session => !session.endedAt)
  const recentSessions = classSessions.filter(s => s.endedAt).slice(0, 3)

  async function addQuestion() {
    if (!questionInput.trim() || !activeSession) return
    const text = questionInput.trim()
    await ipc.invoke('class:update', { id: activeSession.id, patch: { questions: [...activeSession.questions, text] } })
    // Also create a confusion item
    await ipc.invoke('confusion:create', { question: text, context: `Asked during: ${activeSession.title}`, courseId: activeSession.courseId })
    setQuestionInput('')
    onRefresh()
  }

  async function addActionItem() {
    if (!actionInput.trim() || !activeSession) return
    const text = actionInput.trim()
    await ipc.invoke('class:update', { id: activeSession.id, patch: { actionItems: [...activeSession.actionItems, text] } })
    setActionInput('')
    onRefresh()
  }

  return (
    <section className="phase3-card class-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Class mode</p>
          <h1>{currentCourse ? `${currentCourse.code ?? currentCourse.name} session` : 'Live class capture'}</h1>
          <span>Capture notes, questions, and follow-ups during class.</span>
        </div>
        {activeSession
          ? <button className="outline-button phase4-end" onClick={() => onEndClassSession(activeSession.id)}><Clock3 size={15} /> End class</button>
          : <button className="review-button" onClick={onStartClass}><GraduationCap size={15} /> Start class</button>
        }
      </header>
      <div className="class-grid">
        <section className="phase3-panel wide">
          <h2>{activeSession ? `Active: ${activeSession.title}` : 'Captures'}</h2>
          {activeSession && (
            <div className="class-inputs">
              <div className="class-input-row">
                <input value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Add a question..." onKeyDown={e => e.key === 'Enter' && addQuestion()} />
                <button className="inline-action" onClick={addQuestion} disabled={!questionInput.trim()}>+ Question</button>
              </div>
              <div className="class-input-row">
                <input value={actionInput} onChange={e => setActionInput(e.target.value)} placeholder="Add an action item..." onKeyDown={e => e.key === 'Enter' && addActionItem()} />
                <button className="inline-action" onClick={addActionItem} disabled={!actionInput.trim()}>+ Action</button>
              </div>
              {activeSession.questions.length > 0 && (
                <div className="class-list">
                  <strong>Questions ({activeSession.questions.length})</strong>
                  {activeSession.questions.slice(-3).map((q, i) => <div className="compact-row" key={i}><HelpCircle size={14} /><span>{q}</span></div>)}
                </div>
              )}
              {activeSession.actionItems.length > 0 && (
                <div className="class-list">
                  <strong>Action items ({activeSession.actionItems.length})</strong>
                  {activeSession.actionItems.slice(-3).map((a, i) => <div className="compact-row" key={i}><Target size={14} /><span>{a}</span></div>)}
                </div>
              )}
            </div>
          )}
          {!activeSession && captures.length > 0
            ? captures.slice(0, 5).map(capture => (
                <div className="capture-row" key={capture.id}>
                  <PenLine size={16} />
                  <p>{capture.text}</p>
                </div>
              ))
            : !activeSession && <EmptyHint message="No captures" hint="Highlight text in any app during class to capture it here." />
          }
          {recentSessions.length > 0 && (
            <>
              <h2 className="section-spacer">Recent sessions</h2>
              {recentSessions.map(session => (
                <div className="compact-row" key={session.id}>
                  <GraduationCap size={16} />
                  <div><strong>{session.title}</strong><em>{new Date(session.startedAt).toLocaleDateString()}</em></div>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="phase3-panel">
          <h2>Unresolved questions</h2>
          {confusions.length > 0
            ? confusions.slice(0, 4).map(item => (
                <div className="compact-row action-row" key={item.id}>
                  <HelpCircle size={18} />
                  <div><strong>{item.question}</strong><em>{item.nextStep ?? item.status}</em></div>
                  <button onClick={() => onResolveConfusion(item.id)}>Resolve</button>
                </div>
              ))
            : <EmptyHint message="No unresolved questions" hint="Questions captured during class appear here." />
          }
        </section>
      </div>
    </section>
  )
}

function MetricCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return (
    <article className="metric-card">
      <span>{icon}</span>
      <div><strong>{value}</strong><em>{label}</em></div>
      <small>{detail}</small>
    </article>
  )
}

function WorkspaceSection({ title, children, onAdd, count }: { title: string; children: React.ReactNode; onAdd?: () => void; count?: number }) {
  return (
    <section className="workspace-section">
      <header>
        <h2>{title}{typeof count === 'number' && count > 0 && <span className="section-count">{count}</span>}</h2>
        {onAdd && <button onClick={onAdd}>+</button>}
      </header>
      {children}
    </section>
  )
}

function QuickAddSheet({
  kind,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  kind: QuickAddKind
  form: QuickAddForm
  onChange: (form: QuickAddForm) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const titleLabel = kind === 'course' ? 'Course name' : kind === 'question' ? 'Question' : kind === 'study' ? 'Front' : 'Title'
  const detailLabel = kind === 'study' ? 'Back' : kind === 'question' ? 'Context' : 'Details'
  return (
    <div className="quick-add-backdrop">
      <form className="quick-add-sheet" onSubmit={onSubmit}>
        <header>
          <div>
            <p className="phase3-eyebrow">Quick add</p>
            <h2>{quickAddTitle(kind)}</h2>
          </div>
          <button type="button" className="icon-pill compact" onClick={onClose}><X size={16} /></button>
        </header>
        <label>
          <span>{titleLabel}</span>
          <input value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} autoFocus />
        </label>
        {kind === 'course' && (
          <label>
            <span>Course code</span>
            <input value={form.code} onChange={event => onChange({ ...form, code: event.target.value })} placeholder="PSYC 101" />
          </label>
        )}
        {kind === 'deadline' && (
          <label>
            <span>Due date</span>
            <input type="datetime-local" value={form.due} onChange={event => onChange({ ...form, due: event.target.value })} />
          </label>
        )}
        {kind !== 'course' && kind !== 'deadline' && (
          <label>
            <span>{detailLabel}</span>
            <textarea value={form.detail} onChange={event => onChange({ ...form, detail: event.target.value })} rows={4} />
          </label>
        )}
        <footer>
          <button type="button" className="outline-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="review-button">Add</button>
        </footer>
      </form>
    </div>
  )
}

function quickAddTitle(kind: QuickAddKind) {
  switch (kind) {
    case 'course': return 'Course'
    case 'deadline': return 'Deadline'
    case 'assignment': return 'Assignment prompt'
    case 'syllabus': return 'Syllabus note'
    case 'study': return 'Flashcard'
    case 'question': return 'Question'
    case 'note':
    default: return 'Note'
  }
}

function EmptyHint({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="empty-hint">
      <strong>{message}</strong>
      <span>{hint}</span>
    </div>
  )
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return <div className="check-row"><span className={done ? 'done' : ''}>{done ? '✓' : '○'}</span><span className={done ? 'done' : ''}>{label}</span></div>
}

function SidebarItem({ title, meta, icon, tone, active, onClick, badge }: { title: string; meta: string; icon: React.ReactNode; tone: string; active?: boolean; onClick?: () => void; badge?: { label: string; variant: 'imported' | 'parsed' | 'pending' } }) {
  return (
    <button className={`sidebar-item ${tone} ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="section-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
      {badge && <span className={`sidebar-badge sidebar-badge-${badge.variant}`}>{badge.label}</span>}
    </button>
  )
}

function Panel({ title, children, action, badge }: { title: string; children: React.ReactNode; action?: string; badge?: string }) {
  return <section className="studydesk-panel"><header><h2>{title}</h2>{action && <button>{action}</button>}{badge && <span>{badge}</span>}</header>{children}</section>
}

function MaterialsFolderRow({ course, onPick, onClear }: { course: Course; onPick: () => void; onClear: () => void }) {
  const folder = course.materialsFolderPath
  const importedCount = (course.materialsImportedFiles ?? []).filter(r => r.noteId).length
  if (!folder) {
    return (
      <button className="materials-folder-row materials-folder-empty" onClick={onPick}>
        <Folder size={13} />
        <span>Watch a Materials folder…</span>
      </button>
    )
  }
  const display = folder.split('/').slice(-2).join('/')
  return (
    <div className="materials-folder-row">
      <Folder size={13} />
      <div className="materials-folder-info">
        <strong>{display}</strong>
        <em>{importedCount} imported · auto-watching</em>
      </div>
      <button className="materials-folder-clear" onClick={onClear} title="Stop watching this folder">×</button>
    </div>
  )
}

function RailItem({ title, meta, icon, status, hot, source, onSourceClick }: { title: string; meta: string; icon: React.ReactNode; status?: string; hot?: boolean; source?: string; onSourceClick?: () => void }) {
  return (
    <article className={`studydesk-rail-item ${hot ? 'hot' : ''}`}>
      <span className="rail-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <em>{meta}</em>
        {source && (
          <button className="rail-source" onClick={onSourceClick} title={`Open source: ${source}`}>
            <FileText size={10} /> {source}
          </button>
        )}
      </div>
      {status && <small>{status}</small>}
    </article>
  )
}

function QueueRow({ title, meta }: { title: string; meta: string }) {
  return <div className="queue-row"><strong>{title}</strong><span>{meta}</span><button><Play size={12} fill="currentColor" /></button></div>
}

function RailText({ title, meta }: { title: string; meta: string }) {
  return <div className="rail-text"><strong>{title}</strong><span>{meta}</span><ChevronRight size={13} /></div>
}

function AlertCard({ alert, onDismiss, onResolve }: { alert: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>; onDismiss: () => void; onResolve: () => void }) {
  return <div className="studydesk-alert"><Target size={19} /><div><strong>{alert.title}</strong><span>{alert.reason}</span></div><button onClick={onResolve}>Resolve</button><button onClick={onDismiss}>Dismiss</button></div>
}

/** Talk / sidecar pane (MediaWiki port) — scratch space per note for
 *  questions, meta-thoughts, TODOs. Plain-text textarea (no TipTap)
 *  to keep friction low. Collapsed by default; click the header to
 *  expand. Auto-saves with a 700ms debounce. */
function ScratchPane({ note, onUpdate }: { note: Note; onUpdate: (patch: Partial<Note>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(note.scratch ?? '')
  const lastSaved = useRef(note.scratch ?? '')
  const timer = useRef<number>(0)

  // When the user navigates to a different note, reset draft to its scratch
  useEffect(() => {
    setDraft(note.scratch ?? '')
    lastSaved.current = note.scratch ?? ''
  }, [note.id])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setDraft(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (v !== lastSaved.current) {
        lastSaved.current = v
        onUpdate({ scratch: v }).catch(() => {})
      }
    }, 700)
  }

  // Cleanup on unmount
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const lineCount = draft.trim() ? draft.trim().split('\n').length : 0
  const hasContent = lineCount > 0

  return (
    <section className={`document-scratch ${open ? 'is-open' : ''} ${hasContent ? 'has-content' : ''}`} aria-label="Scratch / questions">
      <button className="document-scratch-toggle" onClick={() => setOpen(o => !o)}>
        <span className="document-scratch-icon">💬</span>
        <span>Scratch</span>
        {hasContent && <em>{lineCount} line{lineCount === 1 ? '' : 's'}</em>}
        <span className="document-scratch-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <textarea
          className="document-scratch-area"
          value={draft}
          onChange={handleChange}
          placeholder="Quick thoughts, questions to ask the prof, things to verify…"
          rows={6}
        />
      )}
    </section>
  )
}

/** Story-river card (TiddlyWiki port). Shows a stacked, read-only
 *  preview of a note that was opened by clicking a [[wiki-link]] in
 *  another note. Clicking "Open" promotes it to the primary editor
 *  (replaces selected, clears the river); clicking × removes just
 *  this card. Uses @tiptap/html generateHTML so we don't pay the cost
 *  of mounting a full TipTap editor per river card. */
function RiverNoteCard({ note, onOpen, onClose }: { note: Note; onOpen: () => void; onClose: () => void }) {
  const html = useMemo(() => {
    try {
      const json = JSON.parse(note.content)
      // Lazy-import the same extensions the import pipeline uses to avoid
      // bringing them into the App.tsx top-level import graph.
      const { generateHTML } = require('@tiptap/html')
      const StarterKit = require('@tiptap/starter-kit').default
      const Underline = require('@tiptap/extension-underline').default
      return generateHTML(json, [StarterKit, Underline])
    } catch {
      // Plain-text fallback for malformed or empty content
      return `<p>${(note.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`
    }
  }, [note.content])

  return (
    <article className="river-note-card">
      <header className="river-note-card-header">
        <span className="river-note-card-title">{note.title || 'Untitled'}</span>
        <span className="river-note-card-meta">{(note.documentType ?? 'note').replace('_', ' ')}</span>
        <button className="river-note-card-action" onClick={onOpen} title="Open in main editor">Open</button>
        <button className="river-note-card-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="river-note-card-body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}

function formatDue(value: number) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
