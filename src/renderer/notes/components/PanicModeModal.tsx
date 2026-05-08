// Panic mode modal — REDESIGN_PLAN_V2 ticket T3.
//
// "6 hours till exam, what do I drill?" → here's the 20 most-likely-to-
// fail cards, ranked, with the reason each one bubbled up. One click
// to start drilling. No AI; pure local ranking from panicMode.ts.

import React from 'react'
import { Brain, X as XIcon, Zap } from 'lucide-react'
import type { PanicItem } from '../lib/panicMode'

interface Props {
  open: boolean
  onClose: () => void
  items: ReadonlyArray<PanicItem>
  onReview: (id: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => void | Promise<void>
}

export function PanicModeModal({ open, onClose, items, onReview }: Props) {
  if (!open) return null
  return (
    <div className="cmdk-backdrop" onClick={onClose} role="presentation">
      <div className="quiz-back-shell" onClick={e => e.stopPropagation()} role="dialog" aria-label="Panic mode">
        <header className="quiz-back-header">
          <div>
            <p className="phase3-eyebrow"><Zap size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Panic mode</p>
            <h1>{items.length} most-likely-to-fail card{items.length === 1 ? '' : 's'}</h1>
            <span>Ranked by review history. Lower retrievability = more likely you'll miss it. Drill these first.</span>
          </div>
          <button onClick={onClose} className="cmdk-close" aria-label="Close"><XIcon size={14} /></button>
        </header>
        <div className="quiz-back-list">
          {items.length === 0 && (
            <div className="cmdk-empty">No cards in this course yet. Add some via Quiz me back or Sync from notes.</div>
          )}
          {items.map((p) => {
            // Render retrievability as a 0..100 bar so the user has a
            // visual cue of "how rough is this one." Darker red = lower
            // retrievability = more urgent.
            const pct = Math.round(p.retrievability * 100)
            const barColor = pct < 30 ? '#ff6b7a' : pct < 60 ? '#ffb84d' : '#5fa1ff'
            return (
              <article key={p.item.id} className="quiz-back-row panic-row">
                <div className="quiz-back-row-tag">
                  <Brain size={12} />
                  <span>{p.reason}</span>
                  <span className="panic-retrievability" style={{ color: barColor }}>
                    {pct}%
                  </span>
                </div>
                <div className="panic-front">{p.item.front}</div>
                {p.item.back && <div className="panic-back">{p.item.back}</div>}
                <div className="quiz-back-row-actions">
                  {(['again', 'hard', 'good', 'easy'] as const).map(d => (
                    <button
                      key={d}
                      className="outline-button"
                      onClick={() => onReview(p.item.id, d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
        <footer className="quiz-back-footer">
          <span className="quiz-back-counter">
            Cards graded here update the schedule. The list won't refresh until you reopen.
          </span>
          <span className="cmdk-footer-spacer" />
          <button onClick={onClose} className="review-button">Done</button>
        </footer>
      </div>
    </div>
  )
}
