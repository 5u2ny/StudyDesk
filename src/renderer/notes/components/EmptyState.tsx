import React from 'react'

/** Reusable empty state for tabs and panels. Shows an icon, heading,
 *  description, and optional action button — visually anchored instead
 *  of floating gray text. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={40} className="empty-state-svg" /></span>
      <strong className="empty-state-title">{title}</strong>
      <p className="empty-state-desc">{description}</p>
      {action && onAction && (
        <button className="btn-primary empty-state-cta" onClick={onAction}>{action}</button>
      )}
    </div>
  )
}
