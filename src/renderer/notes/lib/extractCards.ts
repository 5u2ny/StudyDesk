// Renderer-side flashcard extraction — REDESIGN_PLAN_V2 ticket T2.
//
// Mirrors src/main/services/study/flashcardSyncService.ts extraction
// logic so the renderer can show the user a *preview* of candidate
// cards before they ship to the store. The user keeps, skips, or
// edits each candidate. Only kept ones become real study items.
//
// The research finding this addresses (top public + anonymous request):
// "I don't want pretty notes, I want my notes to quiz me back."
//   — r/GetStudying
// "Stopped re-reading. Started failing practice questions on purpose."
//   — Threads, MIT grad
//
// AI-as-draft, not AI-as-final. (Actually no AI here at all — pure
// heading + first-sentence extraction. Deterministic.)

import { parseTipTapJson } from '../../../shared/tiptap'

export interface CardCandidate {
  /** Stable across sessions for a given (front + position) pair. */
  cardKey: string
  front: string
  back: string
  /** Where in the note this came from. Used for ordering only. */
  position: number
  /** What kind of pattern produced this card. Surfaces in the UI so
   *  the user knows whether they're confirming a heading (probably
   *  good) or a definition sentence (might be wrong). */
  source: 'heading' | 'definition'
}

const DEFAULT_HEADING_LEVEL = 3

/** Walk a TipTap JSON doc and produce candidate cards. Two patterns:
 *  1. Heading at the configured level → front; following blocks until
 *     next heading-at-or-above → back.
 *  2. Sentences containing "is/are/means/refers to/defined as" within
 *     paragraph blocks → front = the term, back = the definition.
 *
 *  Pattern (2) is the part students explicitly asked for: notes that
 *  detect implicit definitions and quiz them back, even when the user
 *  didn't structure them as headings. */
export function extractCardCandidates(
  noteContent: string,
  headingLevel: number = DEFAULT_HEADING_LEVEL,
): CardCandidate[] {
  const doc = parseTipTapJson(noteContent)
  if (!doc?.content || !Array.isArray(doc.content)) return []

  const candidates: CardCandidate[] = []
  let position = 0

  // Pattern 1 — heading-bounded sections.
  let active: { front: string; body: string[]; position: number } | null = null
  const closeActive = () => {
    if (!active) return
    const front = active.front.trim()
    const back = active.body.join(' ').trim().replace(/\s{2,}/g, ' ')
    if (front && back) {
      candidates.push({
        cardKey: makeKey(front, active.position),
        front, back,
        position: active.position,
        source: 'heading',
      })
    }
    active = null
  }

  for (const node of doc.content) {
    const isHeading = node.type === 'heading'
    const level = typeof node.attrs?.level === 'number' ? node.attrs.level : undefined
    if (isHeading && level !== undefined && level <= headingLevel) {
      closeActive()
      if (level === headingLevel) {
        position++
        active = { front: plainText(node), body: [], position }
      }
    } else if (active) {
      active.body.push(plainText(node))
    } else {
      // Pattern 2 — definition extraction from free-floating paragraphs.
      // Only fires when not already inside a heading-bound card so we
      // don't double-emit content.
      if (node.type === 'paragraph') {
        const sentences = plainText(node).match(/[^.!?]+[.!?]/g) ?? [plainText(node)]
        for (const sentence of sentences) {
          const m = sentence.trim().match(/^(.{3,80}?)\s+(?:is|are|means|refers to|defined as)\s+(.{6,})$/i)
          if (m) {
            position++
            candidates.push({
              cardKey: makeKey(m[1].trim(), position),
              front: m[1].trim().replace(/^["'(]|["')]$/g, ''),
              back: m[2].trim().replace(/[.!?]+$/, ''),
              position,
              source: 'definition',
            })
          }
        }
      }
    }
  }
  closeActive()
  return candidates
}

/** Plain-text-ize a single TipTap node. Block-level nodes get a
 *  trailing space so adjacent words don't collide. */
function plainText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  const inner = plainText(node.content)
  const blockTypes = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'blockquote'])
  return blockTypes.has(node.type) ? inner + ' ' : inner
}

/** Stable key for de-duping against existing study items. Cheap djb2
 *  hash — no need to import crypto on the renderer side. */
function makeKey(front: string, position: number): string {
  const s = front.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + position
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff
  return ('00000000' + (h >>> 0).toString(16)).slice(-8)
}
