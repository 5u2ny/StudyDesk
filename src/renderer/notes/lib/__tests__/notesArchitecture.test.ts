import { describe, it, expect } from 'vitest'
import { mergeNoteContents } from '../mergeNotes'
import { computeNoteHealthScore, isEmptyContent } from '../noteHealth'
import type { Note } from '@schema'

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now()

function makeNote(overrides: Partial<Note> & { id: string }): Note {
  return {
    title: 'Test Note',
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }),
    capturedFromIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function docWithParagraphs(...texts: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: texts.map(t => ({
      type: 'paragraph',
      content: [{ type: 'text', text: t }],
    })),
  })
}

// ── mergeNoteContents ────────────────────────────────────────────────────────

describe('mergeNoteContents', () => {
  it('returns empty doc for 0 notes', () => {
    const result = JSON.parse(mergeNoteContents([]))
    expect(result).toEqual({ type: 'doc', content: [] })
  })

  it('wraps a single note with its title heading', () => {
    const note = makeNote({ id: 'n1', title: 'First' })
    const result = JSON.parse(mergeNoteContents([note]))

    // First node is the heading separator
    expect(result.content[0]).toEqual({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'First' }],
    })
    // Then the note content follows
    expect(result.content[1].type).toBe('paragraph')
  })

  it('merges 2 notes with separate heading separators', () => {
    const a = makeNote({ id: 'a', title: 'Alpha', content: docWithParagraphs('AAA') })
    const b = makeNote({ id: 'b', title: 'Beta', content: docWithParagraphs('BBB') })
    const result = JSON.parse(mergeNoteContents([a, b]))

    const headings = result.content.filter((n: any) => n.type === 'heading')
    expect(headings).toHaveLength(2)
    expect(headings[0].content[0].text).toBe('Alpha')
    expect(headings[1].content[0].text).toBe('Beta')
  })

  it('merges 3 notes preserving order', () => {
    const notes = ['X', 'Y', 'Z'].map((t, i) =>
      makeNote({ id: `n${i}`, title: t, content: docWithParagraphs(`Content ${t}`) })
    )
    const result = JSON.parse(mergeNoteContents(notes))

    const headings = result.content.filter((n: any) => n.type === 'heading')
    expect(headings.map((h: any) => h.content[0].text)).toEqual(['X', 'Y', 'Z'])
  })

  it('deduplicates identical paragraphs across notes', () => {
    const a = makeNote({ id: 'a', title: 'A', content: docWithParagraphs('Same text', 'Unique A') })
    const b = makeNote({ id: 'b', title: 'B', content: docWithParagraphs('Same text', 'Unique B') })
    const result = JSON.parse(mergeNoteContents([a, b]))

    const paragraphs = result.content.filter((n: any) => n.type === 'paragraph')
    const texts = paragraphs.map((p: any) => p.content[0].text)
    // "Same text" should appear only once
    expect(texts.filter((t: string) => t === 'Same text')).toHaveLength(1)
    expect(texts).toContain('Unique A')
    expect(texts).toContain('Unique B')
  })

  it('handles note with invalid JSON content gracefully', () => {
    const note = makeNote({ id: 'n1', title: 'Broken', content: 'not json at all' })
    const result = JSON.parse(mergeNoteContents([note]))

    // Should still get the heading but no crash
    expect(result.content[0].type).toBe('heading')
    expect(result.content).toHaveLength(1) // heading only, no content parsed
  })

  it('handles note with empty string content', () => {
    const note = makeNote({ id: 'n1', title: 'Empty', content: '' })
    // Should not throw
    const result = JSON.parse(mergeNoteContents([note]))
    expect(result.content[0].type).toBe('heading')
  })

  it('uses "Untitled" for notes without a title', () => {
    const note = makeNote({ id: 'n1', title: '', content: docWithParagraphs('Some text') })
    const result = JSON.parse(mergeNoteContents([note]))

    expect(result.content[0].content[0].text).toBe('Untitled')
  })

  it('handles note with null content array in doc', () => {
    const note = makeNote({
      id: 'n1',
      title: 'NullContent',
      content: JSON.stringify({ type: 'doc', content: null }),
    })
    // Should not throw
    const result = JSON.parse(mergeNoteContents([note]))
    expect(result.content[0].type).toBe('heading')
  })
})

// ── computeNoteHealthScore ───────────────────────────────────────────────────

describe('computeNoteHealthScore', () => {
  it('returns 100 for a complete note', () => {
    const note = makeNote({
      id: 'full',
      title: 'Complete Note',
      content: docWithParagraphs('Real content here'),
      tags: ['exam', 'review'],
      capturedFromIds: ['cap1', 'cap2'],
      updatedAt: NOW, // just now
    })
    const result = computeNoteHealthScore(note)

    expect(result.score).toBe(100)
    expect(result.color).toBe('green')
    expect(result.indicators.every(i => i.ok)).toBe(true)
  })

  it('returns low score for an empty note (no title, no content, no tags, no captures, stale)', () => {
    const thirtyDaysAgo = NOW - 31 * 86_400_000
    const note = makeNote({
      id: 'empty',
      title: '',
      content: JSON.stringify({ type: 'doc', content: [] }),
      tags: [],
      capturedFromIds: [],
      updatedAt: thirtyDaysAgo,
    })
    const result = computeNoteHealthScore(note)

    expect(result.score).toBe(0)
    expect(result.color).toBe('red')
  })

  it('penalizes note with no tags', () => {
    const note = makeNote({
      id: 'notags',
      title: 'Has Title',
      content: docWithParagraphs('Some content'),
      tags: [],
      capturedFromIds: ['cap1'],
      updatedAt: NOW,
    })
    const result = computeNoteHealthScore(note)

    // Missing tags = one indicator false => 80
    expect(result.score).toBe(80)
    expect(result.color).toBe('green')
    const tagsIndicator = result.indicators.find(i => i.label === 'Has tags')
    expect(tagsIndicator?.ok).toBe(false)
  })

  it('penalizes note updated 30+ days ago', () => {
    const oldDate = NOW - 35 * 86_400_000
    const note = makeNote({
      id: 'stale',
      title: 'Old Note',
      content: docWithParagraphs('Content'),
      tags: ['tag1'],
      capturedFromIds: ['cap1'],
      updatedAt: oldDate,
    })
    const result = computeNoteHealthScore(note)

    // Updated >14 days ago means that indicator is false => 80
    expect(result.score).toBe(80)
    expect(result.color).toBe('green')
    const updatedIndicator = result.indicators.find(i => i.label.startsWith('Updated'))
    expect(updatedIndicator?.ok).toBe(false)
  })

  it('scores higher when captures are present vs absent', () => {
    const withCaptures = makeNote({
      id: 'wc',
      title: 'Note',
      content: docWithParagraphs('Text'),
      tags: ['t'],
      capturedFromIds: ['c1'],
      updatedAt: NOW,
    })
    const withoutCaptures = makeNote({
      id: 'woc',
      title: 'Note',
      content: docWithParagraphs('Text'),
      tags: ['t'],
      capturedFromIds: [],
      updatedAt: NOW,
    })

    const scoreWith = computeNoteHealthScore(withCaptures).score
    const scoreWithout = computeNoteHealthScore(withoutCaptures).score

    expect(scoreWith).toBeGreaterThan(scoreWithout)
    expect(scoreWith - scoreWithout).toBe(20)
  })

  it('returns yellow color for mid-range scores', () => {
    // 2 indicators ok (title + content) = 40
    const note = makeNote({
      id: 'mid',
      title: 'Has Title',
      content: docWithParagraphs('Has content'),
      tags: [],
      capturedFromIds: [],
      updatedAt: NOW - 30 * 86_400_000,
    })
    const result = computeNoteHealthScore(note)

    expect(result.score).toBe(40)
    expect(result.color).toBe('yellow')
  })
})

// ── RelatedNotesList scoring logic ───────────────────────────────────────────
// Extract the scoring algorithm inline (same logic as the component) to test
// pure scoring without React rendering.

interface ScoredNote {
  note: Note
  score: number
}

function scoreRelatedNotes(target: Note, allNotes: Note[]): ScoredNote[] {
  const noteTags = new Set(target.tags || [])
  const noteCaptureIds = new Set(target.capturedFromIds || [])

  return allNotes
    .filter(n => n.id !== target.id)
    .map(n => {
      let score = 0
      if (n.courseId && n.courseId === target.courseId) score += 3
      if (n.tags) {
        for (const tag of n.tags) {
          if (noteTags.has(tag)) score += 2
        }
      }
      if (n.capturedFromIds) {
        for (const cid of n.capturedFromIds) {
          if (noteCaptureIds.has(cid)) score += 1
        }
      }
      if (n.documentType && n.documentType === target.documentType) score += 1
      return { note: n, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

describe('RelatedNotesList scoring', () => {
  const target = makeNote({
    id: 'target',
    title: 'Target Note',
    courseId: 'course-1',
    tags: ['exam', 'review'],
    capturedFromIds: ['cap-a', 'cap-b'],
    documentType: 'note',
  })

  it('awards +3 for same course', () => {
    const other = makeNote({ id: 'other', courseId: 'course-1', tags: [], capturedFromIds: [] })
    const scored = scoreRelatedNotes(target, [other])

    expect(scored).toHaveLength(1)
    expect(scored[0].score).toBe(3)
  })

  it('awards +2 per shared tag', () => {
    const other = makeNote({
      id: 'other',
      tags: ['exam', 'review'],
      capturedFromIds: [],
      courseId: 'different-course',
    })
    const scored = scoreRelatedNotes(target, [other])

    // 2 shared tags * 2 = 4
    expect(scored[0].score).toBe(4)
  })

  it('awards +1 per shared capturedFromId', () => {
    const other = makeNote({
      id: 'other',
      tags: [],
      capturedFromIds: ['cap-a', 'cap-b'],
      courseId: 'different-course',
    })
    const scored = scoreRelatedNotes(target, [other])

    // 2 shared captures * 1 = 2
    expect(scored[0].score).toBe(2)
  })

  it('awards +1 for same documentType', () => {
    const other = makeNote({
      id: 'other',
      tags: [],
      capturedFromIds: [],
      courseId: 'different-course',
      documentType: 'note',
    })
    const scored = scoreRelatedNotes(target, [other])

    expect(scored[0].score).toBe(1)
  })

  it('combines all scoring factors correctly', () => {
    const other = makeNote({
      id: 'other',
      courseId: 'course-1',       // +3
      tags: ['exam'],            // +2
      capturedFromIds: ['cap-a'], // +1
      documentType: 'note',      // +1
    })
    const scored = scoreRelatedNotes(target, [other])

    expect(scored[0].score).toBe(3 + 2 + 1 + 1)
  })

  it('excludes the target note itself', () => {
    const scored = scoreRelatedNotes(target, [target])
    expect(scored).toHaveLength(0)
  })

  it('excludes notes with score 0', () => {
    const unrelated = makeNote({
      id: 'unrelated',
      tags: ['unrelated-tag'],
      capturedFromIds: ['cap-z'],
      courseId: 'other-course',
      documentType: 'syllabus',
    })
    const scored = scoreRelatedNotes(target, [unrelated])
    expect(scored).toHaveLength(0)
  })

  it('returns at most 5 results sorted by score descending', () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      makeNote({
        id: `n${i}`,
        courseId: 'course-1', // +3 each
        tags: i < 3 ? ['exam'] : [], // first 3 get +2
        capturedFromIds: [],
      })
    )
    const scored = scoreRelatedNotes(target, notes)

    expect(scored.length).toBeLessThanOrEqual(5)
    // Should be sorted descending
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score)
    }
  })

  it('handles notes with undefined tags and capturedFromIds', () => {
    const other = makeNote({
      id: 'other',
      courseId: 'course-1', // +3
      capturedFromIds: [],
    })
    // Force undefined to simulate missing fields
    ;(other as any).tags = undefined
    ;(other as any).capturedFromIds = undefined

    const scored = scoreRelatedNotes(target, [other])
    expect(scored[0].score).toBe(3) // only course match
  })
})
