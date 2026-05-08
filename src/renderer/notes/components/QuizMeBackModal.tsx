// "Quiz me back" review modal — REDESIGN_PLAN_V2 ticket T2.
//
// Surfaces the candidate cards extracted by extractCardCandidates and
// gives the user per-candidate Keep / Edit / Skip control before any
// of them become real study items. AI-as-draft, never AI-as-final —
// even though there's no AI involved here, the principle holds: the
// user has full agency over what enters the study queue.
//
// Pattern reference: Anki's "Add" dialog, but plural and with three
// actions per row instead of one.

import React, { useState, useMemo } from 'react'
import { Check, X as XIcon, Brain } from 'lucide-react'
import type { CardCandidate } from '../lib/extractCards'

type RowState = 'kept' | 'skipped'

interface RowDraft extends CardCandidate {
  state: RowState
  /** Editable copy of front/back so the user can tweak before commit. */
  front: string
  back: string
}

interface Props {
  open: boolean
  onClose: () => void
  candidates: ReadonlyArray<CardCandidate>
  /** Already-existing fronts so the modal can flag duplicates. */
  existingFronts: ReadonlyArray<string>
  /** Called once with all kept rows when the user commits. */
  onCommit: (kept: Array<{ front: string; back: string; cardKey: string }>) => void | Promise<void>
}

export function QuizMeBackModal({ open, onClose, candidates, existingFronts, onCommit }: Props) {
  // Initialize one draft row per candidate. "kept" is the default —
  // the user has to actively skip the bad ones, not opt-in to good
  // ones. This matches the pattern in Anki's import dialog.
  const initialDrafts = useMemo<RowDraft[]>(
    () => candidates.map(c => ({ ...c, state: 'kept' })),
    [candidates],
  )
  const [drafts, setDrafts] = useState<RowDraft[]>(initialDrafts)
  // Reset when the candidate list changes (note switched, etc.)
  React.useEffect(() => { setDrafts(initialDrafts) }, [initialDrafts])

  const existingSet = useMemo(() => new Set(existingFronts.map(f => f.trim().toLowerCase())), [existingFronts])
  const isDuplicate = (front: string) => existingSet.has(front.trim().toLowerCase())

  if (!open) return null

  const keptCount = drafts.filter(d => d.state === 'kept').length

  const update = (i: number, patch: Partial<RowDraft>) =>
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="presentation">
      <div className="quiz-back-shell" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quiz me back">
        <header className="quiz-back-header">
          <div>
            <p className="phase3-eyebrow">Quiz me back</p>
            <h1>{candidates.length} candidate{candidates.length === 1 ? '' : 's'} from this note</h1>
            <span>Skip the ones that aren&apos;t worth a card. Edit the front/back if needed. Then commit.</span>
          </div>
          <button onClick={onClose} className="cmdk-close" aria-label="Close"><XIcon size={14} /></button>
        </header>
        <div className="quiz-back-list">
          {drafts.length === 0 && (
            <div className="cmdk-empty">No candidates extracted from this note. Try adding ### headings or definition sentences (&quot;X is …&quot;).</div>
          )}
          {drafts.map((d, i) => {
            const dup = isDuplicate(d.front)
            return (
              <article
                key={d.cardKey}
                className={`quiz-back-row ${d.state === 'skipped' ? 'is-skipped' : ''} ${dup ? 'is-dup' : ''}`}
              >
                <div className="quiz-back-row-tag">
                  <Brain size={12} />
                  <span>{d.source}</span>
                  {dup && <span className="quiz-back-dup">already a card</span>}
                </div>
                <input
                  className="quiz-edit-input"
                  value={d.front}
                  onChange={e => update(i, { front: e.target.value })}
                  placeholder="Front"
                  disabled={d.state === 'skipped'}
                />
                <textarea
                  className="quiz-edit-input quiz-edit-textarea"
                  value={d.back}
                  onChange={e => update(i, { back: e.target.value })}
                  placeholder="Back"
                  rows={2}
                  disabled={d.state === 'skipped'}
                />
                <div className="quiz-back-row-actions">
                  {d.state === 'kept' ? (
                    <button onClick={() => update(i, { state: 'skipped' })} className="outline-button">Skip</button>
                  ) : (
                    <button onClick={() => update(i, { state: 'kept' })} className="outline-button">Keep</button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
        <footer className="quiz-back-footer">
          <span className="quiz-back-counter">{keptCount} kept · {drafts.length - keptCount} skipped</span>
          <span className="cmdk-footer-spacer" />
          <button onClick={onClose} className="outline-button">Cancel</button>
          <button
            className="review-button"
            disabled={keptCount === 0}
            onClick={async () => {
              const kept = drafts
                .filter(d => d.state === 'kept' && d.front.trim() && d.back.trim())
                .filter(d => !isDuplicate(d.front))
                .map(d => ({ front: d.front.trim(), back: d.back.trim(), cardKey: d.cardKey }))
              if (kept.length === 0) { onClose(); return }
              await onCommit(kept)
              onClose()
            }}
          >
            Commit {keptCount}
          </button>
        </footer>
      </div>
    </div>
  )
}
