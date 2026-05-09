// Shared attention-alert predicates.
//
// Canonical "is this alert worth surfacing right now" check. The main
// process attentionAlertService used to own this as a module-private
// helper; the renderer's StudioPanel needs the same semantics so we
// don't drift (review C1 — StudioPanel was filtering on `status==='new'`
// and silently swallowed snooze-expired alerts).
//
// Pure function. Renderer-safe (no Node imports).

import type { AttentionAlert } from '@schema'

/** True if the alert should be visible in any "active alerts" surface.
 *  Excludes dismissed + resolved, and excludes snoozed alerts whose
 *  snooze window hasn't elapsed yet. Once `snoozedUntil` is in the
 *  past, snoozed alerts re-surface as active — that's the whole point
 *  of snooze, and the previous renderer-side `status === 'new'` filter
 *  was hiding them forever. */
export function isActiveAttentionAlert(alert: AttentionAlert, now = Date.now()): boolean {
  if (alert.status === 'dismissed' || alert.status === 'resolved') return false
  if (alert.status === 'snoozed' && (alert.snoozedUntil ?? 0) > now) return false
  return true
}
