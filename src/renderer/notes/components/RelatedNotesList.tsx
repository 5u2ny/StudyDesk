// RelatedNotesList — shows up to 5 notes related to the active note.
// Scoring: +3 same course, +2 per shared tag, +1 per shared capturedFromId,
// +1 same documentType.

import React, { useMemo } from 'react'
import { FileText } from 'lucide-react'
import type { Note } from '@schema'

export interface RelatedNotesListProps {
  note: Note
  allNotes: Note[]
  onSelect: (note: Note) => void
}

export function RelatedNotesList({ note, allNotes, onSelect }: RelatedNotesListProps) {
  const related = useMemo(() => {
    const noteTags = new Set(note.tags || [])
    const noteCaptureIds = new Set(note.capturedFromIds || [])

    const scored = allNotes
      .filter(n => n.id !== note.id)
      .map(n => {
        let score = 0
        // Same course
        if (n.courseId && n.courseId === note.courseId) score += 3
        // Shared tags
        if (n.tags) {
          for (const tag of n.tags) {
            if (noteTags.has(tag)) score += 2
          }
        }
        // Shared capture refs
        if (n.capturedFromIds) {
          for (const cid of n.capturedFromIds) {
            if (noteCaptureIds.has(cid)) score += 1
          }
        }
        // Same document type
        if (n.documentType && n.documentType === note.documentType) score += 1
        return { note: n, score }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    return scored
  }, [note, allNotes])

  if (related.length === 0) {
    return (
      <div className="related-notes-empty">
        <p>No related notes found</p>
      </div>
    )
  }

  return (
    <ul className="related-notes-list">
      {related.map(({ note: rel, score }) => (
        <li key={rel.id}>
          <button className="related-notes-item" onClick={() => onSelect(rel)}>
            <FileText size={12} className="related-notes-icon" />
            <span className="related-notes-title">{rel.title || 'Untitled'}</span>
            <span className="related-notes-score">{score}pt</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
