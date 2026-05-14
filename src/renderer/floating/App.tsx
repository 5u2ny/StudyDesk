import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppState } from '@shared/hooks/useAppState'
import { PHASE_LABELS } from '@shared/constants'
import type { TimerPhase } from '@shared/types'
import { ipc } from '@shared/ipc-client'
import type {
  AcademicDeadline,
  AttentionAlert,
  Capture,
  ClassSession,
  ConfusionItem,
  Course,
  Note,
  Settings,
  StudyItem,
  Todo,
} from '@schema'
import { OnboardingScreen } from './components/OnboardingScreen'
import { SettingsPanel } from './components/SettingsPanel'
import {
  startLofi,
  pauseLofi,
  isLofiEnabled,
  setLofiEnabled,
} from './lofiPlayer'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { cn } from '@shared/lib/utils'
import { parseQuickAdd } from '@shared/lib/quickAddMagic'
import {
  getNotchBadges,
  getNotchIdleChips,
  getNotchLiveStatus,
  type NotchFeatureId,
} from './notch/notchModel'
import { getNotchSize, type NotchState } from './notch/notchSizing'
import { NotchShell } from './notch/NotchShell'
import type { NotchDockItem } from './notch/NotchFeatureButton'
import {
  ArrowRight,
  Bell,
  Bookmark,
  Brain,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  GraduationCap,
  Plus,
} from 'lucide-react'
// Hand-crafted SF-Symbols-style icons — crisp at 14–16px, no third-
// party glyph library, matches macOS 26 menu-bar aesthetic.
import { IconTarget, IconCalendar, IconGear, IconCourses, IconBookmark, IconTimer } from './notch/SFIcons'

const PHASE_RGB: Record<TimerPhase, [number, number, number]> = {
  focus: [255, 77, 77],
  break: [48, 209, 88],
  longBreak: [10, 132, 255],
  rest: [148, 163, 184],
}

const ONBOARD = { w: 480, h: 520 }
const SETTINGS = { w: 560, h: 640 }

type FeatureId = NotchFeatureId

interface TodaySummary {
  currentFocusTask?: Todo
  nextDeadline?: AcademicDeadline
  dueToday: AcademicDeadline[]
  dueTomorrow: AcademicDeadline[]
  dueThisWeek: AcademicDeadline[]
  criticalAlerts: unknown[]
  activeAssignment?: unknown
  unresolvedConfusions: ConfusionItem[]
  classSessionsToday: ClassSession[]
  recommendedNextAction: string
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function dueLabel(ts?: number) {
  if (!ts) return 'No date'
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function App() {
  const state = useAppState()
  const [activePopover, setActivePopover] = useState<FeatureId | null>(() => (window as any).__FOCUS_OS_WEB_PREVIEW__ ? 'today' : null)
  const [workspaceOpening, setWorkspaceOpening] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [focusSettings, setFocusSettings] = useState<Settings | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [captures, setCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [attentionAlerts, setAttentionAlerts] = useState<AttentionAlert[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [today, setToday] = useState<TodaySummary | null>(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('')
  const [newDeadlineDate, setNewDeadlineDate] = useState('')
  const [newStudyFront, setNewStudyFront] = useState('')
  // Quick-typed capture (port from shpetimhaxhiu/simple-electron-notes-app):
  // frictionless typed input in the notch popover, no need to select text first.
  const [quickCaptureText, setQuickCaptureText] = useState('')
  const [captureAutoEnabled, setCaptureAutoEnabled] = useState(false)
  const [captureFlash, setCaptureFlash] = useState(false)
  const [hoverDock, setHoverDock] = useState(false)
  const activeTrigger = useRef<FeatureId | null>(null)
  const triggerRefs = useRef<Partial<Record<FeatureId, HTMLButtonElement | null>>>({})

  // Live hardware notch height. Idle / hoverDock / workspaceOpening all
  // use this for window height so the shell matches the physical notch
  // pixel-for-pixel; activePopover keeps its own larger height.
  const [notchHeight, setNotchHeight] = useState<number>(38)
  useEffect(() => {
    window.focusAPI.getNotchHeight?.().then((h: number) => {
      if (h && h > 0) {
        setNotchHeight(h)
        document.documentElement.style.setProperty('--actual-notch-height', `${h}px`)
      }
    }).catch(() => {})
  }, [])

  const resizeNotch = useCallback((notchState: NotchState) => {
    const size = getNotchSize(notchState)
    const h = notchState === 'activePopover' ? size.h : notchHeight
    window.focusAPI.resizeWindow(h, size.w, true)
  }, [notchHeight])

  const refreshAcademic = useCallback(async () => {
    const [todayData, courseData, deadlineData, captureData, studyData, confusionData, alertData, noteData, autoCaptureStatus] = await Promise.all([
      ipc.invoke<TodaySummary>('today:get'),
      ipc.invoke<Course[]>('course:list', {}),
      ipc.invoke<AcademicDeadline[]>('deadline:list', {}),
      ipc.invoke<Capture[]>('capture:list', { limit: 80 }),
      ipc.invoke<StudyItem[]>('study:list', {}),
      ipc.invoke<ConfusionItem[]>('confusion:list', {}),
      ipc.invoke<AttentionAlert[]>('attentionAlerts:list', {}),
      ipc.invoke<Note[]>('notes:list'),
      ipc.invoke<{ enabled: boolean }>('capture:autoStatus').catch(() => ({ enabled: false })),
    ])
    setToday(todayData)
    setCourses(courseData)
    setDeadlines(deadlineData)
    setCaptures(captureData)
    setStudyItems(studyData)
    setConfusions(confusionData)
    setAttentionAlerts(alertData)
    setNotes(noteData)
    setCaptureAutoEnabled(Boolean(autoCaptureStatus?.enabled))
  }, [])

  useEffect(() => {
    ipc.invoke<Settings>('focus:settings:get').then(s => {
      setFocusSettings(s)
      if (s && !s.hasCompletedOnboarding) window.focusAPI.resizeWindow(ONBOARD.h, ONBOARD.w)
      else resizeNotch('idle')
    }).catch(() => {})
    refreshAcademic().catch(() => {})
  }, [refreshAcademic, resizeNotch])

  useEffect(() => {
    if (state?.currentTask && state.currentTask !== taskInput) setTaskInput(state.currentTask)
  }, [state?.currentTask])

  useEffect(() => {
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
      setCaptureFlash(true)
      setTimeout(() => setCaptureFlash(false), 1400)
      activeTrigger.current = 'capture'
      setActivePopover('capture')
      resizeNotch('activePopover')
    })
    ipc.on('gmail:newEmails', () => refreshAcademic().catch(() => {}))
    ipc.on('ui:openSettings', () => {
      setActivePopover(null)
      setShowSettings(true)
      window.focusAPI.resizeWindow(SETTINGS.h, SETTINGS.w, false)
    })
    return () => {
      ipc.off('capture:new')
      ipc.off('gmail:newEmails')
      ipc.off('ui:openSettings')
    }
  }, [refreshAcademic, resizeNotch])

  useEffect(() => {
    if (!state) return
    const [r, g, b] = PHASE_RGB[state.phase] ?? PHASE_RGB.focus
    const root = document.documentElement
    root.style.setProperty('--phase-r', String(r))
    root.style.setProperty('--phase-g', String(g))
    root.style.setProperty('--phase-b', String(b))
  }, [state?.phase])

  const handleStartPause = useCallback(async () => {
    if (!state) return
    if (taskInput.trim() && taskInput !== state.currentTask) await window.focusAPI.setTask(taskInput.trim())
    if (state.isRunning) {
      await window.focusAPI.pauseTimer()
      // Pair the timer with focus music — pause it when the timer
      // pauses so the silence cues "you're not in a session right now".
      pauseLofi()
    } else {
      await window.focusAPI.startTimer()
      // Only auto-start lo-fi when entering a focus phase — break /
      // long-break / rest phases stay quiet so you actually rest.
      if (state.phase === 'focus') startLofi()
    }
  }, [state, taskInput])

  // If the timer ends naturally (or transitions to a non-focus phase),
  // stop the music. We watch state.phase + state.isRunning for changes.
  useEffect(() => {
    if (!state) return
    if (!state.isRunning || state.phase !== 'focus') pauseLofi()
  }, [state?.isRunning, state?.phase])

  const togglePopover = useCallback((next: FeatureId) => {
    activeTrigger.current = next
    setActivePopover(current => {
      const value = current === next ? null : next
      resizeNotch(value ? 'activePopover' : 'idle')
      return value
    })
  }, [resizeNotch])

  const closePopover = useCallback((returnFocus = true) => {
    const lastTrigger = activeTrigger.current
    setActivePopover(null)
    setHoverDock(false)
    resizeNotch('idle')
    if (returnFocus && lastTrigger) {
      requestAnimationFrame(() => triggerRefs.current[lastTrigger]?.focus())
    }
  }, [resizeNotch])

  const openSettingsPanel = useCallback(() => {
    setActivePopover(null)
    setShowSettings(true)
    window.focusAPI.resizeWindow(SETTINGS.h, SETTINGS.w, false)
  }, [])

  const addCourse = useCallback(async () => {
    if (!newCourseName.trim()) return
    await ipc.invoke('course:create', { name: newCourseName.trim(), code: newCourseCode.trim() || undefined })
    setNewCourseName('')
    setNewCourseCode('')
    await refreshAcademic()
  }, [newCourseName, newCourseCode, refreshAcademic])

  const addDeadline = useCallback(async () => {
    // Vikunja-port quickAddMagic: one input parses title + date + labels +
    // course code (+) + priority (!) all at once. The first input field
    // (newDeadlineTitle) is now the natural-language entry; newDeadlineDate
    // is kept as a fallback if the user pasted a raw date string.
    const raw = newDeadlineTitle.trim()
    if (!raw) return

    const parsed = parseQuickAdd(raw)
    let deadlineAt: number | undefined = parsed.deadlineAt
    // Fallback: secondary input still has a typed date
    if (!deadlineAt && newDeadlineDate) {
      const d = new Date(newDeadlineDate)
      if (!Number.isNaN(d.getTime())) deadlineAt = d.getTime()
    }
    if (!deadlineAt) return  // can't create a deadline without a date

    // Resolve +courseCode to a course id (case-insensitive match against
    // both `code` and `name`)
    let courseId: string | undefined
    if (parsed.courseCode) {
      const q = parsed.courseCode.toLowerCase()
      const match = courses.find(c =>
        (c.code ?? '').toLowerCase() === q || c.name.toLowerCase() === q
      )
      if (match) courseId = match.id
    }

    await ipc.invoke('deadline:create', {
      title: parsed.title || raw,
      deadlineAt,
      type: 'assignment',
      courseId,
      confirmed: true,
    })
    setNewDeadlineTitle('')
    setNewDeadlineDate('')
    await refreshAcademic()
  }, [newDeadlineTitle, newDeadlineDate, courses, refreshAcademic])

  const completeDeadline = useCallback(async (id: string) => {
    await ipc.invoke('deadline:complete', { id })
    await refreshAcademic()
  }, [refreshAcademic])

  const addStudyItem = useCallback(async () => {
    if (!newStudyFront.trim()) return
    await ipc.invoke('study:create', { front: newStudyFront.trim(), type: 'flashcard' })
    setNewStudyFront('')
    await refreshAcademic()
  }, [newStudyFront, refreshAcademic])

  const addQuickCapture = useCallback(async () => {
    const text = quickCaptureText.trim()
    if (!text) return
    await ipc.invoke('capture:save', { text, source: 'manual' })
    setQuickCaptureText('')
    // The IPC handler also broadcasts capture:new which our existing
    // listener picks up to refresh the captures list — no manual refresh needed.
  }, [quickCaptureText])

  const toggleAutoCapture = useCallback(async () => {
    const channel = captureAutoEnabled ? 'capture:stopAuto' : 'capture:startAuto'
    const result = await ipc.invoke<{ enabled: boolean }>(channel)
    setCaptureAutoEnabled(Boolean(result?.enabled))
  }, [captureAutoEnabled])

  const captureToStudy = useCallback(async (capture: Capture, type: StudyItem['type']) => {
    await ipc.invoke('study:create', { front: capture.text, type, sourceCaptureId: capture.id, courseId: capture.courseId })
    await ipc.invoke('capture:update', { id: capture.id, patch: { labels: [...(capture.labels ?? []), type === 'flashcard' ? 'flashcard' : 'key_concept'] } })
    await refreshAcademic()
  }, [refreshAcademic])

  const captureToConfusion = useCallback(async (capture: Capture) => {
    await ipc.invoke('confusion:create', { question: capture.text, sourceCaptureId: capture.id, courseId: capture.courseId })
    await ipc.invoke('capture:update', { id: capture.id, patch: { labels: [...(capture.labels ?? []), 'confusing'] } })
    await refreshAcademic()
  }, [refreshAcademic])

  const dismissAttentionAlert = useCallback(async (id: string) => {
    await ipc.invoke('attentionAlerts:dismiss', { id })
    await refreshAcademic()
  }, [refreshAcademic])

  const snoozeAttentionAlert = useCallback(async (id: string) => {
    await ipc.invoke('attentionAlerts:snooze', { id, snoozedUntil: Date.now() + 60 * 60_000 })
    await refreshAcademic()
  }, [refreshAcademic])

  const openWorkspace = useCallback(async () => {
    setWorkspaceOpening(true)
    try {
      await ipc.invoke('window:openWorkspace', {})
      closePopover(false)
    } finally {
      setWorkspaceOpening(false)
    }
  }, [closePopover])

  const closeSettings = useCallback(() => {
    setShowSettings(false)
    resizeNotch(activePopover ? 'activePopover' : 'idle')
    ipc.invoke<Settings>('focus:settings:get').then(setFocusSettings).catch(() => {})
  }, [activePopover, resizeNotch])

  useEffect(() => {
    const tabByDigit: Record<string, FeatureId> = {
      '1': 'today',
      '2': 'courses',
      '3': 'deadlines',
      '4': 'capture',
      '5': 'study',
      '6': 'alerts',
      '7': 'workspace',
      '8': 'settings',
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showSettings) { closeSettings(); return }
        if (activePopover) closePopover()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="working on"]')
        input?.focus()
        input?.select()
      } else if ((e.metaKey || e.ctrlKey) && tabByDigit[e.key]) {
        e.preventDefault()
        togglePopover(tabByDigit[e.key])
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleStartPause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePopover, showSettings, closeSettings, closePopover, togglePopover, handleStartPause])

  // Cap click: if no popover open, open "today" as default feature.
  // If a popover is already open, close it.
  const handleCapClick = useCallback(() => {
    if (showSettings) return
    if (activePopover) {
      closePopover()
    } else {
      togglePopover('today')
    }
  }, [activePopover, showSettings, closePopover, togglePopover])

  const setTriggerRef = useCallback((id: FeatureId, node: HTMLButtonElement | null) => {
    triggerRefs.current[id] = node
  }, [])

  const handleFeatureClick = useCallback((id: FeatureId) => {
    togglePopover(id)
  }, [togglePopover])

  if (focusSettings && !focusSettings.hasCompletedOnboarding) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl p-6 overflow-auto pretty-scroll">
          <OnboardingScreen
            onComplete={() => {
              ipc.invoke('focus:settings:update', { hasCompletedOnboarding: true })
              setFocusSettings(s => s ? { ...s, hasCompletedOnboarding: true } : s)
              resizeNotch('idle')
            }}
          />
        </div>
      </div>
    )
  }

  if (showSettings && state) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl overflow-hidden">
          <SettingsPanel
            settings={state.settings}
            focusSettings={focusSettings}
            onSave={async (s) => { await window.focusAPI.saveSettings(s) }}
            onClose={closeSettings}
          />
        </div>
      </div>
    )
  }

  if (!state) {
    // Don't paint the Liquid-Glass spotlight-surface during the brief
    // window between mount and first IPC response — that was the
    // "translucent blue bar shows on launch" bug. The native notch
    // pill (drawn by notch_helper.makePanel) stays visible regardless;
    // returning a transparent placeholder keeps everything else off-
    // screen until real state arrives.
    return <div className="h-full w-full" />
  }

  const phaseLabel = PHASE_LABELS[state.phase]
  const nextDeadline = today?.nextDeadline
  const dueTodayCount = (today?.dueToday ?? []).length
  const timerLabel = `${fmt(state.remainingSeconds)} ${phaseLabel}`
  const liveStatus = getNotchLiveStatus({
    alerts: attentionAlerts,
    isRunning: state.isRunning,
    timerLabel: `${fmt(state.remainingSeconds)} ${phaseLabel.toLowerCase()}`,
    captureFlash,
    nextDeadline,
    studyItems,
  })
  const badges = getNotchBadges({ dueTodayCount, captures, studyItems, alerts: attentionAlerts })
  const idleChips = getNotchIdleChips({
    timerLabel,
    nextDeadline,
    studyItems,
    formatDeadline: deadline => `${deadline.title} · ${dueLabel(deadline.deadlineAt)}`,
  })

  // Right-wing dock — four SF-Symbols-style icons, visible on hover.
  // Each one maps to a popover that's actually useful from the notch
  // (i.e. things you want to do without opening the full workspace).
  // Courses + full settings live in the workspace — no point duplicating.
  const dockItems: NotchDockItem[] = [
    { id: 'today',     label: 'Today',     title: 'What needs attention now',          icon: <IconTarget size={14} /> },
    { id: 'capture',   label: 'Capture',   title: 'Drop a thought into the queue',     icon: <IconBookmark size={14} />, badge: badges.capture },
    { id: 'timer',     label: 'Timer',     title: 'Pomodoro durations and controls',   icon: <IconTimer size={14} /> },
    { id: 'deadlines', label: 'Deadlines', title: 'Due work, not calendar clutter',    icon: <IconCalendar size={14} />, badge: badges.deadlines },
  ]

  const PopoverContent = () => {
    switch (activePopover) {
      case 'today':
        return (
          <PopoverPanel title="Today" subtitle="What needs attention now">
            <div className="island-hero-row">
              <div>
                <p className="student-eyebrow">Start here</p>
                <h2>{today?.recommendedNextAction ?? 'Pick one academic action'}</h2>
                <p>{nextDeadline ? `${nextDeadline.title} is next. Due ${dueLabel(nextDeadline.deadlineAt)}.` : 'Add a course and deadline to build your day.'}</p>
              </div>
              <button className="student-primary-action" onClick={handleStartPause}>{state.isRunning ? 'Pause' : 'Start'} <ArrowRight size={16} /></button>
            </div>
            <CompactList>
              {(today?.dueToday ?? []).slice(0, 3).map(d => <DeadlineRow key={d.id} d={d} onComplete={() => completeDeadline(d.id)} />)}
              {(today?.dueToday ?? []).length === 0 && <EmptyState compact icon={<Check size={20} />} title="Nothing due today" body="The island will surface due work here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'courses':
        return (
          <PopoverPanel title="Courses" subtitle="Organize work by class">
            <section className="student-action-strip compact-form">
              <Input value={newCourseCode} onChange={e => setNewCourseCode(e.target.value)} placeholder="Code" />
              <Input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCourse()} placeholder="Course name" />
              <Button variant="phase" onClick={addCourse} disabled={!newCourseName.trim()}><Plus size={15} /> Add</Button>
            </section>
            <CompactList>
              {courses.slice(0, 5).map(course => <SimpleRow key={course.id} title={course.name} meta={course.code ?? 'Course'} icon={<GraduationCap size={15} />} />)}
              {courses.length === 0 && <EmptyState compact icon={<GraduationCap size={20} />} title="Add your first course" body="Courses connect deadlines, notes, captures, and study." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'deadlines': {
        const preview = newDeadlineTitle.trim() ? parseQuickAdd(newDeadlineTitle) : null
        const previewDate = preview?.deadlineAt
          ? new Date(preview.deadlineAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : null
        return (
          <PopoverPanel title="Deadlines" subtitle="Due work, not calendar clutter">
            {/* quickAddMagic input (Vikunja port): one-line natural-language
                entry. Accepts patterns like:
                  "Read Kant ch.3 tomorrow at 5pm +philosophy *urgent !1"
                where +<code> = course, *<label> = tag, !<1-5> = priority. */}
            <section className="student-action-strip compact-form">
              <Input
                value={newDeadlineTitle}
                onChange={e => setNewDeadlineTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDeadline()}
                placeholder="Quiz tomorrow 5pm +BUAD *exam !1"
              />
              <Button variant="phase" onClick={addDeadline} disabled={!preview?.deadlineAt}><Plus size={15} /> Add</Button>
            </section>
            {/* Live parse preview — so users see what was extracted */}
            {preview && previewDate && (
              <div className="quickadd-preview">
                <span className="quickadd-preview-label">Parsed:</span>
                <span className="quickadd-preview-pill quickadd-preview-date">{previewDate}</span>
                {preview.courseCode && (
                  <span className="quickadd-preview-pill quickadd-preview-course">+{preview.courseCode}</span>
                )}
                {preview.labels.map(l => (
                  <span key={l} className="quickadd-preview-pill quickadd-preview-label-tag">*{l}</span>
                ))}
                {preview.priority && (
                  <span className="quickadd-preview-pill quickadd-preview-priority">!{preview.priority}</span>
                )}
              </div>
            )}
            <CompactList>
              {deadlines.slice(0, 5).map(d => <DeadlineRow key={d.id} d={d} onComplete={() => completeDeadline(d.id)} />)}
            </CompactList>
          </PopoverPanel>
        )
      }
      case 'capture':
        return (
          <PopoverPanel title="Capture" subtitle="Turn highlights into study material">
            <section className="student-action-strip capture-watch-strip">
              <div>
                <p className="student-eyebrow">Selection capture</p>
                <h3>{captureAutoEnabled ? 'Watching selected text' : 'Paused until you start it'}</h3>
              </div>
              <Button variant={captureAutoEnabled ? 'ghost' : 'phase'} onClick={toggleAutoCapture}>
                {captureAutoEnabled ? 'Stop capture' : 'Start capture'}
              </Button>
            </section>
            {/* Typed quick-capture (port from simple-electron-notes-app): no need to
                select text first — drop a thought directly. Cmd/Ctrl+Enter saves. */}
            <section className="student-action-strip slim">
              <Input
                value={quickCaptureText}
                onChange={e => setQuickCaptureText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    addQuickCapture()
                  }
                }}
                placeholder="Drop a thought... (⌘↵ to save)"
              />
              <Button variant="phase" onClick={addQuickCapture} disabled={!quickCaptureText.trim()}>
                <Plus size={15} /> Save
              </Button>
            </section>
            <CompactList>
              {captures.slice(0, 4).map(c => (
                <article key={c.id} className="student-capture-card compact">
                  <p>{c.text}</p>
                  <div className="student-capture-actions">
                    <Button variant="ghost" size="sm" onClick={() => captureToStudy(c, 'flashcard')}>Flashcard</Button>
                    <Button variant="ghost" size="sm" onClick={() => captureToStudy(c, 'concept')}>Concept</Button>
                    <Button variant="ghost" size="sm" onClick={() => captureToConfusion(c)}>Question</Button>
                  </div>
                </article>
              ))}
              {captures.length === 0 && <EmptyState compact icon={<Bookmark size={20} />} title="No captures yet" body="Type above or highlight text in any app to capture it here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'study':
        return (
          <PopoverPanel title="Study" subtitle="Review queue and parked questions">
            <section className="student-action-strip slim">
              <Input value={newStudyFront} onChange={e => setNewStudyFront(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStudyItem()} placeholder="Create flashcard or concept" />
              <Button variant="phase" onClick={addStudyItem} disabled={!newStudyFront.trim()}><Plus size={15} /> Add</Button>
            </section>
            <CompactList>
              {studyItems.slice(0, 4).map(i => (
                <article key={i.id} className="student-simple-row">
                  <div className="student-row-icon"><Brain size={15} /></div>
                  <div className="min-w-0 flex-1"><h3>{i.front}</h3><p>{i.type} · {i.reviewCount} reviews</p></div>
                  {(['again', 'hard', 'good', 'easy'] as const).map(r => (
                    <button key={r} className="island-mini-action" onClick={() => ipc.invoke('study:review', { id: i.id, difficulty: r }).then(refreshAcademic)}>{r}</button>
                  ))}
                </article>
              ))}
              {confusions.slice(0, 2).map(c => <SimpleRow key={c.id} title={c.question} meta={c.nextStep ?? c.status} icon={<CircleHelp size={15} />} />)}
            </CompactList>
          </PopoverPanel>
        )
      case 'alerts':
        return (
          <PopoverPanel title="Local alerts" subtitle="Academic items that need attention">
            <CompactList>
              {attentionAlerts.slice(0, 5).map(alert => (
                <article key={alert.id} className="student-alert-card">
                  <div><h3>{alert.title}</h3><p>{alert.reason}</p></div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => snoozeAttentionAlert(alert.id)}>Snooze</Button>
                    <Button variant="ghost" size="sm" onClick={() => dismissAttentionAlert(alert.id)}>Dismiss</Button>
                  </div>
                </article>
              ))}
              {attentionAlerts.length === 0 && <EmptyState compact icon={<Bell size={20} />} title="No local alerts" body="Deadlines, study reviews, and unresolved questions will surface here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'workspace':
        return (
          <PopoverPanel title="StudyDesk Workspace" subtitle="Open the full native academic workspace">
            <div className="island-hero-row workspace">
              <div>
                <p className="student-eyebrow">Native app window</p>
                <h2>Write, parse, review, and plan from one study desk.</h2>
                <p>Your notes, courses, deadlines, captures, and study tools open in a dedicated desktop window.</p>
              </div>
              <button className="student-primary-action" onClick={openWorkspace} disabled={workspaceOpening}>
                {workspaceOpening ? 'Opening...' : 'Open StudyDesk'} <ArrowRight size={16} />
              </button>
            </div>
            <CompactList>
              {notes.slice(0, 4).map(note => <SimpleRow key={note.id} title={note.title || 'Untitled'} meta={note.documentType ?? 'note'} icon={<FileText size={15} />} />)}
              {notes.length === 0 && <EmptyState compact icon={<FileText size={20} />} title="No documents yet" body="Open StudyDesk to create your first note or import a syllabus." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'timer': {
        const settings = state?.settings
        const remainingMin = state ? Math.max(0, Math.ceil(state.remainingSeconds / 60)) : 0
        const phaseTotalMin = state ? Math.round(state.totalSeconds / 60) : 0
        return (
          <PopoverPanel title="Timer" subtitle="Pomodoro durations and quick controls">
            <div className="island-hero-row">
              <div>
                <p className="student-eyebrow">{state?.phase === 'break' || state?.phase === 'longBreak' ? 'Break phase' : 'Focus phase'}</p>
                <h2>{remainingMin} min left</h2>
                <p>{state?.isRunning ? 'Running.' : 'Paused.'} Cycle {state?.cycleCount ?? 0}, phase total {phaseTotalMin} min.</p>
              </div>
              <button className="student-primary-action" onClick={handleStartPause}>
                {state?.isRunning ? 'Pause' : 'Start'} <ArrowRight size={16} />
              </button>
            </div>
            {settings && (
              <section className="student-action-strip slim" style={{ flexDirection: 'column', gap: 8 }}>
                <TimerDurationRow
                  label="Focus"
                  minutes={Math.round(settings.focusDuration / 60)}
                  onChange={(m) => window.focusAPI.saveSettings({ ...settings, focusDuration: m * 60 })}
                  min={5} max={90}
                />
                <TimerDurationRow
                  label="Short break"
                  minutes={Math.round(settings.breakDuration / 60)}
                  onChange={(m) => window.focusAPI.saveSettings({ ...settings, breakDuration: m * 60 })}
                  min={1} max={30}
                />
                <TimerDurationRow
                  label="Long break"
                  minutes={Math.round(settings.longBreakDuration / 60)}
                  onChange={(m) => window.focusAPI.saveSettings({ ...settings, longBreakDuration: m * 60 })}
                  min={5} max={60}
                />
                <TimerDurationRow
                  label="Cycles before long"
                  minutes={settings.cyclesBeforeLongBreak}
                  unit=""
                  onChange={(n) => window.focusAPI.saveSettings({ ...settings, cyclesBeforeLongBreak: n })}
                  min={2} max={8}
                />
              </section>
            )}
          </PopoverPanel>
        )
      }
      case 'settings':
        return null
      default:
        return null
    }
  }

  const handleRootMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activePopover) return
    const target = event.target as HTMLElement
    if (target.closest('.studydesk-notch-shell') || target.closest('.studydesk-notch-popover')) return
    closePopover(false)
  }

  const renderedPopover = <PopoverContent />

  return (
    <NotchShell
      activeFeature={activePopover}
      captureFlash={captureFlash}
      isRunning={state.isRunning}
      isHovering={hoverDock}
      dockItems={dockItems}
      idleChips={idleChips}
      liveStatus={liveStatus}
      remainingSeconds={state.remainingSeconds}
      totalSeconds={state.totalSeconds}
      phaseLabel={phaseLabel}
      onRootMouseDown={handleRootMouseDown}
      onCapClick={handleCapClick}
      onTimerClick={handleStartPause}
      onFeatureClick={handleFeatureClick}
      onMouseEnter={() => setHoverDock(true)}
      onMouseLeave={() => setHoverDock(false)}
      setTriggerRef={setTriggerRef}
      onClosePopover={() => closePopover()}
      onOpenWorkspace={openWorkspace}
    >
      {renderedPopover}
    </NotchShell>
  )
}


function PopoverPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="island-popover-panel">
      <header className="island-popover-header">
        <div>
          <p className="student-eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="island-popover-body">{children}</div>
    </div>
  )
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <div className="student-list compact">{children}</div>
}

function DeadlineRow({ d, onComplete }: { d: AcademicDeadline; onComplete: () => void }) {
  return (
    <article className="student-deadline-row">
      <div className="student-row-icon"><IconCalendar size={16} /></div>
      <div className="min-w-0 flex-1">
        <h3>{d.title}</h3>
        <p>{dueLabel(d.deadlineAt)} · {d.type}{!d.confirmed ? ' · needs review' : ''}</p>
      </div>
      <button onClick={onComplete} aria-label={`Mark ${d.title} complete`} className="student-done-button">
        <Check size={14} /> Done
      </button>
    </article>
  )
}

// Inline +/− stepper for the Timer popover. Saves immediately so the change
// reflects on the next phase boundary (timer engine reads settings each tick).
function TimerDurationRow({
  label, minutes, onChange, min, max, unit = 'min',
}: {
  label: string
  minutes: number
  onChange: (next: number) => void
  min: number
  max: number
  unit?: string
}) {
  const dec = () => onChange(Math.max(min, minutes - 1))
  const inc = () => onChange(Math.min(max, minutes + 1))
  return (
    <div className="island-timer-row">
      <span className="island-timer-row-label">{label}</span>
      <div className="island-timer-row-controls">
        <button onClick={dec} disabled={minutes <= min} aria-label={`Decrease ${label}`}>−</button>
        <span className="island-timer-row-value">{minutes}{unit ? ` ${unit}` : ''}</span>
        <button onClick={inc} disabled={minutes >= max} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  )
}

function SimpleRow({ title, meta, icon }: { title: string; meta?: string; icon?: React.ReactNode }) {
  return (
    <article className="student-simple-row">
      <div className="student-row-icon">{icon ?? <FileText size={15} />}</div>
      <div className="min-w-0 flex-1">
        <h3>{title}</h3>
        {meta && <p>{meta}</p>}
      </div>
    </article>
  )
}

function EmptyState({ icon, title, body, compact = false }: { icon: React.ReactNode; title: string; body: string; compact?: boolean }) {
  return (
    <div className={cn('student-empty', compact && 'compact')}>
      <div className="student-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}
