// Cross-course universal search — REDESIGN_PLAN_V2 ticket T1.
//
// The wedge attack on NotebookLM. NotebookLM walls notebooks off by
// design; the #1 unmet need across every research pass was a single
// query box that finds anything you've ever written or captured,
// across all your courses, with citations preserved.
//
// Implementation goal: <100ms for 3-character query against ~10K
// items. No LLM, no backend, no embeddings. Plain fuzzy + lexical
// matching over an in-memory index built from props the renderer
// already has.

import type {
  AcademicDeadline,
  Assignment,
  Capture,
  ClassSession,
  Course,
  Note,
  StudyItem,
} from '@schema'

export type SearchKind = 'note' | 'capture' | 'study' | 'deadline' | 'assignment' | 'class' | 'course'

export interface SearchHit {
  id: string                  // unique per kind+id, prefixed
  kind: SearchKind
  title: string               // display title
  snippet: string             // a short matching excerpt; empty if title-only match
  courseId?: string           // for course chip rendering
  /** Underlying record id (the note id, capture id, etc.) — for the click handler. */
  recordId: string
  /** Lower-is-better relevance score. Used only to sort. */
  score: number
}

interface IndexableEntry {
  hit: Omit<SearchHit, 'score' | 'snippet'>
  /** Pre-lowercased haystack for matching. */
  haystack: string
  /** Per-kind boost — recency/importance lever; multiplies the base score. */
  boost: number
}

// ───────────────────────────────────────────────────────────────────────
// Index build
// ───────────────────────────────────────────────────────────────────────

export interface SearchSources {
  notes: Note[]
  captures: Capture[]
  studyItems: StudyItem[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  classSessions: ClassSession[]
  courses: Course[]
}

/** Build a flat index from the renderer's in-memory state. Cheap enough
 *  to call on every keystroke (the slice is tiny — a few hundred to a
 *  few thousand items in steady state) but in practice the caller will
 *  memoize it and only rebuild when one of the source arrays changes. */
export function buildIndex(src: SearchSources): IndexableEntry[] {
  const out: IndexableEntry[] = []
  const now = Date.now()
  const recencyBoost = (ts?: number) => {
    // Items touched in the last 7 days get a small boost; older items
    // decay toward 1.0. No hard cliff.
    if (!ts) return 1.0
    const days = Math.max(0, (now - ts) / 86_400_000)
    return 1 + Math.max(0, 0.5 - days * 0.05)
  }

  for (const n of src.notes) {
    const body = noteBody(n.content)
    const title = (n.title || 'Untitled').trim()
    out.push({
      hit: { id: `note:${n.id}`, kind: 'note', title, courseId: n.courseId, recordId: n.id },
      haystack: (title + ' ' + body).toLowerCase(),
      boost: recencyBoost(n.updatedAt ?? n.createdAt),
    })
  }
  for (const c of src.captures) {
    const text = (c.text ?? '').trim()
    const title = text.slice(0, 60) || 'Capture'
    out.push({
      hit: { id: `capture:${c.id}`, kind: 'capture', title, courseId: c.courseId, recordId: c.id },
      haystack: text.toLowerCase(),
      boost: recencyBoost(c.createdAt) * 0.85,
    })
  }
  for (const s of src.studyItems) {
    const title = (s.front || '').trim() || 'Study item'
    const body = (s.back ?? '').trim()
    out.push({
      hit: { id: `study:${s.id}`, kind: 'study', title, courseId: s.courseId, recordId: s.id },
      haystack: (title + ' ' + body).toLowerCase(),
      boost: recencyBoost(s.createdAt) * 0.8,
    })
  }
  for (const d of src.deadlines) {
    if (d.completed) continue
    out.push({
      hit: { id: `deadline:${d.id}`, kind: 'deadline', title: d.title, courseId: d.courseId, recordId: d.id },
      haystack: d.title.toLowerCase(),
      // Closer-to-now deadlines float up — the user is probably searching
      // for what's next, not what's far off.
      boost: 1 + Math.max(0, 0.4 - Math.max(0, (d.deadlineAt - now) / 86_400_000) * 0.02),
    })
  }
  for (const a of src.assignments) {
    out.push({
      hit: { id: `assignment:${a.id}`, kind: 'assignment', title: a.title, courseId: a.courseId, recordId: a.id },
      haystack: a.title.toLowerCase(),
      boost: recencyBoost(a.dueDate) * 0.9,
    })
  }
  for (const cs of src.classSessions) {
    if (!cs.title) continue
    out.push({
      hit: { id: `class:${cs.id}`, kind: 'class', title: cs.title, courseId: cs.courseId, recordId: cs.id },
      haystack: cs.title.toLowerCase(),
      boost: recencyBoost(cs.startedAt ?? 0) * 0.7,
    })
  }
  for (const c of src.courses) {
    const title = c.name || c.code || 'Course'
    out.push({
      hit: { id: `course:${c.id}`, kind: 'course', title, courseId: c.id, recordId: c.id },
      haystack: ((c.name ?? '') + ' ' + (c.code ?? '')).toLowerCase(),
      boost: 1.0,
    })
  }
  return out
}

// ───────────────────────────────────────────────────────────────────────
// Query
// ───────────────────────────────────────────────────────────────────────

/** Lexical first, fuzzy second. Whole-word and prefix matches outrank
 *  loose substring matches. Empty query returns most-recent items. */
export function search(index: IndexableEntry[], query: string, limit = 30): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    // Empty query — return top-30 by boost (i.e. most-recent / nearest).
    return index
      .map(e => ({ ...e.hit, snippet: '', score: -e.boost }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
  }

  // Tokenize the query so we can score each token's contribution.
  // Whitespace + simple punctuation is enough; this isn't NLP.
  const tokens = q.split(/[\s\-_/]+/).filter(t => t.length >= 2)
  if (tokens.length === 0) return []

  const hits: SearchHit[] = []
  for (const e of index) {
    let score = 0
    let allTokensFound = true
    for (const tok of tokens) {
      const i = e.haystack.indexOf(tok)
      if (i === -1) { allTokensFound = false; break }
      // Prefix-of-haystack and prefix-of-word both score better than
      // mid-word substring. Cheap proxy: low index value or a word
      // boundary one position to the left.
      const isWordStart = i === 0 || /[\s\-_/.,;:!?()]/.test(e.haystack[i - 1] ?? ' ')
      score += isWordStart ? 1.0 : 1.6
      // Penalize matches that are deep into the haystack — title hits
      // tend to be near 0, body hits get progressively worse.
      score += Math.min(1.5, i / 800)
    }
    if (!allTokensFound) continue
    // Normalize per-token + apply boost.
    const finalScore = (score / tokens.length) / e.boost
    // Build a short snippet around the first match for context.
    const idx = e.haystack.indexOf(tokens[0])
    const start = Math.max(0, idx - 20)
    const snippet = idx < 0 ? '' : e.haystack.slice(start, start + 100)
    hits.push({ ...e.hit, snippet, score: finalScore })
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit)
}

/** Extract just the plain text from a TipTap document JSON. Cheap walker. */
function noteBody(content: string): string {
  if (!content) return ''
  try {
    const out: string[] = []
    const walk = (node: any) => {
      if (!node) return
      if (typeof node.text === 'string') out.push(node.text)
      if (Array.isArray(node.content)) node.content.forEach(walk)
    }
    walk(JSON.parse(content))
    return out.join(' ')
  } catch {
    // If it's plain string content (unparsed legacy), use as-is.
    return String(content).slice(0, 4000)
  }
}
