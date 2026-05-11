// NoteHealthBadge — small colored circle indicating note health.
// Green (80-100), Yellow (40-79), Red (0-39). Tooltip shows breakdown.

import React, { useMemo } from 'react'
import type { Note } from '@schema'
import { computeNoteHealthScore, type HealthColor } from '../lib/noteHealth'

export interface NoteHealthBadgeProps {
  note: Note
}

const COLOR_MAP: Record<HealthColor, string> = {
  green: 'var(--sd-success, #34d399)',
  yellow: 'var(--sd-warning, #fbbf24)',
  red: 'var(--sd-danger, #f87171)',
}

export function NoteHealthBadge({ note }: NoteHealthBadgeProps) {
  const health = useMemo(() => computeNoteHealthScore(note), [note])

  const tooltip = health.indicators
    .map(i => `${i.ok ? '✓' : '✗'} ${i.label}`)
    .join('\n')

  return (
    <span
      className="note-health-badge"
      title={`Health: ${health.score}/100\n${tooltip}`}
      style={{ '--health-color': COLOR_MAP[health.color] } as React.CSSProperties}
    />
  )
}
