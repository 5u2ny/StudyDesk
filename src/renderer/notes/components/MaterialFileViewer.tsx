import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Eye, FileText, Presentation } from 'lucide-react'
import type { Course, Note } from '@schema'
import { ipc } from '@shared/ipc-client'
import { MaterialsReaderView } from './MaterialsReaderView'
import { loadPdfjs } from '../lib/pdfjs'

interface MaterialFileViewerProps {
  note: Note
  course?: Course
  filename: string
  materialType: string
  sourcePath?: string
  sourceLabel?: string
  onCaptureCreated?: () => void
}

type PdfLoadStatus = 'idle' | 'loading' | 'ready' | 'error'
type FilePreviewKind = 'pdf' | 'docx' | 'pptx' | 'image' | 'text' | 'unsupported'

function getFileExtension(filename: string, sourcePath?: string): string {
  const value = sourcePath || filename
  const match = value.match(/\.([a-z0-9]+)$/i)
  return match?.[1]?.toLowerCase() ?? ''
}

function getPreviewKind(extension: string): FilePreviewKind {
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  if (extension === 'pptx') return 'pptx'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)) return 'image'
  if (['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) return 'text'
  return 'unsupported'
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return new Uint8Array((value as { data: number[] }).data)
  }
  throw new Error('Could not read PDF bytes from the source file.')
}

function PdfPreview({
  sourcePath,
  filename,
  onOpenSource,
}: {
  sourcePath: string
  filename: string
  onOpenSource: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [status, setStatus] = useState<PdfLoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const pageCount = pdfDoc?.numPages ?? 0

  useEffect(() => {
    let cancelled = false
    let loadedDoc: any = null
    let loadingTask: any = null

    setStatus('loading')
    setError(null)
    setPdfDoc(null)
    setPageNumber(1)

    async function loadDocument() {
      try {
        const bytes = await ipc.invoke<ArrayBuffer>('folder:readFile', { path: sourcePath })
        if (cancelled) return
        const pdfjs = await loadPdfjs()
        if (cancelled) return
        loadingTask = pdfjs.getDocument({ data: toUint8Array(bytes) })
        loadedDoc = await loadingTask.promise
        if (cancelled) return
        setPdfDoc(loadedDoc)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }

    void loadDocument()

    return () => {
      cancelled = true
      try { loadingTask?.destroy?.() } catch {}
      try { loadedDoc?.destroy?.() } catch {}
    }
  }, [sourcePath])

  useEffect(() => {
    if (!pdfDoc || status !== 'ready') return
    let cancelled = false
    let renderTask: any = null

    async function renderPage() {
      try {
        const canvas = canvasRef.current
        if (!canvas) return
        const page = await pdfDoc.getPage(pageNumber)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const maxWidth = 760
        const scale = Math.min(1.4, Math.max(0.72, maxWidth / baseViewport.width))
        const viewport = page.getViewport({ scale })
        const pixelRatio = window.devicePixelRatio || 1
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas rendering is unavailable.')

        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        context.clearRect(0, 0, viewport.width, viewport.height)
        renderTask = page.render({ canvasContext: context, viewport })
        await renderTask.promise
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      try { renderTask?.cancel?.() } catch {}
    }
  }, [pageNumber, pdfDoc, status])

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="pdf-preview-state">
        <div className="material-file-preview-icon"><Eye size={22} /></div>
        <h3>Loading PDF preview</h3>
        <p>{filename}</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="pdf-preview-state error">
        <div className="material-file-preview-icon"><AlertCircle size={22} /></div>
        <h3>Could not render PDF preview</h3>
        <p>{error ?? 'The PDF could not be rendered inside StudyDesk.'}</p>
        <button className="material-file-primary-action" onClick={onOpenSource}>
          <ExternalLink size={14} />
          <span>Open in system viewer</span>
        </button>
      </div>
    )
  }

  return (
    <div className="pdf-preview-view">
      <div className="pdf-preview-toolbar">
        <button
          onClick={() => setPageNumber(value => Math.max(1, value - 1))}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>
        <span>Page {pageNumber} of {pageCount}</span>
        <button
          onClick={() => setPageNumber(value => Math.min(pageCount, value + 1))}
          disabled={pageNumber >= pageCount}
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="pdf-preview-canvas-wrap">
        <canvas ref={canvasRef} aria-label={`Preview of ${filename}, page ${pageNumber}`} />
      </div>
    </div>
  )
}

function FilePreviewFallback({
  icon,
  title,
  body,
  canOpenSource,
  onOpenSource,
}: {
  icon: React.ReactNode
  title: string
  body: string
  canOpenSource: boolean
  onOpenSource: () => void
}) {
  return (
    <div className="material-file-preview-state">
      <div className="material-file-preview-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {canOpenSource && (
        <button className="material-file-primary-action" onClick={onOpenSource}>
          <ExternalLink size={14} />
          <span>Open in system viewer</span>
        </button>
      )}
    </div>
  )
}

export function MaterialFileViewer({
  note,
  course,
  filename,
  materialType,
  sourcePath,
  sourceLabel,
  onCaptureCreated,
}: MaterialFileViewerProps) {
  const hasSourcePath = Boolean(sourcePath)
  const extension = useMemo(() => getFileExtension(filename, sourcePath), [filename, sourcePath])
  const previewKind = useMemo(() => getPreviewKind(extension), [extension])
  const extensionLabel = extension ? extension.toUpperCase() : 'Unknown'

  const handleOpenSource = useCallback(async () => {
    if (!sourcePath) return
    try {
      await ipc.invoke('shell:openSourceFile', { path: sourcePath })
    } catch (err) {
      console.warn('[MaterialFileViewer] Could not open source file:', err)
    }
  }, [sourcePath])

  const preview = (() => {
    if (!hasSourcePath) {
      return (
        <FilePreviewFallback
          icon={<FileText size={22} />}
          title="Original file not recorded"
          body="This material was added from extracted text, so StudyDesk does not have the original file to preview. Open the source note to work with the extracted text."
          canOpenSource={false}
          onOpenSource={handleOpenSource}
        />
      )
    }

    if (previewKind === 'pdf' && sourcePath) {
      return (
        <PdfPreview
          sourcePath={sourcePath}
          filename={filename || note.title || 'Course material'}
          onOpenSource={handleOpenSource}
        />
      )
    }

    if (previewKind === 'docx') {
      return (
        <FilePreviewFallback
          icon={<FileText size={22} />}
          title="DOCX preview is next"
          body="This viewer is ready for a local DOCX HTML preview path. The next patch can wire mammoth without treating Word files as extracted text forever."
          canOpenSource
          onOpenSource={handleOpenSource}
        />
      )
    }

    if (previewKind === 'pptx') {
      return (
        <FilePreviewFallback
          icon={<Presentation size={22} />}
          title="PPTX visual preview needs a dedicated renderer"
          body="StudyDesk keeps the slide deck as a first-class material. For now, open it in the system viewer; visual slide rendering should be approved before adding heavier dependencies."
          canOpenSource
          onOpenSource={handleOpenSource}
        />
      )
    }

    if (previewKind === 'image' && sourcePath) {
      return (
        <div className="material-image-preview">
          <img src={`file://${encodeURI(sourcePath)}`} alt={`Preview of ${filename || note.title || 'course material'}`} />
        </div>
      )
    }

    if (previewKind === 'text') {
      return (
        <div className="material-text-preview">
          <MaterialsReaderView
            note={note}
            sourcePath={sourcePath}
            embedded
            onCaptureCreated={onCaptureCreated}
          />
        </div>
      )
    }

    return (
      <FilePreviewFallback
        icon={<AlertCircle size={22} />}
        title="Preview is not available for this file type"
        body="StudyDesk keeps this file attached to the course and can open the original with your system viewer."
        canOpenSource
        onOpenSource={handleOpenSource}
      />
    )
  })()

  return (
    <section className="material-file-viewer">
      <header className="material-file-viewer-header">
        <div className="material-file-viewer-header-top">
          <div className="material-file-viewer-titleblock">
            <div className="material-file-viewer-kicker">
              <FileText size={13} />
              <span>{materialType}</span>
            </div>
            <h2>{filename || note.title || 'Course material'}</h2>
            <div className="material-file-viewer-meta">
              {course && <span>{course.code ?? course.name}</span>}
              <span>{extensionLabel}</span>
              <span>{sourceLabel ?? (hasSourcePath ? 'Source-backed material' : 'Direct upload')}</span>
            </div>
          </div>
        </div>

        <div className="material-file-viewer-actions" aria-label="Material viewer actions">
          <span className="material-file-primary-label">
            <Eye size={14} />
            Preview
          </span>
          <button
            className="material-file-open-source"
            onClick={handleOpenSource}
            disabled={!hasSourcePath}
            aria-label="Open in system viewer"
            title={hasSourcePath ? 'Open original file in the system viewer' : 'Original file not recorded'}
          >
            <ExternalLink size={14} />
            <span>System viewer</span>
          </button>
        </div>
      </header>

      <div className="material-file-preview-shell">
        {preview}
      </div>
    </section>
  )
}
