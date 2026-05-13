// AddCourseModal — course onboarding flow.
// Step 1: collect optional course hints.
// Step 2: import syllabus from PDF/text, review parser output, then confirm.

import React, { useState, useCallback } from 'react'
import { X, ChevronRight, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { ScanSyllabusDropZone } from './ScanSyllabusDropZone'
import { ipc } from '../../shared/ipc-client'
import type { Course } from '@schema'

export interface AddCourseModalProps {
  onClose: () => void
  onCourseCreated: (course: Course) => void
  onOpenMaterials?: (courseId: string) => void
  onStatus?: (msg: string) => void
}

type Step = 'details' | 'syllabus' | 'review' | 'materials'
const MIN_EXTRACTED_PDF_CHARS = 120

interface SyllabusDeadlineReview {
  title: string
  deadlineAt: number
  type: string
  included: boolean
}

interface SyllabusAssignmentReview {
  title: string
  dueDate?: number
  weight?: string
  type: string
  included: boolean
}

interface SyllabusSetupReview {
  title: string
  category: string
  included: boolean
}

interface SyllabusParseReview {
  course: {
    name?: string
    code?: string
    professorName?: string
    professorEmail?: string
    term?: string
    officeHours?: string
    location?: string
  }
  classMeetings: Array<{ days: string[]; startTime: string; endTime: string; location?: string }>
  assignments: SyllabusAssignmentReview[]
  deadlines: SyllabusDeadlineReview[]
  setupTasks: SyllabusSetupReview[]
  readings: Array<{ title: string; chapter?: string }>
  scheduleRowCount: number
}

interface SyllabusConfirmResult {
  courseId?: string
  syllabusNoteId?: string
  counts?: { deadlines: number; assignments: number; setupAlerts: number }
}

export function AddCourseModal({ onClose, onCourseCreated, onOpenMaterials, onStatus }: AddCourseModalProps) {
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [professor, setProfessor] = useState('')
  const [syllabusText, setSyllabusText] = useState('')
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfMessage, setPdfMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [showOcrFallback, setShowOcrFallback] = useState(false)
  const [review, setReview] = useState<SyllabusParseReview | null>(null)
  const [confirmResult, setConfirmResult] = useState<SyllabusConfirmResult | null>(null)
  const [createdCourse, setCreatedCourse] = useState<Course | null>(null)

  const canContinue = name.trim().length > 0
  const parseText = syllabusText.trim()

  const handleContinue = useCallback(() => {
    if (!canContinue) return
    setStep('syllabus')
  }, [canContinue])

  const parseSyllabusText = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    setWorkflowError(null)
    try {
      const result = await ipc.invoke<{
        course?: SyllabusParseReview['course']
        classMeetings?: SyllabusParseReview['classMeetings']
        assignments?: Array<{ title: string; dueDate?: number; weight?: string; type: string }>
        deadlines?: Array<{ title: string; deadlineAt: number; type: string }>
        readings?: Array<{ title: string; chapter?: string }>
        setupTasks?: Array<{ title: string; category: string }>
        scheduleRows?: unknown[]
      }>('syllabus:parse', { text: trimmed })

      setReview({
        course: {
          code: code.trim() || result?.course?.code || '',
          name: result?.course?.name || name.trim(),
          professorName: result?.course?.professorName || professor.trim(),
          professorEmail: result?.course?.professorEmail,
          term: result?.course?.term,
          officeHours: result?.course?.officeHours,
          location: result?.course?.location,
        },
        classMeetings: result?.classMeetings ?? [],
        assignments: (result?.assignments ?? []).map(item => ({ ...item, included: true })),
        deadlines: (result?.deadlines ?? []).map(item => ({
          title: item.title,
          deadlineAt: item.deadlineAt,
          type: item.type,
          included: true,
        })),
        setupTasks: (result?.setupTasks ?? []).map(item => ({ ...item, included: true })),
        readings: result?.readings ?? [],
        scheduleRowCount: result?.scheduleRows?.length ?? 0,
      })
      setConfirmResult(null)
      setStep('review')
      onStatus?.('Syllabus parsed. Review extracted course setup before confirming.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setWorkflowError(`Parse failed: ${message}`)
      onStatus?.(`Parse failed: ${message}`)
    } finally {
      setBusy(false)
    }
  }, [code, name, professor, onStatus])

  const handlePdfImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setPdfMessage({ type: 'error', text: `Use a PDF file: ${file.name}` })
      return
    }
    setPdfBusy(true)
    setPdfMessage(null)
    setWorkflowError(null)
    try {
      const { extractFileText } = await import('../lib/extractFileText')
      const result = await extractFileText(file)
      const extracted = result.text.trim()
      if (extracted.length < MIN_EXTRACTED_PDF_CHARS) {
        setShowOcrFallback(true)
        setPdfMessage({
          type: 'error',
          text: `"${file.name}" has very little embedded text. It may be scanned; use the image OCR fallback only if needed.`,
        })
        return
      }

      const nextText = parseText ? `${parseText}\n\n${extracted}` : extracted
      const pageCount = result.pageCount ?? 1
      setSyllabusText(nextText)
      setPdfMessage({
        type: 'success',
        text: `Extracted ${pageCount} PDF page${pageCount === 1 ? '' : 's'} locally. Parsing syllabus...`,
      })
      await parseSyllabusText(nextText)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setPdfMessage({ type: 'error', text: `PDF import failed: ${message}` })
    } finally {
      setPdfBusy(false)
    }
  }, [parseSyllabusText, parseText])

  const handleParseClick = useCallback(() => {
    void parseSyllabusText(parseText)
  }, [parseSyllabusText, parseText])

  const handleSkipSyllabus = useCallback(async () => {
    if (!canContinue) return
    setBusy(true)
    try {
      const course = await ipc.invoke<Course>('course:create', {
        name: name.trim(),
        code: code.trim() || undefined,
        professorName: professor.trim() || undefined,
      })
      onCourseCreated(course)
      onStatus?.(`Course "${course.name}" created`)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setWorkflowError(`Course creation failed: ${message}`)
      onStatus?.(`Course creation failed: ${message}`)
    } finally {
      setBusy(false)
    }
  }, [canContinue, code, name, onClose, onCourseCreated, onStatus, professor])

  const handleConfirmImport = useCallback(async () => {
    if (!review || !parseText) return
    setBusy(true)
    setWorkflowError(null)
    try {
      const coursePayload = {
        name: review.course.name?.trim() || name.trim(),
        code: review.course.code?.trim() || code.trim() || undefined,
        professorName: review.course.professorName?.trim() || professor.trim() || undefined,
        professorEmail: review.course.professorEmail?.trim() || undefined,
        officeHours: review.course.officeHours?.trim() || undefined,
        location: review.course.location?.trim() || undefined,
        term: review.course.term?.trim() || undefined,
      }
      const result = await ipc.invoke<SyllabusConfirmResult>('syllabus:confirmImport', {
        course: coursePayload,
        sourceText: parseText,
        assignments: review.assignments.filter(item => item.included).map(item => ({
          title: item.title,
          dueDate: item.dueDate,
          confirmed: true,
        })),
        deadlines: review.deadlines.filter(item => item.included).map(item => ({
          title: item.title,
          deadlineAt: item.deadlineAt,
          type: item.type,
          confirmed: true,
          sourceType: 'syllabus',
        })),
        setupTasks: review.setupTasks.filter(item => item.included).map(item => ({
          title: item.title,
          category: item.category,
          confirmed: true,
        })),
      })
      setConfirmResult(result)
      let course: Course | null = null
      if (result?.courseId) {
        const courses = await ipc.invoke<Course[]>('course:list', {})
        course = courses.find(item => item.id === result.courseId) ?? null
      }
      if (course) {
        setCreatedCourse(course)
        onCourseCreated(course)
      }
      const counts = result?.counts ?? { assignments: 0, deadlines: 0, setupAlerts: 0 }
      onStatus?.(`Course setup complete: ${counts.assignments} assignment(s), ${counts.deadlines} deadline(s), ${counts.setupAlerts} setup task(s).`)
      setStep('materials')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setWorkflowError(`Import failed: ${message}`)
      onStatus?.(`Import failed: ${message}`)
    } finally {
      setBusy(false)
    }
  }, [code, name, onCourseCreated, onStatus, parseText, professor, review])

  function updateCourse(field: keyof SyllabusParseReview['course'], value: string) {
    if (!review) return
    setReview({ ...review, course: { ...review.course, [field]: value } })
  }

  function toggleAssignment(index: number) {
    if (!review) return
    const assignments = [...review.assignments]
    assignments[index] = { ...assignments[index], included: !assignments[index].included }
    setReview({ ...review, assignments })
  }

  function editAssignment(index: number, field: keyof SyllabusAssignmentReview, value: string | number) {
    if (!review) return
    const assignments = [...review.assignments]
    assignments[index] = { ...assignments[index], [field]: value }
    setReview({ ...review, assignments })
  }

  function toggleDeadline(index: number) {
    if (!review) return
    const deadlines = [...review.deadlines]
    deadlines[index] = { ...deadlines[index], included: !deadlines[index].included }
    setReview({ ...review, deadlines })
  }

  function editDeadline(index: number, field: keyof SyllabusDeadlineReview, value: string | number) {
    if (!review) return
    const deadlines = [...review.deadlines]
    deadlines[index] = { ...deadlines[index], [field]: value }
    setReview({ ...review, deadlines })
  }

  function toggleSetup(index: number) {
    if (!review) return
    const setupTasks = [...review.setupTasks]
    setupTasks[index] = { ...setupTasks[index], included: !setupTasks[index].included }
    setReview({ ...review, setupTasks })
  }

  function editSetup(index: number, field: keyof SyllabusSetupReview, value: string) {
    if (!review) return
    const setupTasks = [...review.setupTasks]
    setupTasks[index] = { ...setupTasks[index], [field]: value }
    setReview({ ...review, setupTasks })
  }

  const title = step === 'details'
    ? 'Add a new course'
    : step === 'materials'
      ? 'Course setup complete'
      : 'Import syllabus'

  return (
    <div className="add-course-overlay" onClick={onClose}>
      <div
        className={`add-course-modal ${step === 'review' || step === 'materials' ? 'add-course-modal-wide' : ''}`}
        onClick={event => event.stopPropagation()}
      >
        <header className="add-course-modal-head">
          <div>
            <p className="add-course-step-label">
              {step === 'details' ? 'Step 1 of 2' : step === 'materials' ? 'Next step' : 'Step 2 of 2'}
            </p>
            <h2 className="add-course-modal-title">{title}</h2>
          </div>
          <button className="add-course-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        {workflowError && (
          <div className="add-course-error" role="alert">
            <AlertCircle size={14} />
            <span>{workflowError}</span>
            <button onClick={() => setWorkflowError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {step === 'details' && (
          <div className="add-course-body">
            <label className="add-course-field">
              <span className="add-course-label">Course name *</span>
              <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Product Management"
                className="add-course-input"
                autoFocus
              />
            </label>
            <label className="add-course-field">
              <span className="add-course-label">Course code</span>
              <input
                type="text"
                value={code}
                onChange={event => setCode(event.target.value)}
                placeholder="e.g. BUAD 6461"
                className="add-course-input"
              />
            </label>
            <label className="add-course-field">
              <span className="add-course-label">Professor</span>
              <input
                type="text"
                value={professor}
                onChange={event => setProfessor(event.target.value)}
                placeholder="e.g. John Manuli"
                className="add-course-input"
              />
            </label>
          </div>
        )}

        {step === 'syllabus' && (
          <div className="add-course-body">
            <p className="add-course-hint">
              Upload a syllabus PDF or paste text below. StudyDesk will parse it into an editable setup review before saving.
            </p>
            <div className={`scan-drop-zone ${pdfBusy ? 'busy' : ''}`}>
              <div className="scan-drop-icon">
                {pdfBusy ? <Loader2 size={18} className="spin" /> : <FileText size={18} />}
              </div>
              <div className="scan-drop-body">
                <strong>{pdfBusy ? 'Extracting PDF text...' : 'Upload syllabus PDF'}</strong>
                <span>Extract embedded PDF text locally. OCR is only used as fallback for scanned documents.</span>
                {pdfMessage && (
                  <div className={pdfMessage.type === 'success' ? 'scan-drop-success' : 'scan-drop-error'}>
                    {pdfMessage.type === 'success' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                    {pdfMessage.text}
                  </div>
                )}
              </div>
              <label className="scan-drop-button">
                Browse
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={event => {
                    const file = event.target.files?.[0]
                    if (file) void handlePdfImport(file)
                    event.target.value = ''
                  }}
                  disabled={pdfBusy || busy}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <textarea
              className="add-course-textarea"
              rows={8}
              value={syllabusText}
              onChange={event => {
                setSyllabusText(event.target.value)
                setReview(null)
                setConfirmResult(null)
              }}
              placeholder="Paste syllabus content here..."
            />
            {!showOcrFallback ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowOcrFallback(true)}
              >
                Use image OCR fallback
              </button>
            ) : (
              <ScanSyllabusDropZone
                onText={text => {
                  const nextText = parseText ? `${parseText}\n\n${text}` : text
                  setSyllabusText(nextText)
                  setReview(null)
                  setConfirmResult(null)
                }}
              />
            )}
          </div>
        )}

        {step === 'review' && review && (
          <SyllabusReview
            review={review}
            onCourseChange={updateCourse}
            onToggleAssignment={toggleAssignment}
            onEditAssignment={editAssignment}
            onToggleDeadline={toggleDeadline}
            onEditDeadline={editDeadline}
            onToggleSetup={toggleSetup}
            onEditSetup={editSetup}
          />
        )}

        {step === 'materials' && (
          <MaterialsPrompt
            result={confirmResult}
            course={createdCourse}
          />
        )}

        <footer className="add-course-footer">
          {step === 'details' && (
            <button
              className="btn-primary add-course-submit"
              onClick={handleContinue}
              disabled={!canContinue || busy}
            >
              Next <ChevronRight size={14} />
            </button>
          )}
          {step === 'syllabus' && (
            <div className="add-course-footer-row">
              <button className="btn-ghost" onClick={handleSkipSyllabus} disabled={busy}>
                Skip for now
              </button>
              <button
                className="btn-primary"
                onClick={handleParseClick}
                disabled={!parseText || busy || pdfBusy}
              >
                {busy ? <><Loader2 size={14} className="spin" /> Parsing...</> : <><Upload size={14} /> Import syllabus</>}
              </button>
            </div>
          )}
          {step === 'review' && (
            <div className="add-course-footer-row">
              <button className="btn-ghost" onClick={() => setStep('syllabus')} disabled={busy}>
                Back to text
              </button>
              <button className="btn-primary" onClick={handleConfirmImport} disabled={busy || !review}>
                {busy ? <><Loader2 size={14} className="spin" /> Creating setup...</> : <><CheckCircle2 size={14} /> Confirm setup</>}
              </button>
            </div>
          )}
          {step === 'materials' && (
            <div className="add-course-footer-row">
              <button className="btn-ghost" onClick={onClose}>Done</button>
              <button className="btn-primary" onClick={() => {
                const courseId = confirmResult?.courseId ?? createdCourse?.id
                if (courseId) onOpenMaterials?.(courseId)
                else onClose()
              }}>
                <Upload size={14} /> Upload course materials
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

function SyllabusReview({
  review,
  onCourseChange,
  onToggleAssignment,
  onEditAssignment,
  onToggleDeadline,
  onEditDeadline,
  onToggleSetup,
  onEditSetup,
}: {
  review: SyllabusParseReview
  onCourseChange: (field: keyof SyllabusParseReview['course'], value: string) => void
  onToggleAssignment: (index: number) => void
  onEditAssignment: (index: number, field: keyof SyllabusAssignmentReview, value: string | number) => void
  onToggleDeadline: (index: number) => void
  onEditDeadline: (index: number, field: keyof SyllabusDeadlineReview, value: string | number) => void
  onToggleSetup: (index: number) => void
  onEditSetup: (index: number, field: keyof SyllabusSetupReview, value: string) => void
}) {
  return (
    <div className="add-course-body add-course-review-body">
      <p className="add-course-hint">Review and edit what StudyDesk extracted before creating the course workspace.</p>
      <div className="add-course-review-grid">
        <section className="add-course-review-panel">
          <h3>Course info</h3>
          <div className="add-course-review-form">
            <label>Code <input value={review.course.code ?? ''} onChange={event => onCourseChange('code', event.target.value)} /></label>
            <label>Name <input value={review.course.name ?? ''} onChange={event => onCourseChange('name', event.target.value)} /></label>
            <label>Instructor <input value={review.course.professorName ?? ''} onChange={event => onCourseChange('professorName', event.target.value)} /></label>
            <label>Email <input value={review.course.professorEmail ?? ''} onChange={event => onCourseChange('professorEmail', event.target.value)} /></label>
            <label>Term <input value={review.course.term ?? ''} onChange={event => onCourseChange('term', event.target.value)} /></label>
            <label>Location <input value={review.course.location ?? ''} onChange={event => onCourseChange('location', event.target.value)} /></label>
          </div>
          {review.classMeetings.length > 0 && (
            <>
              <h3>Class schedule</h3>
              {review.classMeetings.map((meeting, index) => (
                <div className="add-course-review-row" key={index}>
                  <strong>{meeting.days.join('/') || 'Meeting'}</strong>
                  <span>{meeting.startTime} - {meeting.endTime}{meeting.location ? ` · ${meeting.location}` : ''}</span>
                </div>
              ))}
            </>
          )}
          {review.readings.length > 0 && (
            <>
              <h3>Readings</h3>
              {review.readings.slice(0, 8).map((reading, index) => (
                <div className="add-course-review-row" key={index}>
                  <strong>{reading.title}</strong>
                  {reading.chapter && <span>{reading.chapter}</span>}
                </div>
              ))}
              {review.readings.length > 8 && <p className="add-course-review-muted">+{review.readings.length - 8} more reading item(s)</p>}
            </>
          )}
          {review.scheduleRowCount > 0 && <p className="add-course-review-muted">{review.scheduleRowCount} schedule row(s) extracted.</p>}
        </section>

        <section className="add-course-review-panel">
          <h3>Assignments ({review.assignments.filter(item => item.included).length}/{review.assignments.length})</h3>
          {review.assignments.length === 0 && <p className="add-course-review-muted">No assignments found.</p>}
          {review.assignments.map((assignment, index) => (
            <label className="add-course-review-check" key={`assignment-${index}`}>
              <input type="checkbox" checked={assignment.included} onChange={() => onToggleAssignment(index)} />
              <span>
                <input value={assignment.title} onChange={event => onEditAssignment(index, 'title', event.target.value)} />
                <em>{assignment.weight ?? assignment.type}{assignment.dueDate ? ` · ${formatDue(assignment.dueDate)}` : ''}</em>
              </span>
            </label>
          ))}

          <h3>Deadlines ({review.deadlines.filter(item => item.included).length}/{review.deadlines.length})</h3>
          {review.deadlines.length === 0 && <p className="add-course-review-muted">No dated deadlines found.</p>}
          {review.deadlines.map((deadline, index) => (
            <label className="add-course-review-check" key={`deadline-${index}`}>
              <input type="checkbox" checked={deadline.included} onChange={() => onToggleDeadline(index)} />
              <span>
                <input value={deadline.title} onChange={event => onEditDeadline(index, 'title', event.target.value)} />
                <em>{formatDue(deadline.deadlineAt)} · <input value={deadline.type} onChange={event => onEditDeadline(index, 'type', event.target.value)} /></em>
              </span>
            </label>
          ))}

          <h3>Setup tasks ({review.setupTasks.filter(item => item.included).length}/{review.setupTasks.length})</h3>
          {review.setupTasks.length === 0 && <p className="add-course-review-muted">No setup tasks found.</p>}
          {review.setupTasks.map((task, index) => (
            <label className="add-course-review-check" key={`setup-${index}`}>
              <input type="checkbox" checked={task.included} onChange={() => onToggleSetup(index)} />
              <span>
                <input value={task.title} onChange={event => onEditSetup(index, 'title', event.target.value)} />
                <em><input value={task.category} onChange={event => onEditSetup(index, 'category', event.target.value)} /></em>
              </span>
            </label>
          ))}
        </section>
      </div>
    </div>
  )
}

function MaterialsPrompt({
  result,
  course,
}: {
  result: SyllabusConfirmResult | null
  course: Course | null
}) {
  const counts = result?.counts ?? { assignments: 0, deadlines: 0, setupAlerts: 0 }
  return (
    <div className="add-course-body add-course-materials-body">
      <p className="add-course-hint">
        Course setup complete{course?.name ? ` for ${course.name}` : ''}. Next: upload the source materials StudyDesk will use for flashcards, quizzes, study guides, and assignment prep.
      </p>
      <div className="add-course-created-summary">
        <span>{counts.assignments} assignment(s)</span>
        <span>{counts.deadlines} deadline(s)</span>
        <span>{counts.setupAlerts} setup task(s)</span>
      </div>
      <div className="add-course-material-list">
        <div><strong>Readings</strong><span>Textbook chapters and course readings</span></div>
        <div><strong>Harvard cases</strong><span>Case PDFs and coursepack documents</span></div>
        <div><strong>Assignment prompts</strong><span>Briefs, deliverables, rubrics, submission rules</span></div>
        <div><strong>Lecture slides</strong><span>Decks and class handouts</span></div>
        <div><strong>Study guides</strong><span>Review sheets, exam guides, and prep notes</span></div>
      </div>
    </div>
  )
}

function formatDue(value?: number) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
