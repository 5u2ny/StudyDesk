import React, { useEffect, useState } from 'react'
import { FileText, Folder, Upload } from 'lucide-react'
import type { Course, Note, StudyItem } from '@schema'
import { ipc } from '@shared/ipc-client'
import { cn } from '@shared/lib/utils'
import { QuizMeBackModal } from '../../components/QuizMeBackModal'
import { Spinner } from '../../components/Spinner'
import { FileDropZone } from './components/FileDropZone'
import { MaterialFileViewer } from './components/MaterialFileViewer'
import { inferMaterialKind, materialKindOptions, type MaterialKind } from './materialTypes'
import type { CardCandidate } from '../../lib/extractCards'

interface QuizQuestionDraft {
  question: string
  answer?: string
}

interface QuestionCandidate {
  cardKey: string
  front: string
  back?: string
  position: number
  source: 'question'
}

interface MaterialsViewProps {
  selectedCourse?: Course
  notes: Note[]
  studyItems: StudyItem[]
  focusedMaterialNoteId: string | null
  onCreateFromFile: (input: { title: string; content: string; docJson?: unknown; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
  onSelectNote: (n: Note) => void
  onRefresh: () => void
  onStatus: (msg: string) => void
  countMaterialUsages: (notes: Note[], materialPath: string) => number
  extractQuestionDraftsFromText: (text: string) => QuizQuestionDraft[]
  makeQuestionCandidateKey: (front: string, position: number) => string
  noteText: (content: string) => string
}

function MaterialsEmpty({ text }: { text: string }) {
  return <div className="course-calendar-empty">{text}</div>
}

export function MaterialsView({
  selectedCourse,
  notes,
  studyItems,
  focusedMaterialNoteId,
  onCreateFromFile,
  onSelectNote,
  onRefresh,
  onStatus,
  countMaterialUsages,
  extractQuestionDraftsFromText,
  makeQuestionCandidateKey,
  noteText,
}: MaterialsViewProps) {
  const [pickingFolder, setPickingFolder] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [materialFilter, setMaterialFilter] = useState<MaterialKind | 'all'>('all')
  const [showFlashcardReview, setShowFlashcardReview] = useState(false)
  const [flashcardCandidates, setFlashcardCandidates] = useState<ReadonlyArray<CardCandidate>>([])
  const [flashcardSourceNote, setFlashcardSourceNote] = useState<Note | null>(null)
  const [showQuestionReview, setShowQuestionReview] = useState(false)
  const [questionCandidates, setQuestionCandidates] = useState<ReadonlyArray<QuestionCandidate>>([])
  const [questionSourceNote, setQuestionSourceNote] = useState<Note | null>(null)
  useEffect(() => {
    if (focusedMaterialNoteId) setSelectedMaterialId(focusedMaterialNoteId)
  }, [focusedMaterialNoteId])
  if (!selectedCourse) {
    return (
      <section className="phase3-card">
        <header className="phase3-header">
          <div>
            <p className="phase3-eyebrow">Materials</p>
            <h1>Pick a course</h1>
            <span>Materials are organized per-course. Select one in the rail to manage its folder and imports.</span>
          </div>
        </header>
      </section>
    )
  }
  const imported = (selectedCourse.materialsImportedFiles ?? []).filter(r => r.noteId)
  const importedNoteIds = new Set(imported.map(r => r.noteId).filter(Boolean))
  const importedByNoteId = new Map(imported.map(r => [r.noteId, r]))
  const directUploadImports = imported.filter(r => r.sourceKind === 'direct_upload').length
  const watchedFolderImports = imported.filter(r => r.sourceKind !== 'direct_upload').length
  const materialNotes = notes
    .filter(n =>
      n.courseId === selectedCourse.id &&
      (n.documentType === 'reading' || n.documentType === 'assignment_prompt' || n.documentType === 'syllabus')
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const manualMaterials = materialNotes.filter(n => !importedNoteIds.has(n.id))
  const materialCards = materialNotes.map(note => {
    const record = importedByNoteId.get(note.id)
    const sourcePath = record?.storedPath ?? record?.path
    const label = record?.originalFilename ?? sourcePath?.split('/').pop() ?? note.title
    const usage = sourcePath ? countMaterialUsages(notes, sourcePath) : 0
    const kind = inferMaterialKind(label, note.documentType)
    const sourceLabel = record?.sourceKind === 'direct_upload'
      ? 'Direct upload'
      : record
        ? 'Watched folder'
        : 'Extracted text'
    return { note, record, sourcePath, sourceLabel, label, usage, kind }
  })
  const visibleMaterials = materialFilter === 'all'
    ? materialCards
    : materialCards.filter(item => item.kind.kind === materialFilter)
  const selectedMaterial = materialCards.find(item => item.note.id === selectedMaterialId)
    ?? visibleMaterials[0]
    ?? materialCards[0]
  const materialCounts = materialKindOptions.map(option => ({
    ...option,
    count: materialCards.filter(item => item.kind.kind === option.kind).length,
  }))
  const uploadRegionId = `materials-upload-${selectedCourse.id}`
  async function openMaterialFlashcards(note: Note) {
    const { extractCardCandidates } = await import('../../lib/extractCards')
    const candidates = extractCardCandidates(note.content)
    setFlashcardSourceNote(note)
    setFlashcardCandidates(candidates)
    setShowFlashcardReview(true)
  }

  function openMaterialQuiz(note: Note) {
    const questions = extractQuestionDraftsFromText(noteText(note.content))
    const candidates = questions.map((draft, index) => ({
      cardKey: makeQuestionCandidateKey(draft.question, index + 1),
      front: draft.question,
      back: draft.answer,
      position: index + 1,
      source: 'question' as const,
    }))
    setQuestionSourceNote(note)
    setQuestionCandidates(candidates)
    setShowQuestionReview(true)
  }

  const uploadDropZone = (
    <div id={uploadRegionId}>
      <FileDropZone
        courseId={selectedCourse.id}
        documentType="reading"
        onCreate={onCreateFromFile}
        onCreated={(noteId) => {
          setSelectedMaterialId(noteId)
          onRefresh()
          onStatus('Material added to this course.')
        }}
        onWarning={onStatus}
      />
    </div>
  )
  return (
    <section className="phase3-card materials-library-view">
      <header className="phase3-header materials-page-header">
        <div>
          <p className="phase3-eyebrow">Materials</p>
          <h1>{selectedCourse.code ?? selectedCourse.name}</h1>
          <span>
            {materialNotes.length === 0
              ? 'No course materials yet — upload a file or pick a watched folder.'
              : `${materialNotes.length} source material${materialNotes.length === 1 ? '' : 's'} available for study tools.`}
          </span>
        </div>
        <div className="phase3-actions materials-header-actions">
          <button
            className="outline-button"
            onClick={() => {
              const uploadLabel = document.getElementById(uploadRegionId)?.querySelector('label')
              if (uploadLabel instanceof HTMLElement) uploadLabel.click()
            }}
          ><Upload size={15} /> Upload files</button>
          <button
            className="outline-button"
            disabled={pickingFolder}
            onClick={async () => {
              setPickingFolder(true)
              try {
                await ipc.invoke('course:pickMaterialsFolder', { courseId: selectedCourse.id })
                onRefresh()
                onStatus('Materials folder linked.')
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                onStatus(`Could not link folder: ${msg}`)
              } finally {
                setPickingFolder(false)
              }
            }}
          >{pickingFolder ? <Spinner size={15} /> : <Folder size={15} />} Pick folder</button>
        </div>
      </header>
      <div className="materials-workspace-body">
        {materialNotes.length === 0 ? (
          <div className="materials-empty-state">
            {uploadDropZone}
            <p>Upload readings, cases, assignment prompts, slides, study guides, and supporting files. They stay local and become course source material for flashcards and quizzes.</p>
          </div>
        ) : (
          <div className="materials-library-grid">
            <section className="materials-library-panel">
              <div className="materials-library-toolbar">
                <div>
                  <div className="materials-library-eyebrow">Course library</div>
                  <span>{materialCards.length} source material{materialCards.length === 1 ? '' : 's'}</span>
                </div>
                <button
                  className="materials-library-edit"
                  disabled={!selectedMaterial}
                  onClick={() => selectedMaterial && onSelectNote(selectedMaterial.note)}
                >
                  Edit note
                </button>
              </div>
              <div className="materials-hidden-upload" aria-hidden="true">
                {uploadDropZone}
              </div>
              <div className="materials-library-filters" role="tablist" aria-label="Material type filter">
                <button
                  className={cn(materialFilter === 'all' && 'active')}
                  onClick={() => setMaterialFilter('all')}
                  role="tab"
                  aria-selected={materialFilter === 'all'}
                >
                  All <span>{materialCards.length}</span>
                </button>
                {materialCounts.map(option => (
                  <button
                    key={option.kind}
                    className={cn(materialFilter === option.kind && 'active')}
                    onClick={() => setMaterialFilter(option.kind)}
                    role="tab"
                    aria-selected={materialFilter === option.kind}
                  >
                    {option.label} <span>{option.count}</span>
                  </button>
                ))}
              </div>
              <div className="materials-library-list">
                {visibleMaterials.length === 0 ? (
                  <MaterialsEmpty text={`No ${materialKindOptions.find(option => option.kind === materialFilter)?.label.toLowerCase() ?? 'materials'} attached yet.`} />
                ) : visibleMaterials.map(item => (
                  <button
                    key={item.note.id}
                    onClick={() => setSelectedMaterialId(item.note.id)}
                    className={cn('materials-library-item', selectedMaterial?.note.id === item.note.id && 'active')}
                    title={item.sourceLabel}
                  >
                    <FileText size={13} />
                    <span>
                      <strong>{item.label}</strong>
                      <em>
                        {item.kind.label}
                        {' · '}
                        {item.sourceLabel}
                        {' · '}
                        Updated {new Date(item.note.updatedAt).toLocaleDateString()}
                      </em>
                    </span>
                    {item.usage > 0 && <small>{item.usage}× cited</small>}
                  </button>
                ))}
              </div>
            </section>

            <section className="materials-reader-panel">
              {selectedMaterial ? (
                <MaterialFileViewer
                  note={selectedMaterial.note}
                  course={selectedCourse}
                  filename={selectedMaterial.label}
                  materialType={selectedMaterial.kind.label}
                  sourcePath={selectedMaterial.sourcePath}
                  sourceLabel={selectedMaterial.sourceLabel}
                  onCaptureCreated={() => {
                    onRefresh()
                    onStatus('Highlight saved as a source-linked capture.')
                  }}
                  onExtractFlashcards={() => void openMaterialFlashcards(selectedMaterial.note)}
                  onExtractQuiz={() => openMaterialQuiz(selectedMaterial.note)}
                />
              ) : (
                <MaterialsEmpty text="Select a material to read it here." />
              )}
            </section>
          </div>
        )}

        {(manualMaterials.length > 0 || directUploadImports > 0) && watchedFolderImports > 0 && (
          <div className="materials-library-footnote">
            {manualMaterials.length + directUploadImports} direct upload{manualMaterials.length + directUploadImports === 1 ? '' : 's'} and {watchedFolderImports} watched-folder import{watchedFolderImports === 1 ? '' : 's'} are grouped together as course materials.
          </div>
        )}
      </div>
      <QuizMeBackModal
        open={showFlashcardReview}
        onClose={() => setShowFlashcardReview(false)}
        candidates={flashcardCandidates}
        existingFronts={studyItems.map(s => s.front ?? '')}
        onCommit={async (kept) => {
          const sourceNote = flashcardSourceNote
          if (!sourceNote) return
          let created = 0
          try {
            for (const candidate of kept) {
              await ipc.invoke('study:create', {
                courseId: sourceNote.courseId ?? selectedCourse.id,
                sourceNoteId: sourceNote.id,
                sourceCardKey: candidate.cardKey,
                type: 'flashcard',
                front: candidate.front,
                back: candidate.back,
              })
              created++
            }
            onStatus(`${created} source-linked card${created === 1 ? '' : 's'} added from "${sourceNote.title || 'material'}".`)
            onRefresh()
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            onStatus(`Saved ${created}/${kept.length} card${created === 1 ? '' : 's'} before failing: ${msg}`)
          }
        }}
      />
      <QuizMeBackModal
        open={showQuestionReview}
        onClose={() => setShowQuestionReview(false)}
        candidates={questionCandidates}
        existingFronts={studyItems.filter(s => s.type === 'question').map(s => s.front ?? '')}
        mode="questions"
        onCommit={async (kept) => {
          const sourceNote = questionSourceNote
          if (!sourceNote) return
          let created = 0
          try {
            for (const candidate of kept) {
              await ipc.invoke('study:create', {
                courseId: sourceNote.courseId ?? selectedCourse.id,
                sourceNoteId: sourceNote.id,
                sourceCardKey: candidate.cardKey,
                type: 'question',
                front: candidate.front,
                back: candidate.back,
              })
              created++
            }
            const skipped = Math.max(0, questionCandidates.length - created)
            onStatus(`${created} source-linked question${created === 1 ? '' : 's'} added from "${sourceNote.title || 'material'}"${skipped > 0 ? ` (${skipped} skipped)` : ''}.`)
            onRefresh()
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            onStatus(`Saved ${created}/${kept.length} question${created === 1 ? '' : 's'} before failing: ${msg}`)
          }
        }}
      />
    </section>
  )
}
