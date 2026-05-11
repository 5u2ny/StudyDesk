// Highlight mark — wraps selected text in a `<mark>` element with an
// associated captureId. Used in MaterialsReaderView to let users highlight
// text in reading notes and automatically create captures from selections.
//
// Attributes:
// - captureId: links the highlight to a specific Capture entry
// - color: optional highlight color (defaults to yellow)

import { Mark, mergeAttributes } from '@tiptap/core'

export interface HighlightMarkAttrs {
  captureId: string
  color?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlightMark: {
      setHighlightMark: (attrs: HighlightMarkAttrs) => ReturnType
      unsetHighlightMark: () => ReturnType
    }
  }
}

export const HighlightMark = Mark.create({
  name: 'highlightMark',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      captureId: {
        default: '',
        parseHTML: el => el.getAttribute('data-capture-id') ?? '',
        renderHTML: a => a.captureId ? { 'data-capture-id': a.captureId } : {},
      },
      color: {
        default: 'yellow',
        parseHTML: el => el.getAttribute('data-highlight-color') ?? 'yellow',
        renderHTML: a => ({ 'data-highlight-color': a.color || 'yellow' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark[data-capture-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-highlight-color'] || 'yellow'
    const style = `background-color: var(--sd-highlight-${color}, rgba(255, 230, 0, 0.25))`
    return ['mark', mergeAttributes(HTMLAttributes, { class: 'highlight-mark', style }), 0]
  },

  addCommands() {
    return {
      setHighlightMark: attrs => ({ commands }) => commands.setMark(this.name, attrs),
      unsetHighlightMark: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})
