import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { StudyItem } from '../../../shared/schema/index';
import { fsrs, generatorParameters, Rating, State, createEmptyCard, type Card as FsrsCard } from 'ts-fsrs';

// T7 (REDESIGN_PLAN_V2): FSRS swap. Anki adopted FSRS in 2023 because
// it measurably outperforms SM-2 on retention scheduling — fewer
// reviews for the same retention rate. ts-fsrs is the TypeScript
// drop-in.
//
// We keep the four-button vocabulary the existing UI uses
// (again/hard/good/easy) because that's what users see. ts-fsrs'
// Rating enum maps cleanly: Again=1, Hard=2, Good=3, Easy=4.
//
// Migration: existing items have no FSRS state. First review under
// FSRS bootstraps the card via createEmptyCard with the item's
// createdAt as the seed. The fixed-interval table below remains as a
// hard fallback if ts-fsrs ever throws (defensive — has not happened
// in testing) so the user never gets stuck on a card.

const REVIEW_INTERVALS: Record<NonNullable<StudyItem['difficulty']>, number> = {
  again: 10 * 60_000,
  hard:  24 * 60 * 60_000,
  good:  3 * 24 * 60 * 60_000,
  easy:  7 * 24 * 60 * 60_000,
};

const FSRS_PARAMS = generatorParameters({
  // Retention target: standard Anki default. Exposable as a setting
  // later if user research validates the demand.
  request_retention: 0.9,
  // Slight randomization so a wave of cards reviewed together doesn't
  // all come back on the same future day.
  enable_fuzz: true,
})
const fsrsScheduler = fsrs(FSRS_PARAMS)

const RATING_MAP: Record<NonNullable<StudyItem['difficulty']>, Rating> = {
  again: Rating.Again,
  hard:  Rating.Hard,
  good:  Rating.Good,
  easy:  Rating.Easy,
}

function toFsrsCard(item: StudyItem): FsrsCard {
  if (item.fsrsStability == null || item.fsrsDifficulty == null) {
    return createEmptyCard(new Date(item.createdAt))
  }
  return {
    due: new Date(item.nextReviewAt ?? Date.now()),
    stability: item.fsrsStability,
    difficulty: item.fsrsDifficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: item.reviewCount ?? 0,
    lapses: item.fsrsLapses ?? 0,
    state: stateToEnum(item.fsrsState),
    last_review: item.lastReviewedAt ? new Date(item.lastReviewedAt) : undefined,
  }
}
function stateToEnum(s: StudyItem['fsrsState']): State {
  switch (s) {
    case 'learning':   return State.Learning
    case 'review':     return State.Review
    case 'relearning': return State.Relearning
    case 'new':
    default:           return State.New
  }
}
function enumToState(s: State): NonNullable<StudyItem['fsrsState']> {
  switch (s) {
    case State.Learning:   return 'learning'
    case State.Review:     return 'review'
    case State.Relearning: return 'relearning'
    case State.New:
    default:               return 'new'
  }
}

export const studyService = {
  list(opts?: { courseId?: string; dueOnly?: boolean }): StudyItem[] {
    let items = focusStore.get('studyItems');
    if (opts?.courseId) items = items.filter(i => i.courseId === opts.courseId);
    if (opts?.dueOnly) items = items.filter(i => !i.nextReviewAt || i.nextReviewAt <= Date.now());
    return items.sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
  },

  create(opts: Partial<StudyItem> & { front: string; type?: StudyItem['type'] }): StudyItem {
    const now = Date.now();
    const item: StudyItem = {
      id: randomUUID(),
      courseId: opts.courseId,
      sourceCaptureId: opts.sourceCaptureId,
      type: opts.type ?? 'flashcard',
      front: opts.front.trim(),
      back: opts.back,
      explanation: opts.explanation,
      difficulty: opts.difficulty,
      nextReviewAt: opts.nextReviewAt ?? now,
      reviewCount: opts.reviewCount ?? 0,
      createdAt: now,
      updatedAt: now,
      fsrsState: 'new',
    };
    focusStore.addStudyItem(item);
    return item;
  },

  update(id: string, patch: Partial<StudyItem>): StudyItem {
    focusStore.updateStudyItem(id, patch);
    return focusStore.get('studyItems').find(i => i.id === id)!;
  },

  review(id: string, difficulty: NonNullable<StudyItem['difficulty']>): StudyItem {
    const item = focusStore.get('studyItems').find(i => i.id === id)!;
    const now = Date.now();
    try {
      const card = toFsrsCard(item)
      const result = fsrsScheduler.next(card, new Date(now), RATING_MAP[difficulty])
      const next = result.card
      return this.update(id, {
        difficulty,
        reviewCount: item.reviewCount + 1,
        nextReviewAt: next.due.getTime(),
        fsrsStability: next.stability,
        fsrsDifficulty: next.difficulty,
        fsrsLapses: next.lapses,
        fsrsState: enumToState(next.state),
        lastReviewedAt: now,
      })
    } catch (err) {
      // Defensive fallback to fixed intervals. Should never fire in
      // normal use — ts-fsrs handles all valid inputs — but if it
      // ever does, the user still gets a scheduled review.
      console.warn('[studyService] FSRS failed, using fixed-interval fallback:', err)
      return this.update(id, {
        difficulty,
        reviewCount: item.reviewCount + 1,
        nextReviewAt: now + REVIEW_INTERVALS[difficulty],
        lastReviewedAt: now,
      })
    }
  },

  delete(id: string): void {
    focusStore.set('studyItems', focusStore.get('studyItems').filter(i => i.id !== id));
  },
};
