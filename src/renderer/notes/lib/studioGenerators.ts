// Studio generators — REDESIGN_PLAN_V2 right-panel rework.
//
// NotebookLM's Studio shows feature cards (Audio Overview, Mind Map,
// Briefing Doc, Study Guide, Quiz, Flashcards, Timeline) that produce
// synthesized outputs from your sources. Most of theirs use LLM
// inference; ours are deterministic by default — extracted from the
// notes the user actually wrote.
//
// The research found AI-generated summaries to be the canonical 2026
// "you're not actually studying" tell. So we don't synthesize via
// LLM unless we can match NotebookLM's hallucination floor (~13%).
// Brief and Study Guide are 100% mechanical extraction; the user's
// own words stay the user's own words.

import type { Note } from '@schema'

export interface BriefSection {
  noteId: string
  noteTitle: string
  /** Top-level (H1) heading text in the order it appears, or the note
   *  title as a single section if the note has no headings. */
  headings: string[]
  /** Updated timestamp for sorting recency in the brief. */
  updatedAt: number
}

/** Build a "Briefing Doc" from a course's notes — a flat outline of
 *  every note's title + its top-level headings, sorted by recency.
 *  Mirrors NotebookLM's "give me a briefing" but uses the user's own
 *  structure instead of an LLM rewrite.  No invention. */
export function buildBrief(notes: ReadonlyArray<Note>): BriefSection[] {
  return notes
    .map(n => ({
      noteId: n.id,
      noteTitle: (n.title || 'Untitled').trim(),
      headings: extractH1s(n.content),
      updatedAt: n.updatedAt ?? n.createdAt ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export interface StudyGuideEntry {
  noteId: string
  noteTitle: string
  /** A heading at H2 or H3 level. */
  heading: string
  level: 2 | 3
  /** First sentence of the paragraph that follows the heading, or
   *  empty if no paragraph followed.  Used as a "summary" without any
   *  AI synthesis. */
  firstSentence: string
}

/** Build a "Study Guide" — every H2/H3 heading across the corpus, with
 *  the first sentence after each heading as a deterministic summary.
 *  This is what shows up in NotebookLM's Study Guide card, but ours
 *  is just an outline-with-context-snippets — no rewriting. */
export function buildStudyGuide(notes: ReadonlyArray<Note>): StudyGuideEntry[] {
  const out: StudyGuideEntry[] = []
  for (const n of notes) {
    const title = (n.title || 'Untitled').trim()
    const blocks = extractHeadingsWithFollowingSentence(n.content)
    for (const b of blocks) {
      out.push({
        noteId: n.id,
        noteTitle: title,
        heading: b.heading,
        level: b.level,
        firstSentence: b.firstSentence,
      })
    }
  }
  return out
}

// ───────────────────────────────────────────────────────────────────
// Internal: TipTap-JSON walkers
// ───────────────────────────────────────────────────────────────────

function extractH1s(content: string): string[] {
  if (!content) return []
  let doc: any
  try { doc = JSON.parse(content) } catch { return [] }
  const out: string[] = []
  for (const block of asArray(doc?.content)) {
    if (block?.type === 'heading' && block.attrs?.level === 1) {
      const text = textOf(block).trim()
      if (text) out.push(text)
    }
  }
  return out
}

function extractHeadingsWithFollowingSentence(
  content: string,
): Array<{ heading: string; level: 2 | 3; firstSentence: string }> {
  if (!content) return []
  let doc: any
  try { doc = JSON.parse(content) } catch { return [] }
  const blocks = asArray(doc?.content)
  const out: Array<{ heading: string; level: 2 | 3; firstSentence: string }> = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b?.type !== 'heading') continue
    const lvl = b.attrs?.level
    if (lvl !== 2 && lvl !== 3) continue
    const heading = textOf(b).trim()
    if (!heading) continue
    // Find the first paragraph that follows; pull its first sentence.
    let firstSentence = ''
    for (let j = i + 1; j < blocks.length && j < i + 6; j++) {
      const bb = blocks[j]
      if (bb?.type === 'heading') break // hit the next heading; stop
      if (bb?.type === 'paragraph') {
        const t = textOf(bb).trim()
        if (t) {
          firstSentence = firstSentenceOf(t)
          break
        }
      }
    }
    out.push({ heading, level: lvl as 2 | 3, firstSentence })
  }
  return out
}

function asArray(x: any): any[] { return Array.isArray(x) ? x : [] }

function textOf(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return asArray(node.content).map(textOf).join('')
}

/** Cheap first-sentence: take up to the first . ! ? followed by space
 *  or end-of-string. If the paragraph is one long sentence, return it
 *  truncated to ~180 chars. */
function firstSentenceOf(s: string): string {
  const m = s.match(/^[^.!?]*[.!?](?=\s|$)/)
  if (m) return m[0].trim()
  return s.length > 180 ? s.slice(0, 180).trimEnd() + '…' : s
}
