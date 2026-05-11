// AddCourseModal — multi-step modal for creating a new course.
// Step 1: Course details (name, code, professor)
// Step 2: Optional syllabus import (paste text or drop image for OCR)

import React, { useState, useCallback } from 'react'
import { X, ChevronRight, Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { ScanSyllabusDropZone } from './ScanSyllabusDropZone'
import { ipc } from '../../shared/ipc-client'
import type { Course, Note } from '@schema'

export interface AddCourseModalProps {
  onClose: () => void
  onCourseCreated: (course: Course) => void
  onStatus?: (msg: string) => void
}

type Step = 'details' | 'syllabus'

export function AddCourseModal({ onClose, onCourseCreated, onStatus }: AddCourseModalProps) {
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [professor, setProfessor] = useState('')
  const [syllabusText, setSyllabusText] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdCourse, setCreatedCourse] = useState<Course | null>(null)

  const canCreate = name.trim().length > 0

  const handleCreateCourse = useCallback(async () => {
    if (!canCreate) return
    setBusy(true)
    try {
      const course = await ipc.invoke<Course>('course:create', {
        name: name.trim(),
        code: code.trim() || undefined,
        professorName: professor.trim() || undefined,
      })
      setCreatedCourse(course)
      onStatus?.(`Course "${course.name}" created`)
      setStep('syllabus')
    } catch (e: any) {
      onStatus?.(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [canCreate, name, code, professor, onStatus])

  const handleImportSyllabus = useCallback(async () => {
    if (!createdCourse || !syllabusText.trim()) return
    setBusy(true)
    try {
      // Create a syllabus note attached to the course
      const note = await ipc.invoke<Note>('notes:create', {
        title: `${createdCourse.name} — Syllabus`,
        content: JSON.stringify({
          type: 'doc',
          content: syllabusText.split('\n').filter(Boolean).map(line => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          })),
        }),
      })
      await ipc.invoke<Note>('notes:update', {
        id: note.id,
        patch: { documentType: 'syllabus', courseId: createdCourse.id },
      })
      onStatus?.('Syllabus imported')
      onCourseCreated(createdCourse)
      onClose()
    } catch (e: any) {
      onStatus?.(`Syllabus import failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [createdCourse, syllabusText, onCourseCreated, onClose, onStatus])

  const handleSkipSyllabus = () => {
    if (createdCourse) {
      onCourseCreated(createdCourse)
    }
    onClose()
  }

  return (
    <div className="add-course-overlay" onClick={onClose}>
      <div className="add-course-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="add-course-modal-head">
          <div>
            <p className="add-course-step-label">
              {step === 'details' ? 'Step 1 of 2' : 'Step 2 of 2'}
            </p>
            <h2 className="add-course-modal-title">
              {step === 'details' ? 'Add a new course' : 'Import syllabus'}
            </h2>
          </div>
          <button className="add-course-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        {step === 'details' ? (
          <div className="add-course-body">
            <label className="add-course-field">
              <span className="add-course-label">Course name *</span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Data Structures & Algorithms"
                className="add-course-input"
                autoFocus
              />
            </label>
            <label className="add-course-field">
              <span className="add-course-label">Course code</span>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="e.g. CS201"
                className="add-course-input"
              />
            </label>
            <label className="add-course-field">
              <span className="add-course-label">Professor</span>
              <input
                type="text"
                value={professor}
                onChange={e => setProfessor(e.target.value)}
                placeholder="e.g. Dr. Smith"
                className="add-course-input"
              />
            </label>
          </div>
        ) : (
          <div className="add-course-body">
            <p className="add-course-hint">
              Paste your syllabus text below or drop a screenshot/image to OCR it.
              You can skip this and add it later.
            </p>
            <textarea
              className="add-course-textarea"
              rows={8}
              value={syllabusText}
              onChange={e => setSyllabusText(e.target.value)}
              placeholder="Paste syllabus content here..."
            />
            <ScanSyllabusDropZone onText={text => setSyllabusText(prev => prev ? prev + '\n' + text : text)} />
          </div>
        )}

        {/* Footer */}
        <footer className="add-course-footer">
          {step === 'details' ? (
            <button
              className="btn-primary add-course-submit"
              onClick={handleCreateCourse}
              disabled={!canCreate || busy}
            >
              {busy ? <><Loader2 size={14} className="spin" /> Creating...</> : <>Next <ChevronRight size={14} /></>}
            </button>
          ) : (
            <div className="add-course-footer-row">
              <button className="btn-ghost" onClick={handleSkipSyllabus}>
                Skip for now
              </button>
              <button
                className="btn-primary"
                onClick={handleImportSyllabus}
                disabled={!syllabusText.trim() || busy}
              >
                {busy ? <><Loader2 size={14} className="spin" /> Importing...</> : <><Upload size={14} /> Import syllabus</>}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}
