// Daily journal pane — ported from lostdesign/linked.
//
// Linked's core idea: one entry per day, date is the primary key, navigation
// is keyboard-first (Today / Prev / Next). No "create note" friction —
// opening a date opens or creates that day's entry.
//
// Adapted for StudyDesk: daily entries are scoped per course (or workspace
// when no course is selected), use the existing TipTap editor, and live in
// the same Note store with documentType: 'daily_entry'.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles } from 'lucide-react'
import type { Note, Course } from '@schema'
import { ipc } from '@shared/ipc-client'
import { Editor } from '../Editor'
import { cn } from '@shared/lib/utils'

interface Props {
  notes: Note[]
  currentCourse?: Course
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onRefresh: () => void
  onSelect?: (note: Note) => void
}

// Local-tz YYYY-MM-DD formatter — avoids UTC drift that breaks "today" across timezones.
function dayKeyOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shiftDayKey(key: string, delta: number): string {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + delta)
  return dayKeyOf(d)
}

function humanLabel(key: string): string {
  const d = parseDayKey(key)
  const today = dayKeyOf(new Date())
  const yesterday = dayKeyOf(new Date(Date.now() - 86_400_000))
  const tomorrow = dayKeyOf(new Date(Date.now() + 86_400_000))
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  if (key === tomorrow) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function dateLabel(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DailyJournalView({ notes, currentCourse, onUpdate, onRefresh, onSelect }: Props) {
  const [activeKey, setActiveKey] = useState<string>(() => dayKeyOf(new Date()))
  const courseId = currentCourse?.id

  // Find the daily entry for (activeKey, courseId). courseId === undefined means "workspace-wide".
  const entry = useMemo(() => {
    return notes.find(n =>
      n.documentType === 'daily_entry' &&
      n.dayKey === activeKey &&
      (n.courseId ?? undefined) === (courseId ?? undefined)
    ) ?? null
  }, [notes, activeKey, courseId])

  // Recently used days (for the bottom strip)
  const recentDays = useMemo(() => {
    return notes
      .filter(n => n.documentType === 'daily_entry' && (n.courseId ?? undefined) === (courseId ?? undefined))
      .map(n => n.dayKey!)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 7)
  }, [notes, courseId])

  const goPrev = useCallback(() => setActiveKey(k => shiftDayKey(k, -1)), [])
  const goNext = useCallback(() => setActiveKey(k => shiftDayKey(k, +1)), [])
  const goToday = useCallback(() => setActiveKey(dayKeyOf(new Date())), [])

  // Linked's keyboard model: Cmd+T (today), Cmd+[ (prev), Cmd+] (next)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // Don't hijack typing in input/textarea/contenteditable
      const inEditor = target?.closest('input, textarea, [contenteditable="true"], .ProseMirror')
      if (inEditor) return
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); goToday() }
      else if (e.key === '[' ) { e.preventDefault(); goPrev() }
      else if (e.key === ']' ) { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, goToday])

  // Lazy-create the daily entry on first edit so empty days don't pollute the store.
  const [creating, setCreating] = useState(false)
  const createForToday = useCallback(async () => {
    if (entry || creating) return entry
    setCreating(true)
    try {
      const title = humanLabel(activeKey) === 'Today' ? `Daily — ${dateLabel(activeKey)}` : `Daily — ${dateLabel(activeKey)}`
      const note = await ipc.invoke<Note>('notes:create', { title, content: '' })
      const updated = await ipc.invoke<Note>('notes:update', {
        id: note.id,
        patch: {
          documentType: 'daily_entry',
          courseId,
          dayKey: activeKey,
          tags: ['daily'],
        },
      })
      onRefresh()
      onSelect?.(updated)
      return updated
    } finally {
      setCreating(false)
    }
  }, [entry, creating, activeKey, courseId, onRefresh, onSelect])

  const handleEditorUpdate = useCallback(async (patch: Partial<Note>) => {
    if (entry) {
      await onUpdate(entry.id, patch)
      return
    }
    // First write on an empty day -> create + apply patch
    const created = await createForToday()
    if (created) await onUpdate(created.id, patch)
  }, [entry, onUpdate, createForToday])

  const isToday = activeKey === dayKeyOf(new Date())
  const isPast = activeKey < dayKeyOf(new Date())
  const isFuture = activeKey > dayKeyOf(new Date())

  return (
    <div className="flex flex-col h-full">
      {/* Header — date navigation, "linked" feel: minimal, keyboard-first */}
      <div className="daily-journal-header">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="daily-journal-eyebrow">
              Daily{currentCourse ? ` · ${currentCourse.code ?? currentCourse.name}` : ''}
            </div>
            <h1 className="daily-journal-title">
              {humanLabel(activeKey)}
            </h1>
            <div className="daily-journal-date">{dateLabel(activeKey)}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={goPrev}
              className="daily-journal-nav-btn"
              title="Previous day  (⌘[)"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={goToday}
              disabled={isToday}
              className={cn(
                'daily-journal-today-btn',
                isToday && 'is-current'
              )}
              title="Jump to today  (⌘T)"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="daily-journal-nav-btn"
              title="Next day  (⌘])"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Body — single-pane editor (linked's distraction-free principle) */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        {entry ? (
          <Editor
            key={entry.id}
            note={entry}
            captures={[]}
            onUpdate={handleEditorUpdate}
          />
        ) : (
          <DayEmptyState
            isFuture={isFuture}
            isPast={isPast}
            label={humanLabel(activeKey)}
            onStart={createForToday}
            disabled={creating}
          />
        )}
      </div>

      {/* Recent days strip */}
      {recentDays.length > 0 && (
        <div className="daily-journal-recent-strip">
          <CalendarDays size={11} className="daily-journal-recent-icon" />
          <span className="daily-journal-recent-label">Recent</span>
          {recentDays.map(k => {
            const active = k === activeKey
            return (
              <button
                key={k}
                onClick={() => setActiveKey(k)}
                className={cn('daily-journal-recent-btn', active && 'is-active')}
              >
                {humanLabel(k) === 'Today' || humanLabel(k) === 'Yesterday' ? humanLabel(k) : dateLabel(k)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DayEmptyState({
  isFuture, isPast, label, onStart, disabled,
}: { isFuture: boolean; isPast: boolean; label: string; onStart: () => void; disabled: boolean }) {
  const headline = isFuture
    ? `Plan ahead for ${label.toLowerCase()}`
    : isPast
      ? `Reflect on ${label.toLowerCase()}`
      : `What's on your mind today?`
  const sub = isFuture
    ? 'Outline what you want to study, prep, or finish.'
    : isPast
      ? 'Capture what you learned, what stuck, what didn\'t.'
      : 'A daily entry for class notes, questions, decisions, or rough thinking.'

  return (
    <div className="daily-journal-empty">
      <div className="daily-journal-empty-icon">
        <Sparkles size={18} />
      </div>
      <h2 className="daily-journal-empty-title">{headline}</h2>
      <p className="daily-journal-empty-desc">{sub}</p>
      <button
        onClick={onStart}
        disabled={disabled}
        className="btn-primary daily-journal-empty-cta"
      >
        {disabled ? 'Creating…' : 'Start writing'}
      </button>
      <div className="daily-journal-shortcuts">
        <kbd>⌘T</kbd> today
        <span>·</span>
        <kbd>⌘[</kbd> prev
        <span>·</span>
        <kbd>⌘]</kbd> next
      </div>
    </div>
  )
}
