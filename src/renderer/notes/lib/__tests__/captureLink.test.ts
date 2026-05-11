// Edge case tests for capture linking logic (mirroring the main-process handler logic).
// These test the pure-function patterns used in capture:linkToNote and capture:unlinked.

import { describe, it, expect } from 'vitest'
import type { Note, Capture } from '@schema'

// Replicate the handler's deduplication and content-merging logic for testing
function linkCapturesToNote(
  note: Note,
  captureIds: string[],
  captures: Capture[]
): { updatedNote: Note; linked: number } {
  const existing = new Set(note.capturedFromIds || [])
  let linked = 0
  const newBlocks: any[] = []

  for (const cid of captureIds) {
    if (existing.has(cid)) continue // idempotent
    const capture = captures.find(c => c.id === cid)
    if (!capture) continue
    existing.add(cid)
    linked++
    newBlocks.push({
      type: 'sourceQuote',
      attrs: { captureId: cid, source: capture.sourceApp || capture.source },
      content: [{ type: 'text', text: capture.text }],
    })
  }

  let content: any
  try { content = JSON.parse(note.content) } catch { content = { type: 'doc', content: [] } }
  if (!content.content) content.content = []
  content.content.push(...newBlocks)

  return {
    updatedNote: {
      ...note,
      capturedFromIds: Array.from(existing),
      content: JSON.stringify(content),
    },
    linked,
  }
}

function getUnlinkedCaptures(captures: Capture[], notes: Note[], courseId?: string): Capture[] {
  const linkedIds = new Set<string>()
  for (const note of notes) {
    if (note.capturedFromIds) {
      for (const cid of note.capturedFromIds) linkedIds.add(cid)
    }
  }
  let unlinked = captures.filter(c => !linkedIds.has(c.id))
  if (courseId) unlinked = unlinked.filter(c => c.courseId === courseId)
  return unlinked.sort((a, b) => b.createdAt - a.createdAt)
}

const makeCapture = (id: string, text: string, courseId?: string): Capture => ({
  id, text, source: 'highlight', createdAt: Date.now(), pinned: false, courseId,
})

const makeNote = (id: string, capturedFromIds: string[] = [], content?: string): Note => ({
  id, title: 'Test', content: content || '{"type":"doc","content":[]}',
  capturedFromIds, createdAt: Date.now(), updatedAt: Date.now(),
})

describe('capture:linkToNote edge cases', () => {
  it('links capture idempotently — duplicate captureId skipped', () => {
    const captures = [makeCapture('c1', 'hello')]
    const note = makeNote('n1', ['c1'])
    const { linked } = linkCapturesToNote(note, ['c1'], captures)
    expect(linked).toBe(0) // already linked, skip
  })

  it('handles multiple captures in one call', () => {
    const captures = [makeCapture('c1', 'one'), makeCapture('c2', 'two'), makeCapture('c3', 'three')]
    const note = makeNote('n1')
    const { updatedNote, linked } = linkCapturesToNote(note, ['c1', 'c2', 'c3'], captures)
    expect(linked).toBe(3)
    expect(updatedNote.capturedFromIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('skips captures that do not exist', () => {
    const captures = [makeCapture('c1', 'exists')]
    const note = makeNote('n1')
    const { linked } = linkCapturesToNote(note, ['c1', 'ghost'], captures)
    expect(linked).toBe(1) // ghost skipped
  })

  it('handles note with invalid JSON content gracefully', () => {
    const captures = [makeCapture('c1', 'text')]
    const note = makeNote('n1', [], 'not json at all')
    const { updatedNote, linked } = linkCapturesToNote(note, ['c1'], captures)
    expect(linked).toBe(1)
    const parsed = JSON.parse(updatedNote.content)
    expect(parsed.type).toBe('doc')
    expect(parsed.content.length).toBe(1)
  })

  it('preserves existing content when appending', () => {
    const existing = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'existing' }] }] }
    const captures = [makeCapture('c1', 'new capture')]
    const note = makeNote('n1', [], JSON.stringify(existing))
    const { updatedNote } = linkCapturesToNote(note, ['c1'], captures)
    const parsed = JSON.parse(updatedNote.content)
    expect(parsed.content.length).toBe(2) // existing paragraph + new sourceQuote
  })
})

describe('capture:unlinked edge cases', () => {
  it('returns all captures when no notes exist', () => {
    const captures = [makeCapture('c1', 'a'), makeCapture('c2', 'b')]
    const result = getUnlinkedCaptures(captures, [])
    expect(result.length).toBe(2)
  })

  it('excludes captures already linked to any note', () => {
    const captures = [makeCapture('c1', 'a'), makeCapture('c2', 'b')]
    const notes = [makeNote('n1', ['c1'])]
    const result = getUnlinkedCaptures(captures, notes)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('c2')
  })

  it('filters by courseId when provided', () => {
    const captures = [
      makeCapture('c1', 'math', 'course-math'),
      makeCapture('c2', 'history', 'course-hist'),
    ]
    const result = getUnlinkedCaptures(captures, [], 'course-math')
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('c1')
  })

  it('returns empty when all captures are linked', () => {
    const captures = [makeCapture('c1', 'a')]
    const notes = [makeNote('n1', ['c1'])]
    const result = getUnlinkedCaptures(captures, notes)
    expect(result.length).toBe(0)
  })

  it('handles notes with undefined capturedFromIds', () => {
    const captures = [makeCapture('c1', 'a')]
    const notes = [{ ...makeNote('n1'), capturedFromIds: undefined as any }]
    const result = getUnlinkedCaptures(captures, notes)
    expect(result.length).toBe(1)
  })

  it('sorts newest first', () => {
    const c1 = { ...makeCapture('c1', 'old'), createdAt: 1000 }
    const c2 = { ...makeCapture('c2', 'new'), createdAt: 9000 }
    const result = getUnlinkedCaptures([c1, c2], [])
    expect(result[0].id).toBe('c2')
  })
})
