import { describe, it, expect } from 'vitest'
import { buildBrief, buildStudyGuide } from './studioGenerators'
import type { Note } from '@schema'

const note = (id: string, title: string, doc: any, updatedAt = Date.now()): Note =>
  ({ id, title, content: JSON.stringify(doc), createdAt: updatedAt, updatedAt }) as any

const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...blocks: any[]) => ({ type: 'doc', content: blocks })

describe('buildBrief', () => {
  it('returns empty array for no notes', () => {
    expect(buildBrief([])).toEqual([])
  })

  it('emits one section per note, with H1s extracted in order', () => {
    const n = note('n1', 'Stakeholders', doc(h(1, 'Background'), p('intro'), h(1, 'Theory')))
    const result = buildBrief([n])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      noteId: 'n1',
      noteTitle: 'Stakeholders',
      headings: ['Background', 'Theory'],
    })
  })

  it('handles notes with no H1s — empty headings array', () => {
    const n = note('n1', 'Quick thoughts', doc(p('just a paragraph'), h(2, 'h2 not h1')))
    expect(buildBrief([n])[0].headings).toEqual([])
  })

  it('skips empty H1s (whitespace only)', () => {
    const n = note('n1', 'X', doc(h(1, '   '), h(1, 'real heading')))
    expect(buildBrief([n])[0].headings).toEqual(['real heading'])
  })

  it('uses "Untitled" if title is missing', () => {
    const n = note('n1', '', doc(h(1, 'a')))
    expect(buildBrief([n])[0].noteTitle).toBe('Untitled')
  })

  it('sorts by recency descending', () => {
    const old = note('old', 'old', doc(h(1, 'a')), 1000)
    const recent = note('recent', 'recent', doc(h(1, 'b')), 5000)
    const result = buildBrief([old, recent])
    expect(result.map(s => s.noteId)).toEqual(['recent', 'old'])
  })

  it('handles malformed JSON gracefully (returns empty headings)', () => {
    const n = { id: 'n1', title: 't', content: '{not json', createdAt: 0, updatedAt: 0 } as any
    expect(buildBrief([n])[0].headings).toEqual([])
  })
})

describe('buildStudyGuide', () => {
  it('returns empty for no notes', () => {
    expect(buildStudyGuide([])).toEqual([])
  })

  it('extracts H2/H3 only — skips H1 and H4', () => {
    const n = note('n1', 't', doc(h(1, 'top'), h(2, 'sec'), h(3, 'sub'), h(4, 'deep')))
    const result = buildStudyGuide([n])
    expect(result.map(e => e.heading)).toEqual(['sec', 'sub'])
  })

  it('attaches the first sentence of the next paragraph as summary', () => {
    const n = note('n1', 't', doc(
      h(2, 'Stakeholders'),
      p('A stakeholder is anyone affected by the project. They have varied interests.'),
    ))
    const result = buildStudyGuide([n])
    expect(result[0]).toMatchObject({
      heading: 'Stakeholders',
      level: 2,
      firstSentence: 'A stakeholder is anyone affected by the project.',
    })
  })

  it('stops looking for a paragraph at the next heading', () => {
    const n = note('n1', 't', doc(
      h(2, 'A'),
      h(2, 'B'),
      p('this belongs to B, not A'),
    ))
    const result = buildStudyGuide([n])
    expect(result[0].firstSentence).toBe('') // A has no paragraph before B
    expect(result[1].firstSentence).toBe('this belongs to B, not A')
  })

  it('truncates very long sentences with ellipsis at ~180 chars', () => {
    const long = 'x'.repeat(300)
    const n = note('n1', 't', doc(h(2, 'Big'), p(long)))
    const summary = buildStudyGuide([n])[0].firstSentence
    expect(summary.length).toBeLessThanOrEqual(181)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('preserves note title + id on every entry for citation back to source', () => {
    const n = note('note-buad-1', 'BUAD 6621 lecture 3', doc(h(2, 'Risk')))
    const result = buildStudyGuide([n])
    expect(result[0].noteId).toBe('note-buad-1')
    expect(result[0].noteTitle).toBe('BUAD 6621 lecture 3')
  })

  it('ignores empty headings', () => {
    const n = note('n1', 't', doc(h(2, '   '), h(2, 'real')))
    const result = buildStudyGuide([n])
    expect(result.map(e => e.heading)).toEqual(['real'])
  })

  it('does NOT use AI / heuristic synthesis — output text is verbatim from notes', () => {
    // Regression guard: the brand promise is "no invention". This test
    // verifies that for a heading "Stakeholders" with body sentence
    // "A stakeholder is anyone affected", we return EXACTLY those words
    // from the note — never a paraphrased version.
    const original = 'A stakeholder is anyone affected by the project.'
    const n = note('n1', 't', doc(h(2, 'Stakeholders'), p(original + ' More content here.')))
    const summary = buildStudyGuide([n])[0].firstSentence
    expect(summary).toBe(original)
    expect(summary).not.toContain('synth')
    expect(summary).not.toContain('summary')
  })
})
