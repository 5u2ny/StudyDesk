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
import { parseTipTapJson, textOfTipTapNode, walkTipTapDoc, type TipTapNode } from '../../../shared/tiptap'

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
  const doc = parseTipTapJson(content)
  if (!doc) return []
  const out: string[] = []
  // Recursive walk so headings inside bulletList / blockquote / details
  // are still discovered (review I2 — the previous top-level loop
  // missed nested cases). Document order preserved.
  walkTipTapDoc(doc, node => {
    if (node?.type === 'heading' && node.attrs?.level === 1) {
      const text = textOfTipTapNode(node).trim()
      if (text) out.push(text)
    }
  })
  return out
}

function extractHeadingsWithFollowingSentence(
  content: string,
): Array<{ heading: string; level: 2 | 3; firstSentence: string }> {
  const doc = parseTipTapJson(content)
  if (!doc) return []
  // Flatten the document into a stream of leaf-y blocks
  // (heading + paragraph) in document order. Then pair each H2/H3
  // with the next paragraph that follows it, stopping at the next
  // heading. This is the recursive version of the previous flat scan
  // (review I2): nested headings inside lists/blockquotes are now
  // discovered, and we still skip irrelevant block types like
  // images / codeBlocks when looking for the summary paragraph.
  const stream: TipTapNode[] = []
  walkTipTapDoc(doc, node => {
    if (node?.type === 'heading' || node?.type === 'paragraph') {
      stream.push(node)
    }
  })
  const out: Array<{ heading: string; level: 2 | 3; firstSentence: string }> = []
  for (let i = 0; i < stream.length; i++) {
    const b = stream[i]
    if (b.type !== 'heading') continue
    const lvl = b.attrs?.level
    if (lvl !== 2 && lvl !== 3) continue
    const heading = textOfTipTapNode(b).trim()
    if (!heading) continue
    let firstSentence = ''
    // Walk forward up to 5 stream nodes for the first paragraph,
    // stopping at the next heading.
    for (let j = i + 1; j < stream.length && j < i + 6; j++) {
      const bb = stream[j]
      if (bb.type === 'heading') break
      if (bb.type === 'paragraph') {
        const t = textOfTipTapNode(bb).trim()
        if (t) { firstSentence = firstSentenceOf(t); break }
      }
    }
    out.push({ heading, level: lvl as 2 | 3, firstSentence })
  }
  return out
}

/** First-sentence extractor that doesn't break on common abbreviations
 *  or decimals (review I3). The earlier regex matched at the FIRST .,
 *  so "Dr. Smith said hi." returned "Dr." Now we scan and skip period
 *  matches that are preceded by an abbreviation or a digit (decimals
 *  like "3.14") and require a real sentence boundary: . ! or ? at
 *  end-of-string OR followed by whitespace + an uppercase letter.
 *  Paragraph-without-terminator falls back to a length cap. */
const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'no',
  'inc', 'ltd', 'co', 'corp', 'vs', 'etc', 'ie', 'eg', 'al',
])
function firstSentenceOf(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    // Decimal? skip.
    if (ch === '.' && /\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? '')) continue
    // Abbreviation? scan back to the previous space, lowercase, check.
    if (ch === '.') {
      let k = i - 1
      while (k >= 0 && /[A-Za-z]/.test(s[k])) k--
      const word = s.slice(k + 1, i).toLowerCase()
      if (word && ABBREVIATIONS.has(word)) continue
    }
    // Sentence boundary requires end-of-string OR whitespace next, then
    // an uppercase / opener / nothing. Looser than perfect but good
    // enough.
    const next = s[i + 1]
    if (next === undefined || next === '\n') return s.slice(0, i + 1).trim()
    if (/\s/.test(next)) {
      const after = s.slice(i + 1).trimStart()
      if (after === '' || /^[A-Z"'(\[]/.test(after) || /^["'(\[]/.test(after)) {
        return s.slice(0, i + 1).trim()
      }
    }
  }
  // No terminator found — truncate.
  return s.length > 180 ? s.slice(0, 180).trimEnd() + '…' : s
}
