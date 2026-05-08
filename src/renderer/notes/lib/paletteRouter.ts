// Pure routing decision for Cmd-K palette result clicks.
//
// Bug 4 (prove-it): the original inline router in App.tsx treated
// 'capture' and 'study' results as if they were notes — looked up
// notes.find(n => n.id === hit.recordId), which for a capture id
// returned undefined and silently did nothing on click.
//
// Pulled out so the routing decision is a pure function we can unit-
// test without React. The component just consumes the action.

import type { SearchHit } from './searchIndex'
import type { Note } from '@schema'

export type WorkspaceTool =
  | 'today' | 'daily' | 'dashboard' | 'quiz' | 'flashcards'
  | 'assignment' | 'syllabus' | 'class' | 'map' | 'timeline' | 'deadlines' | 'materials'

export type PaletteAction =
  | { type: 'open-note'; note: Note; tool: 'today' }
  | { type: 'switch-tool'; tool: WorkspaceTool; courseId?: string }
  | { type: 'noop' }

/** Decide what to do when the user picks a SearchHit from the palette.
 *  Pure — no side effects, no React state. */
export function routePaletteHit(hit: SearchHit, notes: ReadonlyArray<Note>): PaletteAction {
  switch (hit.kind) {
    case 'note': {
      const note = notes.find(n => n.id === hit.recordId)
      return note ? { type: 'open-note', note, tool: 'today' } : { type: 'noop' }
    }
    case 'study':
      // Study items don't have an editor surface; route to the Cards
      // tab (course-scoped) so the user can find / review.
      return { type: 'switch-tool', tool: 'flashcards', courseId: hit.courseId }
    case 'capture':
      // Captures live as a triage queue. Today tab surfaces "recent
      // captures" + drag-into-note workflow.
      return { type: 'switch-tool', tool: 'today', courseId: hit.courseId }
    case 'deadline':
      return { type: 'switch-tool', tool: 'deadlines', courseId: hit.courseId }
    case 'assignment':
      return { type: 'switch-tool', tool: 'assignment', courseId: hit.courseId }
    case 'class':
      return { type: 'switch-tool', tool: 'class', courseId: hit.courseId }
    case 'course':
      return { type: 'switch-tool', tool: 'today', courseId: hit.recordId }
    default:
      return { type: 'noop' }
  }
}
