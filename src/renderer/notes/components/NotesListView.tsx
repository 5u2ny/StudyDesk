// NotesListView — full-tab note browser for the 'notes' workspace tool.
// Shows all notes for the active course, filterable by document type,
// with a "New note" action. Clicking a note opens it in the editor.

import React, { useState, useMemo } from 'react'
import { FileText, Plus, Search, StickyNote, BookOpen, FileQuestion, Filter, Link2 } from 'lucide-react'
import type { Note, Course } from '@schema'
import { cn } from '@shared/lib/utils'
import { NoteHealthBadge } from './NoteHealthBadge'

export interface NotesListViewProps {
  notes: Note[]
  currentCourse?: Course
  onSelect: (note: Note) => void
  onCreate: (type?: Note['documentType']) => Promise<void>
}

const DOC_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  lecture: { label: 'Lecture', icon: <BookOpen size={12} /> },
  note: { label: 'Note', icon: <StickyNote size={12} /> },
  summary: { label: 'Summary', icon: <FileText size={12} /> },
  question: { label: 'Question', icon: <FileQuestion size={12} /> },
  reading: { label: 'Reading', icon: <BookOpen size={12} /> },
  class_notes: { label: 'Class Notes', icon: <BookOpen size={12} /> },
  syllabus: { label: 'Syllabus', icon: <FileText size={12} /> },
}

export function NotesListView({ notes, currentCourse, onSelect, onCreate }: NotesListViewProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const courseNotes = useMemo(() => {
    let filtered = currentCourse
      ? notes.filter(n => n.courseId === currentCourse.id)
      : notes
    if (typeFilter) {
      filtered = filtered.filter(n => n.documentType === typeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(n => n.title.toLowerCase().includes(q))
    }
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [notes, currentCourse, typeFilter, search])

  const docTypes = useMemo(() => {
    const all = currentCourse ? notes.filter(n => n.courseId === currentCourse.id) : notes
    const types = new Set(all.map(n => n.documentType).filter(Boolean))
    return Array.from(types) as string[]
  }, [notes, currentCourse])

  return (
    <section className="notes-list-view">
      <header className="notes-list-header">
        <div className="notes-list-header-top">
          <div>
            <p className="notes-list-eyebrow">Notes</p>
            <h1 className="notes-list-title">
              {currentCourse ? currentCourse.name : 'All Notes'}
            </h1>
            <span className="notes-list-count">{courseNotes.length} note{courseNotes.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="btn-primary" onClick={() => onCreate('note')}>
            <Plus size={14} /> New note
          </button>
        </div>

        <div className="notes-list-toolbar">
          <div className="notes-list-search">
            <Search size={14} className="notes-list-search-icon" />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="notes-list-search-input"
            />
          </div>
          {docTypes.length > 1 && (
            <div className="notes-list-filters">
              <button
                className={cn('notes-filter-chip', !typeFilter && 'is-active')}
                onClick={() => setTypeFilter(null)}
              >
                All
              </button>
              {docTypes.map(t => (
                <button
                  key={t}
                  className={cn('notes-filter-chip', typeFilter === t && 'is-active')}
                  onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                >
                  {DOC_TYPE_LABELS[t]?.icon}
                  {DOC_TYPE_LABELS[t]?.label ?? t}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {courseNotes.length === 0 ? (
        <div className="notes-list-empty">
          <FileText size={32} className="notes-list-empty-icon" />
          <p className="notes-list-empty-title">
            {search ? 'No matching notes' : 'No notes yet'}
          </p>
          <p className="notes-list-empty-desc">
            {search
              ? 'Try a different search term.'
              : 'Create your first note to get started.'}
          </p>
          {!search && (
            <button className="btn-primary" onClick={() => onCreate('note')}>
              <Plus size={14} /> Create note
            </button>
          )}
        </div>
      ) : (
        <ul className="notes-list-grid">
          {courseNotes.map(note => {
            const updated = new Date(note.updatedAt)
            const dateStr = updated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            const typeInfo = DOC_TYPE_LABELS[note.documentType ?? '']
            return (
              <li key={note.id}>
                <button className="notes-list-card" onClick={() => onSelect(note)}>
                  <div className="notes-list-card-top">
                    {typeInfo && <span className="notes-list-type-tag">{typeInfo.icon} {typeInfo.label}</span>}
                    <NoteHealthBadge note={note} />
                    <span className="notes-list-card-date">{dateStr}</span>
                  </div>
                  <h3 className="notes-list-card-title">{note.title || 'Untitled'}</h3>
                  {note.tags && note.tags.length > 0 && (
                    <div className="notes-list-card-tags">
                      {note.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="notes-list-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  {note.capturedFromIds && note.capturedFromIds.length > 0 && (
                    <span className="notes-list-card-capture-badge">
                      <Link2 size={10} /> {note.capturedFromIds.length} capture{note.capturedFromIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
