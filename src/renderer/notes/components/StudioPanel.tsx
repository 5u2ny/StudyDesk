// Studio panel — the right-hand pane.
//
// Three cards only:
//   1. Quiz — merges "Quiz me back" (deterministic heading extraction)
//      + "Generate quiz" (AI-powered via Ollama)
//   2. Flashcards — AI generate + save to deck
//   3. Resources — curated links (sites, articles, YouTube, study areas)

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, FileText, GitBranch, HelpCircle, Layers, Link2, Loader2, Merge, Plus, Sparkles, ExternalLink, X } from 'lucide-react'
import type { Note, ConfusionItem } from '@schema'
import { ipc } from '../../shared/ipc-client'
import { mergeNoteContents } from '../lib/mergeNotes'
import { RelatedNotesList } from './RelatedNotesList'

export interface StudioPanelProps {
  notes: Note[]
  confusions: ConfusionItem[]
  courseId?: string
  hasActiveNote: boolean
  activeNoteId?: string
  activeNoteContent?: string
  onOpenQuizMeBack: () => void
  onOpenNote: (note: Note) => void
  onCreateNote?: (title: string, content: string) => Promise<Note | void>
  onSaveFlashcards?: (cards: Array<{ front: string; back: string }>) => void
  onStatus?: (msg: string) => void
}

interface CardProps {
  id: string
  icon: React.ComponentType<any>
  title: string
  description: string
  open: boolean
  onToggle: () => void
  badge?: number
  children: React.ReactNode | (() => React.ReactNode)
}

function StudioCard({ id, icon: Icon, title, description, open, onToggle, badge, children }: CardProps) {
  return (
    <article className={`studio-card${open ? ' is-open' : ''}`} data-card={id}>
      <button className="studio-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="studio-card-icon"><Icon size={15} /></span>
        <span className="studio-card-titles">
          <span className="studio-card-title">{title}</span>
          <span className="studio-card-desc">{description}</span>
        </span>
        {badge != null && badge > 0 && <span className="studio-card-badge">{badge}</span>}
        <span className="studio-card-chev">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && <div className="studio-card-body">{typeof children === 'function' ? children() : children}</div>}
    </article>
  )
}

export function StudioPanel({
  notes,
  confusions,
  courseId,
  hasActiveNote,
  activeNoteId,
  activeNoteContent,
  onOpenQuizMeBack,
  onOpenNote,
  onCreateNote,
  onSaveFlashcards,
  onStatus,
}: StudioPanelProps) {
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({ quiz: true })
  const toggle = (id: string) => setOpenCards(s => ({ ...s, [id]: !s[id] }))
  const isOpen = (id: string) => !!openCards[id]

  // ── AI generation state ──────────────────────────────────────
  const [aiQuiz, setAiQuiz] = useState<Array<{ question: string; options: string[]; correct: number; explanation: string }>>([])
  const [aiFlashcards, setAiFlashcards] = useState<Array<{ front: string; back: string }>>([])
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  // Resources state (local to panel — persisted per session)
  const [resources, setResources] = useState<Array<{ url: string; title: string; type: string }>>([])
  const [showAddResource, setShowAddResource] = useState(false)
  const [newResourceUrl, setNewResourceUrl] = useState('')
  const [newResourceTitle, setNewResourceTitle] = useState('')

  const extractText = useCallback((content?: string): string => {
    if (!content) return ''
    try {
      const doc = JSON.parse(content)
      const walk = (node: any): string => {
        if (!node) return ''
        if (typeof node.text === 'string') return node.text
        if (Array.isArray(node.content)) return node.content.map(walk).join(node.type === 'paragraph' ? '\n' : '')
        return ''
      }
      return walk(doc)
    } catch { return '' }
  }, [])

  const handleGenerateQuiz = useCallback(async () => {
    const text = extractText(activeNoteContent)
    if (!text) { setAiError('Open a note with content first'); return }
    setAiLoading('quiz'); setAiError(null); setAiQuiz([])
    try {
      const result = await ipc.invoke<Array<{ question: string; options: string[]; correct: number; explanation: string }>>('ai:generateQuiz', { noteContent: text, count: 5 })
      setAiQuiz(result)
      onStatus?.(`Generated ${result.length} quiz questions`)
    } catch (e: any) { setAiError(e.message ?? 'Quiz generation failed') }
    finally { setAiLoading(null) }
  }, [activeNoteContent, extractText, onStatus])

  const handleGenerateFlashcards = useCallback(async () => {
    const text = extractText(activeNoteContent)
    if (!text) { setAiError('Open a note with content first'); return }
    setAiLoading('flashcards'); setAiError(null); setAiFlashcards([])
    try {
      const result = await ipc.invoke<Array<{ front: string; back: string }>>('ai:generateFlashcards', { noteContent: text, count: 10 })
      setAiFlashcards(result)
      onStatus?.(`Generated ${result.length} flashcards`)
    } catch (e: any) { setAiError(e.message ?? 'Flashcard generation failed') }
    finally { setAiLoading(null) }
  }, [activeNoteContent, extractText, onStatus])

  // ── AI Notes handlers ─────────────────────────────────────────
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set())
  const [showMergeSelect, setShowMergeSelect] = useState(false)

  const handleGenerateNotes = useCallback(async () => {
    const text = extractText(activeNoteContent)
    if (!text) { setAiError('Open a note with content first'); return }
    setAiLoading('ai-notes'); setAiError(null)
    try {
      const result = await ipc.invoke<string>('ai:generateStudyNotes', { noteContent: text })
      // Create a new note with the generated content
      const content = JSON.stringify({
        type: 'doc',
        content: result.split('\n').filter(Boolean).map(line => ({
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        })),
      })
      if (onCreateNote) {
        await onCreateNote('AI Study Notes', content)
        onStatus?.('Study notes generated')
      }
    } catch (e: any) { setAiError(e.message ?? 'Note generation failed') }
    finally { setAiLoading(null) }
  }, [activeNoteContent, extractText, onCreateNote, onStatus])

  const handleSummarize = useCallback(async () => {
    const text = extractText(activeNoteContent)
    if (!text) { setAiError('Open a note with content first'); return }
    setAiLoading('summarize'); setAiError(null)
    try {
      const result = await ipc.invoke<string>('ai:summarize', { content: text })
      const content = JSON.stringify({
        type: 'doc',
        content: result.split('\n').filter(Boolean).map(line => ({
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        })),
      })
      if (onCreateNote) {
        await onCreateNote('Summary', content)
        onStatus?.('Summary generated')
      }
    } catch (e: any) { setAiError(e.message ?? 'Summarization failed') }
    finally { setAiLoading(null) }
  }, [activeNoteContent, extractText, onCreateNote, onStatus])

  const handleMerge = useCallback(async () => {
    if (mergeSelection.size < 2) { setAiError('Select at least 2 notes to merge'); return }
    const selected = notes.filter(n => mergeSelection.has(n.id))
    const content = mergeNoteContents(selected)
    if (onCreateNote) {
      await onCreateNote(`Merged: ${selected.map(n => n.title || 'Untitled').join(' + ')}`, content)
      onStatus?.(`Merged ${selected.length} notes`)
    }
    setMergeSelection(new Set())
    setShowMergeSelect(false)
  }, [mergeSelection, notes, onCreateNote, onStatus])

  const courseNotes = useMemo(() => {
    return courseId ? notes.filter(n => n.courseId === courseId) : notes
  }, [notes, courseId])

  const addResource = () => {
    if (!newResourceUrl.trim()) return
    const url = newResourceUrl.trim()
    const title = newResourceTitle.trim() || url
    const type = url.includes('youtube.com') || url.includes('youtu.be') ? 'video'
      : url.endsWith('.pdf') ? 'pdf'
      : 'link'
    setResources(prev => [...prev, { url, title, type }])
    setNewResourceUrl('')
    setNewResourceTitle('')
    setShowAddResource(false)
    onStatus?.('Resource added')
  }

  const removeResource = (index: number) => {
    setResources(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="studio-panel">
      <header className="studio-panel-head">
        <span className="studio-eyebrow">Studio</span>
        <h2>Study Studio</h2>
      </header>

      <div className="studio-stack">
        {aiError && (
          <div className="studio-ai-error">
            <span>{aiError}</span>
            <button onClick={() => setAiError(null)}>dismiss</button>
          </div>
        )}

        {/* ── QUIZ ── */}
        <StudioCard
          id="quiz"
          open={isOpen('quiz')} onToggle={() => toggle('quiz')}
          icon={HelpCircle}
          title="Quiz"
          description={hasActiveNote ? 'No-AI headings or local AI questions' : 'Open a note to enable'}
          badge={aiQuiz.length || undefined}
        >
          <div className="studio-card-actions">
            <button
              className="btn-ghost"
              onClick={onOpenQuizMeBack}
              disabled={!hasActiveNote}
              title="Extract questions from headings (no AI needed)"
            >
              <Sparkles size={13} /> No-AI headings
            </button>
            <button
              className="btn-primary"
              onClick={handleGenerateQuiz}
              disabled={!hasActiveNote || aiLoading === 'quiz'}
              title="Generate quiz with local AI (requires Ollama)"
            >
              {aiLoading === 'quiz' ? <><Loader2 size={13} className="spin" /> Generating...</> : <><HelpCircle size={13} /> Generate with AI</>}
            </button>
          </div>
          {aiQuiz.length > 0 && (
            <ul className="ai-quiz-list">
              {aiQuiz.map((q, i) => (
                <li key={i} className="ai-quiz-item">
                  <strong>{i + 1}. {q.question}</strong>
                  <ul className="ai-quiz-options">
                    {q.options.map((opt, j) => (
                      <li key={j} className={j === q.correct ? 'is-correct' : ''}>{String.fromCharCode(65 + j)}. {opt}</li>
                    ))}
                  </ul>
                  <p className="ai-quiz-explanation">{q.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </StudioCard>

        {/* ── FLASHCARDS ── */}
        <StudioCard
          id="flashcards"
          open={isOpen('flashcards')} onToggle={() => toggle('flashcards')}
          icon={Layers}
          title="Flashcards"
          description={hasActiveNote ? 'Draft editable cards from the active note' : 'Open a note to enable'}
          badge={aiFlashcards.length || undefined}
        >
          <button
            className="btn-primary"
            onClick={handleGenerateFlashcards}
            disabled={!hasActiveNote || aiLoading === 'flashcards'}
            style={{ width: '100%' }}
          >
            {aiLoading === 'flashcards' ? <><Loader2 size={13} className="spin" /> Generating...</> : <><Layers size={13} /> Generate card drafts</>}
          </button>
          {aiFlashcards.length > 0 && (
            <>
              <ul className="ai-flashcard-list">
                {aiFlashcards.map((c, i) => (
                  <li key={i} className="ai-flashcard-item">
                    <div className="ai-fc-front"><strong>Q:</strong> {c.front}</div>
                    <div className="ai-fc-back"><strong>A:</strong> {c.back}</div>
                  </li>
                ))}
              </ul>
              {onSaveFlashcards && (
                <button className="btn-primary" onClick={() => {
                  onSaveFlashcards(aiFlashcards)
                  onStatus?.(`Saved ${aiFlashcards.length} flashcards to your deck`)
                  setAiFlashcards([])
                }} style={{ width: '100%' }}>
                  Save all {aiFlashcards.length} drafts to deck
                </button>
              )}
            </>
          )}
        </StudioCard>

        {/* ── AI NOTES ── */}
        <StudioCard
          id="ai-notes"
          open={isOpen('ai-notes')} onToggle={() => toggle('ai-notes')}
          icon={FileText}
          title="AI Notes"
          description={hasActiveNote ? 'Summarize, merge, or create study notes' : 'Open a note to enable'}
        >
          <div className="studio-card-actions" style={{ flexDirection: 'column', gap: 6 }}>
            <button
              className="btn-primary"
              onClick={handleGenerateNotes}
              disabled={!hasActiveNote || aiLoading === 'ai-notes'}
              style={{ width: '100%' }}
            >
              {aiLoading === 'ai-notes' ? <><Loader2 size={13} className="spin" /> Generating...</> : <><Sparkles size={13} /> Generate study notes</>}
            </button>
            <button
              className="btn-ghost"
              onClick={handleSummarize}
              disabled={!hasActiveNote || aiLoading === 'summarize'}
              style={{ width: '100%' }}
            >
              {aiLoading === 'summarize' ? <><Loader2 size={13} className="spin" /> Summarizing...</> : <><FileText size={13} /> Summarize</>}
            </button>
            <button
              className="btn-ghost"
              onClick={() => setShowMergeSelect(!showMergeSelect)}
              disabled={courseNotes.length < 2}
              style={{ width: '100%' }}
            >
              <Merge size={13} /> Merge notes
            </button>
          </div>
          {showMergeSelect && (
            <div className="studio-merge-select">
              <p className="studio-merge-hint">Select notes to merge:</p>
              <ul className="studio-merge-list">
                {courseNotes.slice(0, 15).map(n => (
                  <li key={n.id}>
                    <label className="studio-merge-item">
                      <input
                        type="checkbox"
                        checked={mergeSelection.has(n.id)}
                        onChange={() => setMergeSelection(prev => {
                          const next = new Set(prev)
                          if (next.has(n.id)) next.delete(n.id); else next.add(n.id)
                          return next
                        })}
                      />
                      <span>{n.title || 'Untitled'}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                className="btn-primary"
                onClick={handleMerge}
                disabled={mergeSelection.size < 2}
                style={{ width: '100%', marginTop: 6 }}
              >
                Merge {mergeSelection.size} notes
              </button>
            </div>
          )}
        </StudioCard>

        {/* ── RELATED NOTES ── */}
        {activeNoteId && (() => {
          const activeNote = notes.find(n => n.id === activeNoteId)
          if (!activeNote) return null
          return (
            <StudioCard
              id="related"
              open={isOpen('related')} onToggle={() => toggle('related')}
              icon={GitBranch}
              title="Related Notes"
              description="Nearby ideas and reusable context"
            >
              <RelatedNotesList
                note={activeNote}
                allNotes={notes}
                onSelect={onOpenNote}
              />
            </StudioCard>
          )
        })()}

        {/* ── RESOURCES ── */}
        <StudioCard
          id="resources"
          open={isOpen('resources')} onToggle={() => toggle('resources')}
          icon={Link2}
          title="Resources"
          description={`${resources.length} link${resources.length === 1 ? '' : 's'} saved`}
          badge={resources.length || undefined}
        >
          {resources.length > 0 ? (
            <ul className="resources-list">
              {resources.map((r, i) => (
                <li key={i} className="resource-row">
                  <a href={r.url} target="_blank" rel="noreferrer" className="resource-link">
                    <span className="resource-type-tag">{r.type}</span>
                    <span className="resource-title">{r.title}</span>
                    <ExternalLink size={11} className="resource-ext-icon" />
                  </a>
                  <button className="resource-remove" onClick={() => removeResource(i)} title="Remove">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-note">Save links to articles, YouTube videos, study sites, and other resources for this course.</p>
          )}

          {showAddResource ? (
            <div className="resource-add-form">
              <input
                type="url"
                value={newResourceUrl}
                onChange={e => setNewResourceUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                className="resource-input"
              />
              <input
                type="text"
                value={newResourceTitle}
                onChange={e => setNewResourceTitle(e.target.value)}
                placeholder="Title (optional)"
                className="resource-input"
              />
              <div className="resource-add-actions">
                <button className="btn-ghost" onClick={() => { setShowAddResource(false); setNewResourceUrl(''); setNewResourceTitle('') }}>Cancel</button>
                <button className="btn-primary" onClick={addResource} disabled={!newResourceUrl.trim()}>Add</button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setShowAddResource(true)} style={{ width: '100%', marginTop: 8 }}>
              <Plus size={13} /> Add resource
            </button>
          )}
        </StudioCard>
      </div>
    </div>
  )
}
