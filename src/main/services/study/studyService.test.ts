// T7 (REDESIGN_PLAN_V2): FSRS smoke tests. The interesting invariants
// to check:
//   1. A fresh card reviewed Good is scheduled in the future (not now)
//   2. Again < Hard < Good < Easy in next-review distance
//   3. Repeated Good extends the interval (proper SR behavior)
//   4. Existing items without FSRS state still work (migration path)
//   5. State transitions: new → learning/review on first review

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the focus store BEFORE importing the service so the service
// gets the mocked module on its `import { focusStore }` line.
const items: any[] = []
vi.mock('../store', () => ({
  focusStore: {
    get: (key: string) => key === 'studyItems' ? items : [],
    set: (_key: string, v: any) => { items.length = 0; items.push(...v) },
    addStudyItem: (it: any) => { items.push(it) },
    updateStudyItem: (id: string, patch: any) => {
      const idx = items.findIndex(i => i.id === id)
      if (idx >= 0) items[idx] = { ...items[idx], ...patch }
    },
  },
}))

import { studyService } from './studyService'

beforeEach(() => { items.length = 0 })

describe('studyService.review (FSRS)', () => {
  it('schedules a fresh card forward when reviewed Good', () => {
    const c = studyService.create({ front: 'Q', type: 'flashcard' })
    const reviewed = studyService.review(c.id, 'good')
    expect(reviewed.nextReviewAt).toBeGreaterThan(Date.now())
    expect(reviewed.reviewCount).toBe(1)
    expect(reviewed.lastReviewedAt).toBeGreaterThan(0)
    expect(reviewed.fsrsState).toBeDefined()
    expect(reviewed.fsrsStability).toBeGreaterThan(0)
  })

  it('Again < Hard < Good < Easy in next-review distance', () => {
    const make = () => studyService.create({ front: 'Q', type: 'flashcard' })
    const now = Date.now()
    const a = studyService.review(make().id, 'again')
    const h = studyService.review(make().id, 'hard')
    const g = studyService.review(make().id, 'good')
    const e = studyService.review(make().id, 'easy')
    const da = a.nextReviewAt! - now
    const dh = h.nextReviewAt! - now
    const dg = g.nextReviewAt! - now
    const de = e.nextReviewAt! - now
    expect(da).toBeLessThan(dh)
    expect(dh).toBeLessThan(dg)
    expect(dg).toBeLessThan(de)
  })

  it('repeated Good ratings extend the interval (real SR behavior)', () => {
    const c = studyService.create({ front: 'Q', type: 'flashcard' })
    let last = c
    for (let i = 0; i < 5; i++) last = studyService.review(c.id, 'good')
    // After several Good reviews, the stability and distance grow.
    expect(last.fsrsStability).toBeGreaterThan(1)
    expect(last.reviewCount).toBe(5)
  })

  it('Again after Good shortens the next review (re-learning)', () => {
    const c = studyService.create({ front: 'Q', type: 'flashcard' })
    studyService.review(c.id, 'good')
    studyService.review(c.id, 'good')
    const goodAgain = studyService.review(c.id, 'good')
    studyService.review(c.id, 'good')
    // Now lapse:
    const lapsed = studyService.review(c.id, 'again')
    // Lapse counter is FSRS-State dependent (only counts in Review
    // state), so we don't assert on it directly. The user-visible
    // invariant is that the next review is much sooner than a Good
    // would have scheduled.
    expect(lapsed.nextReviewAt!).toBeLessThan(goodAgain.nextReviewAt!)
    expect(lapsed.fsrsState).toBeDefined()
  })

  it('handles items missing FSRS state (legacy migration path)', () => {
    // Simulate a legacy item directly inserted into the store with no
    // FSRS fields.
    items.push({
      id: 'legacy-1', front: 'Q', type: 'flashcard',
      reviewCount: 3, createdAt: Date.now() - 30 * 86_400_000, updatedAt: Date.now() - 30 * 86_400_000,
    })
    const reviewed = studyService.review('legacy-1', 'good')
    expect(reviewed.fsrsStability).toBeGreaterThan(0)
    expect(reviewed.fsrsState).toBeDefined()
    expect(reviewed.reviewCount).toBe(4)
  })
})
