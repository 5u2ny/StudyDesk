// CaptureInbox — collapsible sidebar section showing unlinked captures.
// Users can link individual captures to the active note, or create a new note
// from selected captures. Supports pagination (20 at a time).

import React, { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Link2, Plus, Inbox } from 'lucide-react'
import type { Capture } from '@schema'
import { cn } from '@shared/lib/utils'

export interface CaptureInboxProps {
  captures: Capture[]
  activeNoteId?: string
  onLink: (captureIds: string[], noteId: string) => Promise<void>
  onCreateNote: (captureIds: string[]) => Promise<void>
}

const PAGE_SIZE = 20

export function CaptureInbox({ captures, activeNoteId, onLink, onCreateNote }: CaptureInboxProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [busy, setBusy] = useState(false)

  const visible = captures.slice(0, visibleCount)
  const hasMore = captures.length > visibleCount

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleLinkSingle = useCallback(async (captureId: string) => {
    if (!activeNoteId || busy) return
    setBusy(true)
    try {
      await onLink([captureId], activeNoteId)
      setSelected(prev => { const next = new Set(prev); next.delete(captureId); return next })
    } finally { setBusy(false) }
  }, [activeNoteId, onLink, busy])

  const handleLinkSelected = useCallback(async () => {
    if (!activeNoteId || selected.size === 0 || busy) return
    setBusy(true)
    try {
      await onLink(Array.from(selected), activeNoteId)
      setSelected(new Set())
    } finally { setBusy(false) }
  }, [activeNoteId, selected, onLink, busy])

  const handleCreateFromSelected = useCallback(async () => {
    if (selected.size === 0 || busy) return
    setBusy(true)
    try {
      await onCreateNote(Array.from(selected))
      setSelected(new Set())
    } finally { setBusy(false) }
  }, [selected, onCreateNote, busy])

  if (captures.length === 0) return null

  return (
    <section className="capture-inbox">
      <button
        className="capture-inbox-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <Inbox size={13} />
        <span className="capture-inbox-title">Capture Inbox</span>
        <span className="capture-inbox-badge">{captures.length}</span>
      </button>

      {!collapsed && (
        <>
          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="capture-inbox-actions">
              <span className="capture-inbox-actions-label">{selected.size} selected</span>
              {activeNoteId && (
                <button
                  className="capture-inbox-action-btn"
                  onClick={handleLinkSelected}
                  disabled={busy}
                  title="Link selected to open note"
                >
                  <Link2 size={12} /> Link
                </button>
              )}
              <button
                className="capture-inbox-action-btn"
                onClick={handleCreateFromSelected}
                disabled={busy}
                title="Create new note from selected"
              >
                <Plus size={12} /> New note
              </button>
            </div>
          )}

          <ul className="capture-inbox-list">
            {visible.map(capture => {
              const isSelected = selected.has(capture.id)
              const preview = capture.text.length > 80
                ? capture.text.slice(0, 80) + '...'
                : capture.text
              const time = new Date(capture.createdAt)
              const timeStr = time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

              return (
                <li key={capture.id} className={cn('capture-inbox-item', isSelected && 'is-selected')}>
                  <label className="capture-inbox-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(capture.id)}
                    />
                  </label>
                  <div className="capture-inbox-item-body">
                    <p className="capture-inbox-item-text">{preview}</p>
                    <div className="capture-inbox-item-meta">
                      <span className="capture-inbox-item-source">{capture.sourceApp || capture.source}</span>
                      <span className="capture-inbox-item-time">{timeStr}</span>
                    </div>
                  </div>
                  {activeNoteId && (
                    <button
                      className="capture-inbox-link-btn"
                      onClick={() => handleLinkSingle(capture.id)}
                      disabled={busy}
                      title="Link to open note"
                    >
                      <Link2 size={12} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <button
              className="capture-inbox-load-more"
              onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            >
              Show more ({captures.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </section>
  )
}
