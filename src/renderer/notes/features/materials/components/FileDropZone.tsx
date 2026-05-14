// Drag-and-drop file ingestion for the workspace.
// Drops a PDF/DOCX/PPTX/TXT/MD file -> extracts content -> creates a Note with
// documentType: 'reading' linked to the active course. .docx and .md are
// parsed into rich TipTap JSON; .pdf and .txt fall back to plain text.

import React, { useCallback, useState } from 'react'
import { Upload, Loader2, FileText, AlertCircle } from 'lucide-react'
import { extractFileText } from '../../../lib/extractFileText'
import type { Note } from '@schema'
import { ipc } from '@shared/ipc-client'

interface Props {
  courseId?: string
  documentType?: Note['documentType']
  onCreated: (noteId: string) => void
  onWarning?: (message: string) => void
  onCreate: (input: { title: string; content: string; docJson?: unknown; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
}

function fileExtension(filename: string): string | undefined {
  const match = filename.match(/\.([a-z0-9]+)$/i)
  return match?.[1]?.toLowerCase()
}

export function FileDropZone({ courseId, documentType = 'reading', onCreated, onWarning, onCreate }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const result = await extractFileText(file)
      const trimmed = result.text.trim()
      if (!trimmed && !result.docJson) {
        throw new Error('No content could be extracted from this file.')
      }
      const noteId = await onCreate({
        title: result.title,
        content: trimmed,
        docJson: result.docJson,
        courseId,
        documentType,
      })
      let storageWarning: string | null = null
      if (courseId) {
        try {
          const bytes = await file.arrayBuffer()
          await ipc.invoke('materials:storeUploadedFile', {
            courseId,
            noteId,
            filename: file.name,
            mime: file.type || undefined,
            extension: fileExtension(file.name),
            materialCategory: documentType,
            bytes,
          })
        } catch (storageError) {
          const message = storageError instanceof Error
            ? storageError.message
            : 'Original file could not be stored.'
          storageWarning = `Imported extracted text, but StudyDesk could not preserve the original file: ${message}`
        }
      }
      onCreated(noteId)
      if (storageWarning) onWarning?.(storageWarning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import file.')
    } finally {
      setBusy(false)
    }
  }, [courseId, documentType, onCreate, onCreated, onWarning])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return (
    <div
      className={`file-drop-zone ${dragOver ? 'drag-over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="file-drop-icon">
        {busy ? <Loader2 size={20} className="spin" /> : <Upload size={20} />}
      </div>
      <div className="file-drop-body">
        <strong>{busy ? 'Extracting…' : 'Drop a PDF, DOCX, PPTX, MD, or TXT file'}</strong>
        <span>or click to browse. Text is extracted locally; no upload to a server.</span>
        {error && (
          <div className="file-drop-error"><AlertCircle size={12} /> {error}</div>
        )}
      </div>
      <label className="file-drop-button">
        <FileText size={14} /> Browse
        <input
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
          onChange={onPick}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  )
}
