import { describe, it, expect } from 'vitest'
import { selectPanicItems } from './panicMode'

const NOW = 1_700_000_000_000  // arbitrary fixed epoch ms for deterministic tests

const card = (id: string, opts: any = {}): any => ({
  id, front: id, type: 'flashcard',
  reviewCount: opts.reviewCount ?? 0,
  difficulty: opts.difficulty,
  lastReviewedAt: opts.lastReviewedAt,
  courseId: opts.courseId,
  createdAt: opts.createdAt ?? NOW - 30 * 86_400_000,
})

describe('selectPanicItems', () => {
  it('returns empty list when no items', () => {
    expect(selectPanicItems([], { now: NOW })).toEqual([])
  })

  it('items marked "again" score lower than "good"', () => {
    const failed = card('failed', { reviewCount: 3, difficulty: 'again', lastReviewedAt: NOW - 86_400_000 })
    const known  = card('known',  { reviewCount: 3, difficulty: 'good',  lastReviewedAt: NOW - 86_400_000 })
    const out = selectPanicItems([known, failed], { now: NOW })
    expect(out[0].item.id).toBe('failed')
    expect(out[0].retrievability).toBeLessThan(out[1].retrievability)
  })

  it('older "good" cards beat fresh "good" cards (decay)', () => {
    const fresh = card('fresh',  { reviewCount: 5, difficulty: 'good', lastReviewedAt: NOW })
    const stale = card('stale',  { reviewCount: 5, difficulty: 'good', lastReviewedAt: NOW - 21 * 86_400_000 })
    const out = selectPanicItems([fresh, stale], { now: NOW })
    expect(out[0].item.id).toBe('stale')
  })

  it('unseen cards surface with neutral retrievability', () => {
    const unseen = card('unseen', { reviewCount: 0 })
    const out = selectPanicItems([unseen], { now: NOW })
    expect(out[0].retrievability).toBeCloseTo(0.40, 1)
    expect(out[0].reason).toBe('Never reviewed yet')
  })

  it('respects course scoping', () => {
    const a = card('a', { reviewCount: 0, courseId: 'course-a' })
    const b = card('b', { reviewCount: 0, courseId: 'course-b' })
    const out = selectPanicItems([a, b], { now: NOW, courseId: 'course-a' })
    expect(out.map(o => o.item.id)).toEqual(['a'])
  })

  it('honors limit', () => {
    const cards = Array.from({ length: 50 }, (_, i) => card(`c${i}`, { reviewCount: 0 }))
    const out = selectPanicItems(cards, { now: NOW, limit: 5 })
    expect(out).toHaveLength(5)
  })

  it('reasons are human-readable', () => {
    const items = [
      card('a', { reviewCount: 1, difficulty: 'again', lastReviewedAt: NOW - 0.5 * 86_400_000 }),
      card('b', { reviewCount: 1, difficulty: 'hard',  lastReviewedAt: NOW - 86_400_000 }),
      card('c', { reviewCount: 1, difficulty: 'good',  lastReviewedAt: NOW - 30 * 86_400_000 }),
    ]
    const out = selectPanicItems(items, { now: NOW, limit: 10 })
    const reasons = out.map(o => o.reason)
    expect(reasons.find(r => r.startsWith('Failed'))).toBeTruthy()
    expect(reasons.find(r => r.startsWith('Hard'))).toBeTruthy()
    expect(reasons.find(r => r.includes('Not seen in'))).toBeTruthy()
  })

  it('returns retrievability values in [0, 1]', () => {
    const items = Array.from({ length: 20 }, (_, i) => card(`c${i}`, {
      reviewCount: i,
      difficulty: ['again', 'hard', 'good', 'easy'][i % 4],
      lastReviewedAt: NOW - (i * 3) * 86_400_000,
    }))
    const out = selectPanicItems(items, { now: NOW })
    for (const o of out) {
      expect(o.retrievability).toBeGreaterThanOrEqual(0)
      expect(o.retrievability).toBeLessThanOrEqual(1)
    }
  })
})
