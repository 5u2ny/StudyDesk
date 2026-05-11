// Timeline view — port from Markwhen / awesome-markdown-editors entry.
//
// Collects every dated entity StudyDesk tracks (deadlines, daily entries,
// captures, study items) and renders them on a horizontal time axis.
// Cards are bucketed by week so a year of activity stays readable;
// within each week, entries stack vertically. Click any entry to open
// the underlying note (or focus the deadline panel).

import React, { useMemo, useRef, useEffect } from 'react'
import { CalendarDays, FileText, Sparkles, Image as ImageIcon, ClipboardList } from 'lucide-react'
import { EmptyState } from './EmptyState'
import type { Note, AcademicDeadline, Capture, StudyItem, Course } from '@schema'

interface Props {
  notes: Note[]
  deadlines: AcademicDeadline[]
  captures: Capture[]
  studyItems: StudyItem[]
  courses: Course[]
  /** Optional course filter — undefined shows everything. */
  courseId?: string
  onSelectNote: (note: Note) => void
}

type ItemKind = 'deadline' | 'daily' | 'note' | 'capture' | 'study'

interface TimelineItem {
  id: string
  kind: ItemKind
  title: string
  /** Epoch ms — the X-axis position. */
  at: number
  /** Course code or name, for grouping color. */
  courseLabel?: string
  /** Optional click target (a note to open). */
  noteId?: string
}

/** Compute the Monday of the week containing the given timestamp.
 *  Uses Date constructor with explicit Y/M/D parts to avoid landing on
 *  a 23:00 on the wrong calendar day across DST transitions (which
 *  setDate + setHours can produce when the offset crosses a fall-back
 *  or spring-forward Sunday). */
function weekStart(ts: number): number {
  const d = new Date(ts)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day  // Monday = start of week
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 0, 0, 0, 0).getTime()
}

const KIND_META: Record<ItemKind, { color: string; icon: React.ComponentType<any>; label: string }> = {
  deadline: { color: '#ff6b2d', icon: CalendarDays, label: 'Deadline' },
  daily:    { color: '#5fa1ff', icon: Sparkles, label: 'Daily entry' },
  note:     { color: '#10a6a3', icon: FileText, label: 'Note' },
  capture:  { color: '#ffb84d', icon: ImageIcon, label: 'Capture' },
  study:    { color: '#955aff', icon: ClipboardList, label: 'Study item' },
}

export function TimelineView({ notes, deadlines, captures, studyItems, courses, courseId, onSelectNote }: Props) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = []
    const inCourse = <T extends { courseId?: string }>(x: T) => !courseId || x.courseId === courseId
    const courseLabel = (id?: string) => {
      if (!id) return undefined
      const c = courses.find(cr => cr.id === id)
      return c?.code ?? c?.name
    }

    for (const d of deadlines.filter(inCourse)) {
      out.push({
        id: `d:${d.id}`,
        kind: 'deadline',
        title: d.title,
        at: d.deadlineAt,
        courseLabel: courseLabel(d.courseId),
        noteId: d.sourceId,
      })
    }
    for (const n of notes.filter(inCourse)) {
      const isDaily = n.documentType === 'daily_entry'
      out.push({
        id: `n:${n.id}`,
        kind: isDaily ? 'daily' : 'note',
        title: n.title || 'Untitled',
        at: n.updatedAt || n.createdAt,
        courseLabel: courseLabel(n.courseId),
        noteId: n.id,
      })
    }
    for (const c of captures.filter(inCourse)) {
      out.push({
        id: `c:${c.id}`,
        kind: 'capture',
        title: c.text.slice(0, 60),
        at: c.createdAt,
        courseLabel: courseLabel(c.courseId),
      })
    }
    for (const s of studyItems.filter(inCourse)) {
      out.push({
        id: `s:${s.id}`,
        kind: 'study',
        title: s.front.slice(0, 60),
        at: s.createdAt,
        courseLabel: courseLabel(s.courseId),
      })
    }
    return out.sort((a, b) => a.at - b.at)
  }, [notes, deadlines, captures, studyItems, courses, courseId])

  // Group items by week start
  const weeks = useMemo(() => {
    const map = new Map<number, TimelineItem[]>()
    for (const item of items) {
      const wk = weekStart(item.at)
      if (!map.has(wk)) map.set(wk, [])
      map.get(wk)!.push(item)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [items])

  // Build a Map<id, Note> once per render so per-card click lookups don't
  // re-scan the full notes array.
  const noteById = useMemo(() => {
    const m = new Map<string, Note>()
    for (const n of notes) m.set(n.id, n)
    return m
  }, [notes])

  // Auto-scroll to today on first render. Depend on the weeks array
  // identity (not just length) so a course-filter change that yields the
  // same number of weeks still re-runs the scroll.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollerRef.current || weeks.length === 0) return
    const today = weekStart(Date.now())
    const target = scrollerRef.current.querySelector(`[data-week="${today}"]`) as HTMLElement | null
    if (target) {
      const offset = target.offsetLeft - scrollerRef.current.clientWidth / 2 + target.clientWidth / 2
      scrollerRef.current.scrollLeft = Math.max(0, offset)
    } else {
      // No week-of-today bucket — scroll to the rightmost (most-recent) week
      scrollerRef.current.scrollLeft = scrollerRef.current.scrollWidth
    }
  }, [weeks])

  if (items.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="Nothing on the timeline" description="Deadlines, captures, and notes will appear here as you add them." />
    )
  }

  const todayWeek = weekStart(Date.now())

  return (
    <div className="timeline-view">
      <header className="timeline-view-header">
        <div>
          <p className="timeline-eyebrow">Timeline</p>
          <h1>Activity over time</h1>
          <span>Deadlines · daily entries · notes · captures · study items, plotted by week</span>
        </div>
        <div className="timeline-legend">
          {(Object.keys(KIND_META) as ItemKind[]).map(k => (
            <span key={k} className="timeline-legend-chip">
              <span className="legend-dot" style={{ background: KIND_META[k].color }} />
              {KIND_META[k].label}
            </span>
          ))}
        </div>
      </header>

      <div className="timeline-scroller scrollbar-thin" ref={scrollerRef}>
        <div className="timeline-track">
          {weeks.map(([wk, weekItems]) => {
            const weekDate = new Date(wk)
            const isCurrent = wk === todayWeek
            const isPast = wk < todayWeek
            return (
              <div key={wk} data-week={wk} className={`timeline-week${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}>
                <div className="timeline-week-label">
                  <strong>{weekDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                  <em>{weekDate.toLocaleDateString(undefined, { year: 'numeric' })}</em>
                </div>
                <div className="timeline-week-items">
                  {weekItems.map(item => {
                    const meta = KIND_META[item.kind]
                    const Icon = meta.icon
                    const note = item.noteId ? noteById.get(item.noteId) : undefined
                    return (
                      <button
                        key={item.id}
                        className="timeline-item"
                        style={{ borderLeftColor: meta.color }}
                        onClick={() => { if (note) onSelectNote(note) }}
                        disabled={!note}
                        title={`${meta.label}${item.courseLabel ? ' · ' + item.courseLabel : ''}`}
                      >
                        <Icon size={11} />
                        <span className="timeline-item-title">{item.title}</span>
                        {item.courseLabel && <span className="timeline-item-course">{item.courseLabel}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
