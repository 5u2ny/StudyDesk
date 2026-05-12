// Note Health / Lint heuristics — port of nashsu/llm_wiki's "Lint" idea
// minus the LLM-driven contradiction check (which we explicitly skip per
// the AI-optional constraint).
//
// All checks are pure functions over the existing JSON store. They run
// in the renderer on every render of the panel; for hundreds of notes
// that's cheap enough that we don't bother memoizing per-issue.

import type { Note } from '@schema'
import { allTextFromTipTapJson, parseTipTapJson, walkTipTapDoc } from '../../../shared/tiptap'

export type LintSeverity = 'warn' | 'info'

export type LintIssueKind =
  | 'orphan_note_link'    // [[wiki-link]] points at a note id that no longer exists
  | 'untitled_note'       // empty title
  | 'empty_note'          // no real content (just the wrapping doc)
  | 'stale_note'          // not updated in N days
  | 'dangling_subpage'    // parentId points at a missing note

export interface LintIssue {
  kind: LintIssueKind
  severity: LintSeverity
  noteId: string
  noteTitle: string
  message: string
  /** Optional secondary id (e.g. the broken parent or target note). */
  related?: string
}

export interface LintOptions {
  /** Notes considered "stale" if their updatedAt is older than this many days. */
  staleDays?: number
}

const DEFAULT_STALE_DAYS = 60

export function lintNotes(notes: Note[], opts: LintOptions = {}): LintIssue[] {
  const issues: LintIssue[] = []
  const staleThreshold = Date.now() - (opts.staleDays ?? DEFAULT_STALE_DAYS) * 86_400_000
  const noteIds = new Set(notes.map(n => n.id))

  for (const n of notes) {
    const titleLabel = n.title || '(untitled)'

    // Untitled
    if (!n.title || !n.title.trim()) {
      issues.push({
        kind: 'untitled_note',
        severity: 'info',
        noteId: n.id,
        noteTitle: titleLabel,
        message: 'Note has no title',
      })
    }

    // Empty content (a TipTap doc with no real text content)
    if (isEmptyContent(n.content)) {
      issues.push({
        kind: 'empty_note',
        severity: 'info',
        noteId: n.id,
        noteTitle: titleLabel,
        message: 'Note has no body content',
      })
    }

    // Stale
    if (n.updatedAt && n.updatedAt < staleThreshold) {
      const days = Math.floor((Date.now() - n.updatedAt) / 86_400_000)
      issues.push({
        kind: 'stale_note',
        severity: 'info',
        noteId: n.id,
        noteTitle: titleLabel,
        message: `Last updated ${days} days ago`,
      })
    }

    // Dangling parentId
    if (n.parentId && !noteIds.has(n.parentId)) {
      issues.push({
        kind: 'dangling_subpage',
        severity: 'warn',
        noteId: n.id,
        noteTitle: titleLabel,
        message: 'Parent note no longer exists — subpage is orphaned',
        related: n.parentId,
      })
    }

    // Orphan note links: scan content for noteLink marks pointing at
    // missing note ids. Cheap regex over the serialized JSON string.
    const orphans = findOrphanNoteLinks(n.content, noteIds)
    for (const orphanId of orphans) {
      issues.push({
        kind: 'orphan_note_link',
        severity: 'warn',
        noteId: n.id,
        noteTitle: titleLabel,
        message: `[[wiki-link]] points at a deleted note`,
        related: orphanId,
      })
    }
  }

  return issues
}

/** Returns true when the TipTap content has no meaningful text. */
export function isEmptyContent(content: string): boolean {
  if (!content || !content.trim()) return true
  // Not JSON: treat the raw string as content; non-empty means non-empty.
  return !allTextFromTipTapJson(content, content).trim()
}

/** Walk the TipTap JSON for noteLink marks whose noteId isn't in the
 *  known set. Returns the set of orphan ids found. */
export function findOrphanNoteLinks(content: string, knownIds: Set<string>): string[] {
  if (!content) return []
  const json = parseTipTapJson(content)
  if (!json) return []

  const ids = new Set<string>()
  walkTipTapDoc(json, node => {
    if (node.type !== 'text' || !Array.isArray(node.marks)) return
    for (const mark of node.marks) {
      const noteId = mark?.type === 'noteLink' ? mark.attrs?.noteId : undefined
      if (typeof noteId === 'string') ids.add(noteId)
    }
  })
  return Array.from(ids).filter(id => !knownIds.has(id))
}

export function summarizeIssues(issues: LintIssue[]): {
  total: number
  byKind: Record<LintIssueKind, number>
  warnCount: number
  infoCount: number
} {
  const byKind: Record<LintIssueKind, number> = {
    orphan_note_link: 0,
    untitled_note: 0,
    empty_note: 0,
    stale_note: 0,
    dangling_subpage: 0,
  }
  let warnCount = 0
  let infoCount = 0
  for (const i of issues) {
    byKind[i.kind]++
    if (i.severity === 'warn') warnCount++
    else infoCount++
  }
  return { total: issues.length, byKind, warnCount, infoCount }
}

// ── Note Health Score ─────────────────────────────────────────────────────────
// Computes a 0-100 health score for a note based on completeness indicators.

export type HealthColor = 'green' | 'yellow' | 'red'

export interface HealthIndicator {
  label: string
  ok: boolean
}

export interface NoteHealthResult {
  score: number           // 0-100
  color: HealthColor
  indicators: HealthIndicator[]
}

/**
 * Compute a health score for a note based on completeness and freshness.
 */
export function computeNoteHealthScore(note: Note): NoteHealthResult {
  const indicators: HealthIndicator[] = []

  // 1. Has title
  const hasTitle = !!(note.title && note.title.trim())
  indicators.push({ label: 'Has title', ok: hasTitle })

  // 2. Has content
  const hasContent = !isEmptyContent(note.content)
  indicators.push({ label: 'Has content', ok: hasContent })

  // 3. Has tags
  const hasTags = !!(note.tags && note.tags.length > 0)
  indicators.push({ label: 'Has tags', ok: hasTags })

  // 4. Has linked captures or study items
  const hasCaptures = !!(note.capturedFromIds && note.capturedFromIds.length > 0)
  indicators.push({ label: 'Linked captures', ok: hasCaptures })

  // 5. Recently updated (within 7 days = green, 14 = yellow, 30+ = red)
  const daysSinceUpdate = Math.floor((Date.now() - note.updatedAt) / 86_400_000)
  const recentlyUpdated = daysSinceUpdate <= 14
  indicators.push({ label: `Updated ${daysSinceUpdate}d ago`, ok: recentlyUpdated })

  // Score: each indicator is worth 20 points
  const score = indicators.filter(i => i.ok).length * 20

  const color: HealthColor = score >= 80 ? 'green' : score >= 40 ? 'yellow' : 'red'

  return { score, color, indicators }
}
