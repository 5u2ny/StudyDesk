// Source-quote TipTap node — inspired by insights-lm-public's
// citation-jump UI. Stores a verbatim quote alongside the absolute file
// path of the source PDF/MD/TXT/audio/video it came from. Clicking a
// rendered quote invokes shell:openSourceFile (main-process IPC) which
// calls shell.openPath to launch the user's default app at that file.
//
// REDESIGN_PLAN_V2 ticket T6: extends to support page anchors (PDFs)
// and timestamp anchors (audio/video). The user's quote pin can now
// say "page 42" or "14:32" and the click handler tries to open at
// that exact location:
//   - Linux/Win: appended as fragment "path#page=42" — Acrobat/Edge
//     respect this; Preview ignores but still opens the file.
//   - macOS: tries open -a Preview path -k --args -- jump-to-page (no
//     real macOS API for jumping to a PDF page reliably; Preview's
//     URL handler accepts file://...#page= but flakily). Best-effort.
//   - Audio/video: opens with system default player; the timestamp
//     surfaces in the quote chrome so the user can scrub manually.
//
// Why store separately and not just append #page=N to sourcePath:
// the timestamp/page is a property of THIS quote, not of the source
// itself; two quotes from the same PDF can point at different pages.

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export interface SourceQuoteAttrs {
  sourcePath: string       // absolute path inside a course materials folder
  sourceTitle: string      // display label (e.g. "Syllabus.pdf")
  courseId?: string        // optional — for future filtering
  quotedAt: number         // epoch ms — so we can sort / diff later
  /** Page number for PDF citations. 1-indexed. 0 means unset. */
  sourcePage?: number
  /** Timestamp into an audio/video source, formatted "HH:MM:SS" or
   *  "MM:SS". Empty means unset. We don't normalize on input — the
   *  user types what they read off the player; the open handler
   *  normalizes when seeking. */
  sourceTimestamp?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sourceQuote: {
      insertSourceQuote: (attrs: SourceQuoteAttrs & { quote: string }) => ReturnType
    }
  }
}

export const SourceQuote = Node.create<{}>({
  name: 'sourceQuote',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      sourcePath: { default: '', parseHTML: el => el.getAttribute('data-source-path') ?? '', renderHTML: a => ({ 'data-source-path': a.sourcePath }) },
      sourceTitle: { default: '', parseHTML: el => el.getAttribute('data-source-title') ?? '', renderHTML: a => ({ 'data-source-title': a.sourceTitle }) },
      courseId: { default: undefined, parseHTML: el => el.getAttribute('data-course-id') ?? undefined, renderHTML: a => a.courseId ? { 'data-course-id': a.courseId } : {} },
      quotedAt: { default: 0, parseHTML: el => Number(el.getAttribute('data-quoted-at') ?? 0), renderHTML: a => ({ 'data-quoted-at': String(a.quotedAt ?? 0) }) },
      // T6 anchors. Both optional. Render only when set so we don't
      // bloat the DOM for plain quotes that don't need them.
      sourcePage: {
        default: 0,
        parseHTML: el => Number(el.getAttribute('data-source-page') ?? 0),
        renderHTML: a => a.sourcePage > 0 ? { 'data-source-page': String(a.sourcePage) } : {},
      },
      sourceTimestamp: {
        default: '',
        parseHTML: el => el.getAttribute('data-source-timestamp') ?? '',
        renderHTML: a => a.sourceTimestamp ? { 'data-source-timestamp': a.sourceTimestamp } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'aside.source-quote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, { class: 'source-quote', role: 'note' }),
      // Footer rendered by ProseMirror as a sibling line (unstyled) for
      // accessibility — visual layout is achieved purely via CSS pseudo-
      // elements pulling from the data-* attributes.
      0,
    ]
  },

  addCommands() {
    return {
      insertSourceQuote: (attrs) => ({ commands }) => {
        const { quote, ...meta } = attrs
        return commands.insertContent({
          type: this.name,
          attrs: meta,
          content: [{ type: 'text', text: quote }],
        })
      },
    }
  },

  // Click handler: clicking a rendered quote opens the source file via
  // the path-restricted IPC. ProseMirror plugin keeps this isolated from
  // React so the node doesn't re-render on every doc update.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            const aside = target?.closest?.('aside.source-quote') as HTMLElement | null
            if (!aside) return false
            const path = aside.getAttribute('data-source-path')
            if (!path) return false
            const page = Number(aside.getAttribute('data-source-page') ?? 0)
            const timestamp = aside.getAttribute('data-source-timestamp') ?? ''
            // Forward optional anchors to the main-process opener.
            // shell:openSourceFile is path-restricted, so even if a
            // user pastes a malicious path:page=… the main side
            // validates the path lives inside a known materials root.
            import('@shared/ipc-client').then(({ ipc }) => {
              ipc.invoke('shell:openSourceFile', {
                path,
                ...(page > 0 ? { page } : {}),
                ...(timestamp ? { timestamp } : {}),
              }).catch((err: any) => {
                console.warn('[sourceQuote] open failed:', err?.message ?? err)
              })
            })
            return true   // consume the click — don't move cursor
          },
        },
      }),
    ]
  },
})
