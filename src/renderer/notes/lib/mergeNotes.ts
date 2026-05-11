// mergeNotes — combines multiple notes into a single TipTap JSON document.
// Strategy: insert an H1 divider with each note's title, then its content array.
// Deduplicates identical paragraphs (exact text match).

import type { Note } from '@schema'

interface TipTapDoc {
  type: 'doc'
  content: any[]
}

/**
 * Merge N notes into a single TipTap JSON string.
 * Each note gets a heading separator, then its content.
 * Duplicate paragraphs (exact text match) are removed.
 */
export function mergeNoteContents(notes: Note[]): string {
  if (notes.length === 0) return JSON.stringify({ type: 'doc', content: [] })

  const seen = new Set<string>()
  const merged: any[] = []

  for (const note of notes) {
    // Add title heading as separator
    merged.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: note.title || 'Untitled' }],
    })

    // Parse content
    let doc: TipTapDoc
    try {
      doc = JSON.parse(note.content)
    } catch {
      doc = { type: 'doc', content: [] }
    }

    if (!doc.content) continue

    for (const node of doc.content) {
      // Deduplicate: extract text fingerprint for paragraph nodes
      if (node.type === 'paragraph' && node.content) {
        const text = extractText(node)
        if (text && seen.has(text)) continue
        if (text) seen.add(text)
      }
      merged.push(node)
    }
  }

  return JSON.stringify({ type: 'doc', content: merged })
}

/** Extract plain text from a TipTap node for deduplication. */
function extractText(node: any): string {
  if (!node) return ''
  if (node.text) return node.text
  if (node.content) return node.content.map(extractText).join('')
  return ''
}
