import { describe, it, expect } from 'vitest'
import { extractCardCandidates } from './extractCards'

const doc = (content: any[]) => JSON.stringify({ type: 'doc', content })
const heading = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe('extractCardCandidates', () => {
  it('returns empty for empty content', () => {
    expect(extractCardCandidates('')).toEqual([])
    expect(extractCardCandidates('not json')).toEqual([])
  })

  it('extracts heading-bounded cards', () => {
    const c = doc([
      heading(3, 'Stakeholder analysis'),
      para('A method for identifying influence and interest.'),
      heading(3, 'Critical path method'),
      para('A scheduling technique using longest-duration sequences.'),
    ])
    const cards = extractCardCandidates(c)
    expect(cards).toHaveLength(2)
    expect(cards[0].front).toBe('Stakeholder analysis')
    expect(cards[0].back).toContain('influence and interest')
    expect(cards[0].source).toBe('heading')
    expect(cards[1].front).toBe('Critical path method')
  })

  it('higher-level headings close but do not open new cards', () => {
    const c = doc([
      heading(3, 'A'),
      para('body of A'),
      heading(2, 'Section break'),
      heading(3, 'B'),
      para('body of B'),
    ])
    const cards = extractCardCandidates(c)
    expect(cards.map(x => x.front)).toEqual(['A', 'B'])
    // h2 closed A but did not become a card itself.
  })

  it('extracts definition-style sentences from free paragraphs', () => {
    const c = doc([
      para('A stakeholder is anyone affected by a project.'),
      para('Risk means an uncertain event that may affect outcomes.'),
    ])
    const cards = extractCardCandidates(c)
    expect(cards).toHaveLength(2)
    expect(cards[0].source).toBe('definition')
    expect(cards[0].front).toBe('A stakeholder')
    expect(cards[0].back).toContain('anyone affected')
    expect(cards[1].front).toBe('Risk')
  })

  it('does NOT double-emit body content as definition cards', () => {
    // Sentence contains "is" but it's already inside a heading-bound card.
    const c = doc([
      heading(3, 'Project lifecycle'),
      para('A project lifecycle is the sequence of phases from start to close.'),
    ])
    const cards = extractCardCandidates(c)
    expect(cards).toHaveLength(1)
    expect(cards[0].source).toBe('heading')
  })

  it('drops dangling headings with no body', () => {
    const c = doc([
      heading(3, 'Empty'),
    ])
    expect(extractCardCandidates(c)).toEqual([])
  })

  it('produces stable cardKeys for the same (front, position)', () => {
    const c = doc([heading(3, 'A'), para('body')])
    const k1 = extractCardCandidates(c)[0].cardKey
    const k2 = extractCardCandidates(c)[0].cardKey
    expect(k1).toBe(k2)
  })

  it('different positions produce different keys for the same front', () => {
    const c = doc([
      heading(3, 'A'), para('body 1'),
      heading(3, 'A'), para('body 2'),
    ])
    const cards = extractCardCandidates(c)
    expect(cards).toHaveLength(2)
    expect(cards[0].cardKey).not.toBe(cards[1].cardKey)
  })

  it('strips quotes/parens around the term in definition extraction', () => {
    const c = doc([para('"Beta" is a measure of volatility.')])
    const cards = extractCardCandidates(c)
    expect(cards[0].front).toBe('Beta')
  })

  it('rejects definitions where the term is too short or too long', () => {
    const c = doc([
      para('I am here.'),                        // 'I' too short
      para('A word that is too long ' + 'x'.repeat(100) + ' is something.'),  // term > 80 chars
    ])
    expect(extractCardCandidates(c)).toEqual([])
  })
})
