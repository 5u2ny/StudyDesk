// Bug 4 prove-it: the original router in App.tsx silently dropped
// captures and study items because it tried to find them in the notes
// array. These tests pin the correct routing per kind.

import { describe, it, expect } from 'vitest'
import { routePaletteHit } from './paletteRouter'
import type { SearchHit } from './searchIndex'
import type { Note } from '@schema'

const hit = (kind: SearchHit['kind'], recordId: string, courseId?: string): SearchHit => ({
  id: `${kind}:${recordId}`,
  kind,
  title: 'x',
  snippet: '',
  recordId,
  courseId,
  score: 0,
})

const note = (id: string): Note => ({
  id, title: 't', content: '{"type":"doc","content":[]}',
  createdAt: 0, updatedAt: 0,
}) as any

describe('routePaletteHit', () => {
  it('opens the matching note for kind=note', () => {
    const n = note('note-1')
    expect(routePaletteHit(hit('note', 'note-1'), [n])).toEqual({ type: 'open-note', note: n, tool: 'today' })
  })

  it('returns noop if the note id is not in the notes array', () => {
    expect(routePaletteHit(hit('note', 'note-missing'), [])).toEqual({ type: 'noop' })
  })

  // Bug 4 — these were the silently-broken cases.
  it('routes a capture hit to the Today tab, course-scoped (Bug 4)', () => {
    expect(routePaletteHit(hit('capture', 'cap-7', 'course-buad'), [])).toEqual({
      type: 'switch-tool', tool: 'today', courseId: 'course-buad',
    })
  })

  it('routes a study hit to the Cards tab, course-scoped (Bug 4)', () => {
    expect(routePaletteHit(hit('study', 'study-3', 'course-buad'), [])).toEqual({
      type: 'switch-tool', tool: 'flashcards', courseId: 'course-buad',
    })
  })

  it('routes a deadline hit to the Deadlines tab', () => {
    expect(routePaletteHit(hit('deadline', 'd-1', 'course-x'), [])).toEqual({
      type: 'switch-tool', tool: 'deadlines', courseId: 'course-x',
    })
  })

  it('routes an assignment hit to the Assignment tab', () => {
    expect(routePaletteHit(hit('assignment', 'a-1', 'course-x'), [])).toEqual({
      type: 'switch-tool', tool: 'assignment', courseId: 'course-x',
    })
  })

  it('routes a class hit to the Class tab', () => {
    expect(routePaletteHit(hit('class', 'c-1', 'course-x'), [])).toEqual({
      type: 'switch-tool', tool: 'class', courseId: 'course-x',
    })
  })

  it('routes a course hit using recordId as the courseId target', () => {
    // For course hits, recordId IS the courseId (the search index sets
    // them equal). The router should use it explicitly, not assume.
    expect(routePaletteHit(hit('course', 'course-buad', 'course-buad'), [])).toEqual({
      type: 'switch-tool', tool: 'today', courseId: 'course-buad',
    })
  })

  it('preserves missing courseId when not present', () => {
    expect(routePaletteHit(hit('capture', 'cap-1'), [])).toEqual({
      type: 'switch-tool', tool: 'today', courseId: undefined,
    })
  })
})
