// Studio panel — the right-hand pane.
//
// Replaces the previous Documents > Sources/Materials/Study/Health
// sub-tab strip with a vertical stack of "Studio cards" — the
// NotebookLM right-pane affordance. Each card is a feature: click
// to expand, click to generate, click to act. Cards are independent;
// state for one doesn't leak into another.
//
// Two principles drive the cards we ship:
//   1. The brand promise is source-grounded refusal-to-invent. So
//      the deterministic cards (Brief, Study Guide) are the
//      defaults — no LLM, no synthesis, just extraction.
//   2. The action-y cards (Quiz me, Panic mode, Forgive backlog)
//      route to the existing modal flows so we don't fork state.
//
// Future-deferred cards (Audio Overview, Mind Map) are flagged in
// the JSX but disabled — they require an LLM and we won't ship that
// until we can match NotebookLM's hallucination floor.

import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, FileText, BookOpen, Brain, AlertCircle, Activity, Inbox as InboxIcon, Sparkles, Network, Headphones } from 'lucide-react'
import type { Note, AcademicDeadline, AttentionAlert, StudyItem, ConfusionItem } from '@schema'
import { buildBrief, buildStudyGuide, type BriefSection, type StudyGuideEntry } from '../lib/studioGenerators'
import type { LintIssue } from '../lib/noteHealth'
import { summarizeIssues } from '../lib/noteHealth'

export interface StudioPanelProps {
  notes: Note[]
  deadlines: AcademicDeadline[]
  alerts: AttentionAlert[]
  studyItems: StudyItem[]
  confusions: ConfusionItem[]
  lintIssues: LintIssue[]
  /** Course filter — undefined means "all courses". */
  courseId?: string

  /** Open the Quiz me back modal for the active note. */
  onOpenQuizMeBack: () => void
  /** Open the Panic mode (cram) modal for the current course. */
  onOpenPanic: () => void
  /** Click on a brief / study-guide row → open the source note. */
  onOpenNote: (note: Note) => void
  /** Resolve / dismiss / snooze an alert. */
  onResolveAlert: (id: string) => void
  /** Mark a deadline complete. */
  onCompleteDeadline: (id: string) => void
}

interface CardProps {
  id: string
  icon: React.ComponentType<any>
  title: string
  description: string
  defaultOpen?: boolean
  badge?: number
  accent?: boolean
  children: React.ReactNode
}

function StudioCard({ id, icon: Icon, title, description, defaultOpen, badge, accent, children }: CardProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <article className={`studio-card${accent ? ' is-accent' : ''}${open ? ' is-open' : ''}`} data-card={id}>
      <button className="studio-card-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="studio-card-icon"><Icon size={15} /></span>
        <span className="studio-card-titles">
          <span className="studio-card-title">{title}</span>
          <span className="studio-card-desc">{description}</span>
        </span>
        {badge != null && badge > 0 && <span className="studio-card-badge">{badge}</span>}
        <span className="studio-card-chev">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && <div className="studio-card-body">{children}</div>}
    </article>
  )
}

export function StudioPanel({
  notes,
  deadlines,
  alerts,
  studyItems,
  confusions,
  lintIssues,
  courseId,
  onOpenQuizMeBack,
  onOpenPanic,
  onOpenNote,
  onResolveAlert,
  onCompleteDeadline,
}: StudioPanelProps) {
  // Course-scoped notes. If no course selected, brief reflects all
  // notes — that's the "all courses" mode and matches the rest of
  // the workspace's filtering convention.
  const scopedNotes = useMemo(
    () => courseId ? notes.filter(n => n.courseId === courseId) : notes,
    [notes, courseId],
  )
  const brief = useMemo(() => buildBrief(scopedNotes).slice(0, 12), [scopedNotes])
  const guide = useMemo(() => buildStudyGuide(scopedNotes).slice(0, 24), [scopedNotes])

  // Inbox: overdue + due-today deadlines, plus active critical alerts.
  // No fluff, just things that need attention right now.
  const now = Date.now()
  const inboxDeadlines = useMemo(() => deadlines
    .filter(d => !d.completed)
    .filter(d => !courseId || d.courseId === courseId)
    .filter(d => (d.deadlineAt - now) < 86_400_000 * 7)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)
    .slice(0, 8), [deadlines, courseId, now])

  // Active alerts = status is 'new' (not snoozed/dismissed/resolved).
  const activeAlerts = useMemo(() => alerts
    .filter(a => a.status === 'new')
    .slice(0, 5), [alerts])

  const dueCardsCount = studyItems.filter(s =>
    (!courseId || s.courseId === courseId) &&
    (!s.nextReviewAt || s.nextReviewAt <= now)
  ).length

  const unresolvedQuestionCount = confusions.filter(c => c.status !== 'resolved' && (!courseId || c.courseId === courseId)).length
  const lintSummary = summarizeIssues(lintIssues)

  return (
    <div className="studio-panel">
      <header className="studio-panel-head">
        <span className="studio-eyebrow">Studio</span>
        <h2>Generate &amp; review</h2>
      </header>

      <div className="studio-stack">
        {/* ── ACTIVE generation cards ────────────────────────────── */}
        <StudioCard
          id="brief"
          icon={FileText}
          title="Brief"
          description={`Outline of ${scopedNotes.length} note${scopedNotes.length === 1 ? '' : 's'}, latest first`}
          defaultOpen
        >
          {brief.length === 0 ? (
            <EmptyHint message="No notes yet">Add a note to see the brief.</EmptyHint>
          ) : (
            <ul className="brief-list">
              {brief.map(section => (
                <li key={section.noteId} className="brief-row">
                  <button className="brief-title" onClick={() => {
                    const n = notes.find(nn => nn.id === section.noteId)
                    if (n) onOpenNote(n)
                  }}>
                    {section.noteTitle}
                  </button>
                  {section.headings.length > 0 && (
                    <ul className="brief-subs">
                      {section.headings.slice(0, 4).map((h, i) => (
                        <li key={i}>· {h}</li>
                      ))}
                      {section.headings.length > 4 && <li className="brief-more">+{section.headings.length - 4} more</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </StudioCard>

        <StudioCard
          id="study-guide"
          icon={BookOpen}
          title="Study guide"
          description="Every heading + its first sentence — the user's own words"
          badge={guide.length}
        >
          {guide.length === 0 ? (
            <EmptyHint message="Nothing to compile yet">Add H2 / H3 headings to your notes — they become the study guide.</EmptyHint>
          ) : (
            <ul className="guide-list">
              {guide.map((entry, i) => (
                <li key={i} className={`guide-row level-${entry.level}`}>
                  <button className="guide-heading" onClick={() => {
                    const n = notes.find(nn => nn.id === entry.noteId)
                    if (n) onOpenNote(n)
                  }}>{entry.heading}</button>
                  {entry.firstSentence && <p className="guide-summary">{entry.firstSentence}</p>}
                  <span className="guide-source">— {entry.noteTitle}</span>
                </li>
              ))}
            </ul>
          )}
        </StudioCard>

        <StudioCard
          id="quiz-me"
          icon={Sparkles}
          title="Quiz me back"
          description="Turn the active note's headings into review questions"
        >
          <p className="card-note">Open the active note, then click to extract candidate questions. You decide which ones become flashcards — no AI invention, just your headings.</p>
          <button className="review-button" onClick={onOpenQuizMeBack}>Quiz me from this note</button>
        </StudioCard>

        <StudioCard
          id="panic"
          icon={AlertCircle}
          title="Panic mode"
          description={dueCardsCount > 0 ? `${dueCardsCount} due card${dueCardsCount === 1 ? '' : 's'} ranked by retrievability` : 'No cards due — you\'re caught up'}
          accent={dueCardsCount > 20}
          badge={dueCardsCount > 0 ? dueCardsCount : undefined}
        >
          <p className="card-note">Drill the lowest-retrievability cards first. Best used the day before an exam.</p>
          <button className="review-button" onClick={onOpenPanic} disabled={dueCardsCount === 0}>
            Start a 25-minute drill
          </button>
        </StudioCard>

        {/* ── INBOX (was a sub-tab; now a card) ─────────────────── */}
        <StudioCard
          id="inbox"
          icon={InboxIcon}
          title="Inbox"
          description={`${inboxDeadlines.length} deadline${inboxDeadlines.length === 1 ? '' : 's'} this week · ${activeAlerts.length} alert${activeAlerts.length === 1 ? '' : 's'}`}
          badge={inboxDeadlines.length + activeAlerts.length}
        >
          {inboxDeadlines.length === 0 && activeAlerts.length === 0 && (
            <EmptyHint message="Inbox zero">No deadlines this week, no active alerts.</EmptyHint>
          )}
          {inboxDeadlines.length > 0 && (
            <>
              <h4 className="card-section-head">Deadlines</h4>
              <ul className="inbox-list">
                {inboxDeadlines.map(d => {
                  const ms = d.deadlineAt - now
                  const isOverdue = ms < 0
                  const days = Math.ceil(ms / 86_400_000)
                  return (
                    <li key={d.id} className={`inbox-row ${isOverdue ? 'is-overdue' : ''}`}>
                      <div className="inbox-row-body">
                        <strong>{d.title}</strong>
                        <em>{isOverdue ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}</em>
                      </div>
                      <button className="inline-action" onClick={() => onCompleteDeadline(d.id)}>Done</button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {activeAlerts.length > 0 && (
            <>
              <h4 className="card-section-head">Alerts</h4>
              <ul className="inbox-list">
                {activeAlerts.map(a => (
                  <li key={a.id} className="inbox-row">
                    <div className="inbox-row-body">
                      <strong>{a.title}</strong>
                      <em>{a.reason}</em>
                    </div>
                    <button className="inline-action" onClick={() => onResolveAlert(a.id)}>Resolve</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </StudioCard>

        {/* ── HEALTH (demoted from sub-tab) ─────────────────────── */}
        <StudioCard
          id="health"
          icon={Activity}
          title="Note health"
          description={`${lintIssues.length} issue${lintIssues.length === 1 ? '' : 's'} across your notes`}
          badge={lintIssues.length || undefined}
        >
          {lintIssues.length === 0 ? (
            <EmptyHint message="Notes look clean">Empty / orphaned / linkless notes will show up here.</EmptyHint>
          ) : (
            <p className="card-note">
              {lintSummary.warnCount} warning{lintSummary.warnCount === 1 ? '' : 's'} ·{' '}
              {lintSummary.infoCount} note{lintSummary.infoCount === 1 ? '' : 's'} to review.
            </p>
          )}
        </StudioCard>

        {/* ── DEFERRED · LLM features. Visible-but-disabled so the
             user knows we're aware of them, not pretending. */}
        <StudioCard
          id="audio-overview"
          icon={Headphones}
          title="Audio overview"
          description="A short audio briefing of this course"
        >
          <p className="card-note muted">
            Deferred. Generating audio requires an LLM, and we won't ship that until we can guarantee
            source-grounded refusal-to-invent (NotebookLM's hallucination rate is ~13 %; we want lower
            before we put words in your speakers). Track the request — vote with usage when it ships.
          </p>
        </StudioCard>

        <StudioCard
          id="mind-map"
          icon={Network}
          title="Mind map"
          description="Concept connections across your notes"
        >
          <p className="card-note muted">
            Deferred for the same reason as Audio overview. The Map tab in the workspace shows a
            relation graph today, derived from explicit [[note links]] and source quotes — no AI.
          </p>
        </StudioCard>

        {/* ── Confusion list — quick affordance, no card chrome ─── */}
        {unresolvedQuestionCount > 0 && (
          <StudioCard
            id="confusions"
            icon={Brain}
            title="Open questions"
            description={`${unresolvedQuestionCount} unresolved confusion${unresolvedQuestionCount === 1 ? '' : 's'}`}
            badge={unresolvedQuestionCount}
          >
            <ul className="confusion-list">
              {confusions
                .filter(c => c.status !== 'resolved' && (!courseId || c.courseId === courseId))
                .slice(0, 6)
                .map(c => (
                  <li key={c.id} className="confusion-row">
                    <strong>{c.question}</strong>
                    {c.context && <em>{c.context}</em>}
                  </li>
                ))}
            </ul>
          </StudioCard>
        )}
      </div>
    </div>
  )
}

function EmptyHint({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <div className="studio-empty">
      <strong>{message}</strong>
      <p>{children}</p>
    </div>
  )
}
