// Panic mode / weakness analysis — REDESIGN_PLAN_V2 ticket T3.
//
// "6 hours till exam, what do I drill?" — the most-cited anonymous
// student request from the medschool / premed / lawschool venting
// channels. Top NotebookLM feature request: "Find what I don't know."
//
// Pure-local: ranks study items by an estimated retrievability score
// based on review history, then surfaces the N most-likely-to-fail.
// No AI, no FSRS dependency yet (T7 will swap to ts-fsrs and we'll
// improve this then).
//
// Algorithm (intentionally simple — the ranking is the whole feature):
//
//   retrievability(item) =
//      base_strength(reviewCount, lastDifficulty)
//    × decay(daysSinceLastReview)
//    × course_match(item.courseId === scopeCourseId)
//
// Items the user has marked "again" or "hard" recently get the lowest
// scores and float to the top. Cards the user hasn't seen at all also
// surface (reviewCount === 0).

import type { StudyItem } from '@schema'

export interface PanicScope {
  courseId?: string
  /** Cap on how many items to surface. Default 20. */
  limit?: number
  /** "now" injection for tests. */
  now?: number
}

export interface PanicItem {
  item: StudyItem
  /** 0..1 — lower means less retrievable, more likely to fail. */
  retrievability: number
  /** Human-readable reason this item bubbled up. */
  reason: string
}

/** Difficulty weight: 'again' (failed) hurts retrievability the most;
 *  'easy' helps the most. Items with no difficulty history get a
 *  neutral weight so they're not penalized as if they'd just failed. */
const DIFFICULTY_STRENGTH: Record<string, number> = {
  again: 0.15,
  hard:  0.45,
  good:  0.75,
  easy:  0.92,
}

export function selectPanicItems(allItems: ReadonlyArray<StudyItem>, scope: PanicScope = {}): PanicItem[] {
  const now = scope.now ?? Date.now()
  const limit = scope.limit ?? 20

  const inScope = scope.courseId
    ? allItems.filter(i => i.courseId === scope.courseId)
    : [...allItems]

  const ranked: PanicItem[] = inScope.map(item => {
    // Base strength derives from the LAST difficulty grade. If the
    // user never reviewed it, treat as fresh — moderate strength so
    // it gets surfaced but not as urgently as something they actively
    // failed last week.
    const lastDifficulty = (item as any).difficulty ?? null
    const reviewCount = item.reviewCount ?? 0
    let baseStrength: number
    if (reviewCount === 0) {
      baseStrength = 0.40 // unseen — surface but not "screaming red"
    } else if (lastDifficulty && DIFFICULTY_STRENGTH[lastDifficulty] !== undefined) {
      baseStrength = DIFFICULTY_STRENGTH[lastDifficulty]
    } else {
      baseStrength = 0.55 // reviewed but no difficulty trail
    }

    // Decay: cards not seen recently are more likely to be forgotten.
    // Half-life ~7 days; matches the standard SR intuition without
    // bringing in full FSRS. Applies after first review only.
    const lastReviewed = (item as any).lastReviewedAt ?? item.createdAt ?? now
    const daysSince = Math.max(0, (now - lastReviewed) / 86_400_000)
    const decay = reviewCount === 0 ? 1.0 : Math.pow(0.5, daysSince / 7)

    const retrievability = Math.max(0, Math.min(1, baseStrength * decay))

    // Human-readable reason — surfaces in the UI so the user knows why
    // this card bubbled up.
    let reason: string
    if (reviewCount === 0) {
      reason = 'Never reviewed yet'
    } else if (lastDifficulty === 'again') {
      reason = `Failed ${formatDays(daysSince)}`
    } else if (lastDifficulty === 'hard') {
      reason = `Hard last review (${formatDays(daysSince)})`
    } else if (daysSince > 14) {
      reason = `Not seen in ${Math.round(daysSince)} days`
    } else if (daysSince > 7) {
      reason = `Last seen ${Math.round(daysSince)} days ago`
    } else {
      reason = lastDifficulty ? `Last: ${lastDifficulty}` : 'Reviewed recently'
    }

    return { item, retrievability, reason }
  })

  return ranked
    .sort((a, b) => a.retrievability - b.retrievability)
    .slice(0, limit)
}

function formatDays(d: number): string {
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  return `${Math.round(d)} days ago`
}
