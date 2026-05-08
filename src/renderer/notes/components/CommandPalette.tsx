// Cross-course command palette — REDESIGN_PLAN_V2 ticket T1.
//
// One keystroke (Cmd+K) from anywhere in the workspace surfaces a
// fuzzy/lexical search over every indexed entity: notes, captures,
// study items, deadlines, assignments, class sessions, courses.
// The wedge attack on NotebookLM's #1 unmet need: cross-notebook
// retrieval. We do this with no LLM, no backend.
//
// UI conventions stolen from Linear / Raycast / Obsidian quick-switch:
// - portal at top-center, modest width, glass surface
// - keyboard-first: arrow keys to move, enter to commit, Esc to close
// - course chip on each row so the user knows which course it's from
// - kind icon so the user knows what kind of entity it is

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Bookmark, Brain, CalendarDays, ClipboardList, GraduationCap, BookOpen, Search, X } from 'lucide-react'
import type {
  AcademicDeadline,
  Assignment,
  Capture,
  ClassSession,
  Course,
  Note,
  StudyItem,
} from '@schema'
import { buildIndex, search, type SearchHit } from '../lib/searchIndex'

const KIND_ICON: Record<SearchHit['kind'], React.ComponentType<any>> = {
  note: FileText,
  capture: Bookmark,
  study: Brain,
  deadline: CalendarDays,
  assignment: ClipboardList,
  class: GraduationCap,
  course: BookOpen,
}
const KIND_LABEL: Record<SearchHit['kind'], string> = {
  note: 'Note',
  capture: 'Capture',
  study: 'Card',
  deadline: 'Deadline',
  assignment: 'Assignment',
  class: 'Class',
  course: 'Course',
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  notes: Note[]
  captures: Capture[]
  studyItems: StudyItem[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  classSessions: ClassSession[]
  courses: Course[]
  /** Click handler — caller decides what to do with each kind. */
  onPick: (hit: SearchHit) => void
}

export function CommandPalette({
  open,
  onClose,
  notes,
  captures,
  studyItems,
  deadlines,
  assignments,
  classSessions,
  courses,
  onPick,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build the index lazily — recompute only when one of the source
  // arrays changes references. Cheap enough that a few hundred items
  // rebuild in <5ms; we don't need React.memo gymnastics.
  const index = useMemo(
    () => buildIndex({ notes, captures, studyItems, deadlines, assignments, classSessions, courses }),
    [notes, captures, studyItems, deadlines, assignments, classSessions, courses],
  )
  const courseLookup = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  const hits = useMemo(() => search(index, query, 30), [index, query])

  // Reset active index when the result set changes so we don't end up
  // pointing past the end of the list.
  useEffect(() => { setActiveIdx(0) }, [query, hits.length])

  // Focus the input when opening and reset state when closing.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      // Defer focus to the next tick — the dialog isn't laid out yet
      // on the synchronous open transition.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Keyboard handling.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(hits.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && hits[activeIdx]) {
        e.preventDefault()
        onPick(hits[activeIdx])
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, hits, activeIdx, onPick, onClose])

  // Auto-scroll the active row into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="presentation">
      <div className="cmdk-shell" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search size={14} className="cmdk-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search notes, captures, deadlines, cards across all courses…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Universal search"
            spellCheck={false}
          />
          <button onClick={onClose} className="cmdk-close" aria-label="Close">
            <X size={13} />
          </button>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {hits.length === 0 && (
            <div className="cmdk-empty">
              {query ? `No matches for "${query}".` : 'Type to search across everything.'}
            </div>
          )}
          {hits.map((hit, i) => {
            const Icon = KIND_ICON[hit.kind]
            const course = hit.courseId ? courseLookup.get(hit.courseId) : undefined
            const courseLabel = course?.code ?? course?.name
            return (
              <button
                key={hit.id}
                data-idx={i}
                className={`cmdk-row${i === activeIdx ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => { onPick(hit); onClose() }}
              >
                <Icon size={14} className="cmdk-row-icon" />
                <div className="cmdk-row-body">
                  <div className="cmdk-row-title">
                    <span className="cmdk-kind">{KIND_LABEL[hit.kind]}</span>
                    <span className="cmdk-title-text">{hit.title || 'Untitled'}</span>
                  </div>
                  {hit.snippet && (
                    <div className="cmdk-row-snippet">…{hit.snippet}…</div>
                  )}
                </div>
                {courseLabel && <span className="cmdk-course">{courseLabel}</span>}
              </button>
            )
          })}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span className="cmdk-footer-spacer" />
          <span>{hits.length} {hits.length === 1 ? 'result' : 'results'}</span>
        </div>
      </div>
    </div>
  )
}
