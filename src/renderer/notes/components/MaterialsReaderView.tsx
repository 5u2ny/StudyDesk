// MaterialsReaderView — read-only TipTap editor for reading notes (imported
// course materials). Allows highlighting text to create captures that link
// back to the reading note. Toolbar provides highlight + "Open source" actions.

import React, { useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Highlighter, ExternalLink, BookOpen } from 'lucide-react'
import type { Note } from '@schema'
import { HighlightMark } from '../editor/highlightMark'
import { SourceQuote } from '../editor/sourceQuoteNode'
import { ipc } from '@shared/ipc-client'
import { parseContent } from '../parseContent'

export interface MaterialsReaderViewProps {
  note: Note
  onCaptureCreated?: () => void
}

export function MaterialsReaderView({ note, onCaptureCreated }: MaterialsReaderViewProps) {
  const content = useMemo(() => parseContent(note.content), [note.content])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      HighlightMark,
      SourceQuote,
    ],
    content,
    editable: false,
  }, [note.id])

  const handleHighlight = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return // nothing selected

    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    if (!selectedText.trim()) return

    // Create a capture from the selection
    const capture = await ipc.invoke<{ id: string }>('capture:save', {
      text: selectedText,
      source: 'highlight' as const,
      courseId: note.courseId,
    })

    // Apply highlight mark to the selection (temporarily make editable)
    editor.setEditable(true)
    editor.chain()
      .focus()
      .setTextSelection({ from, to })
      .setHighlightMark({ captureId: capture.id, color: 'yellow' })
      .run()
    editor.setEditable(false)

    // Save the updated content back to the note
    const updatedContent = JSON.stringify(editor.getJSON())
    await ipc.invoke('notes:update', {
      id: note.id,
      patch: {
        content: updatedContent,
        capturedFromIds: [...(note.capturedFromIds || []), capture.id],
      },
    })

    onCaptureCreated?.()
  }, [editor, note, onCaptureCreated])

  const handleOpenSource = useCallback(async () => {
    // Try to find original file path from note metadata
    // Reading notes store source info in sourceQuote attrs or note metadata
    try {
      const content = JSON.parse(note.content)
      const sourceNode = content?.content?.find((n: any) =>
        n.type === 'sourceQuote' && n.attrs?.filePath
      )
      if (sourceNode?.attrs?.filePath) {
        await ipc.invoke('shell:openSourceFile', { path: sourceNode.attrs.filePath })
      }
    } catch (e) { console.warn('[MaterialsReader] Could not open source file:', e) }
  }, [note])

  if (!editor) return null

  return (
    <section className="materials-reader-view">
      <header className="materials-reader-header">
        <div className="materials-reader-header-left">
          <BookOpen size={14} className="materials-reader-icon" />
          <h2 className="materials-reader-title">{note.title || 'Reading'}</h2>
        </div>
        <div className="materials-reader-toolbar">
          <button
            className="materials-reader-btn"
            onClick={handleHighlight}
            title="Highlight selection and create capture"
          >
            <Highlighter size={14} />
            <span>Highlight</span>
          </button>
          <button
            className="materials-reader-btn"
            onClick={handleOpenSource}
            title="Open original source file"
          >
            <ExternalLink size={14} />
            <span>Open source</span>
          </button>
        </div>
      </header>

      <div className="materials-reader-content">
        <EditorContent editor={editor} />
      </div>
    </section>
  )
}
