import { describe, it, expect } from 'vitest'
import { buildIndex, search, type SearchSources } from './searchIndex'

const empty: SearchSources = {
  notes: [], captures: [], studyItems: [], deadlines: [],
  assignments: [], classSessions: [], courses: [],
}

const note = (id: string, title: string, body = '', updatedAt = Date.now(), courseId?: string): any => ({
  id, title, content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] }),
  updatedAt, createdAt: updatedAt, courseId,
})
const capture = (id: string, text: string, courseId?: string): any => ({ id, text, createdAt: Date.now(), courseId })

describe('buildIndex', () => {
  it('returns empty for empty sources', () => {
    expect(buildIndex(empty)).toEqual([])
  })
  it('indexes notes with title + body together', () => {
    const ix = buildIndex({ ...empty, notes: [note('n1', 'Stakeholder analysis', 'Why stakeholders matter for project management')] })
    expect(ix).toHaveLength(1)
    expect(ix[0].haystack).toContain('stakeholder')
    expect(ix[0].haystack).toContain('project management')
    expect(ix[0].hit.kind).toBe('note')
    expect(ix[0].hit.title).toBe('Stakeholder analysis')
  })
  it('handles untitled notes gracefully', () => {
    const ix = buildIndex({ ...empty, notes: [note('n1', '', 'body only')] })
    expect(ix[0].hit.title).toBe('Untitled')
  })
  it('indexes plain-string content (legacy notes that are not JSON)', () => {
    const ix = buildIndex({ ...empty, notes: [{ id: 'n1', title: 'Legacy', content: 'plain string content here', createdAt: 0, updatedAt: 0 } as any] })
    expect(ix[0].haystack).toContain('plain string')
  })
  it('skips completed deadlines', () => {
    const ix = buildIndex({ ...empty, deadlines: [
      { id: 'd1', title: 'Past', deadlineAt: 1, completed: true } as any,
      { id: 'd2', title: 'Live', deadlineAt: Date.now() + 86_400_000 } as any,
    ]})
    expect(ix.map(e => e.hit.recordId)).toEqual(['d2'])
  })
})

describe('search', () => {
  it('empty query returns most-recent items by boost order', () => {
    const recent = note('n1', 'recent', '', Date.now())
    const old    = note('n2', 'old',    '', Date.now() - 30 * 86_400_000)
    const ix = buildIndex({ ...empty, notes: [old, recent] })
    const hits = search(ix, '', 10)
    expect(hits.map(h => h.recordId)).toEqual(['n1', 'n2'])
  })

  it('finds a token across notes + captures', () => {
    const ix = buildIndex({
      ...empty,
      notes: [note('n1', 'About stakeholders', 'theory')],
      captures: [capture('c1', 'A capture mentioning stakeholders too')],
    })
    const hits = search(ix, 'stakeholders')
    expect(hits.map(h => h.kind)).toContain('note')
    expect(hits.map(h => h.kind)).toContain('capture')
  })

  it('ranks word-start prefix matches above mid-word substring', () => {
    const ix = buildIndex({
      ...empty,
      notes: [
        note('n1', 'Project Charter', '', Date.now()),
        note('n2', 'Reproject onto plane', '', Date.now()),
      ],
    })
    const hits = search(ix, 'project')
    expect(hits[0].recordId).toBe('n1') // word-start match wins
  })

  it('AND-joins multiple tokens — every token must match', () => {
    const ix = buildIndex({ ...empty, notes: [
      note('n1', 'Stakeholder analysis', 'project management theory'),
      note('n2', 'Stakeholder dinner', 'unrelated content'),
    ]})
    const hits = search(ix, 'stakeholder project')
    expect(hits).toHaveLength(1)
    expect(hits[0].recordId).toBe('n1')
  })

  it('filters out single-character query tokens (prevents noise)', () => {
    const ix = buildIndex({ ...empty, notes: [note('n1', 'A', '')] })
    expect(search(ix, 'a')).toEqual([])
  })

  it('returns a snippet for body matches', () => {
    const ix = buildIndex({ ...empty, notes: [note('n1', 'Title', 'A long body that contains the word stakeholder in the middle of it')] })
    const hits = search(ix, 'stakeholder')
    expect(hits[0].snippet).toContain('stakeholder')
  })

  it('respects limit', () => {
    const ix = buildIndex({ ...empty, notes: Array.from({ length: 50 }, (_, i) => note(`n${i}`, `Note ${i}`, 'shared body keyword')) })
    expect(search(ix, 'keyword', 10)).toHaveLength(10)
  })

  it('preserves courseId for client-side rendering of course chip', () => {
    const ix = buildIndex({ ...empty, notes: [note('n1', 'Tagged note', '', Date.now(), 'course-buad-6621')] })
    expect(search(ix, 'tagged')[0].courseId).toBe('course-buad-6621')
  })
})
