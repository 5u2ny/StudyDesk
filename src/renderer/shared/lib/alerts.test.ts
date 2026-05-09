import { describe, it, expect } from 'vitest'
import { isActiveAttentionAlert } from './alerts'
import type { AttentionAlert } from '@schema'

const a = (overrides: Partial<AttentionAlert> = {}): AttentionAlert => ({
  id: '1',
  sourceType: 'deadline',
  title: 't',
  reason: 'r',
  actionLabel: 'go',
  priority: 'medium',
  status: 'new',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

describe('isActiveAttentionAlert', () => {
  it('treats new alerts as active', () => {
    expect(isActiveAttentionAlert(a({ status: 'new' }))).toBe(true)
  })
  it('treats dismissed as inactive', () => {
    expect(isActiveAttentionAlert(a({ status: 'dismissed' }))).toBe(false)
  })
  it('treats resolved as inactive', () => {
    expect(isActiveAttentionAlert(a({ status: 'resolved' }))).toBe(false)
  })
  it('treats unexpired-snoozed as inactive (Critical C1 prove-it)', () => {
    const now = 1_000_000
    expect(isActiveAttentionAlert(a({ status: 'snoozed', snoozedUntil: now + 60_000 }), now)).toBe(false)
  })
  it('treats expired-snoozed as ACTIVE again (Critical C1 prove-it)', () => {
    // The bug the StudioPanel had: it filtered on `status === 'new'`
    // alone, so snoozed alerts whose snooze window had passed never
    // re-surfaced. Pin the right behavior.
    const now = 1_000_000
    expect(isActiveAttentionAlert(a({ status: 'snoozed', snoozedUntil: now - 1 }), now)).toBe(true)
  })
  it('treats snoozed-without-snoozedUntil as active (defensive)', () => {
    // Defensive: if snoozedUntil is missing, treat the snooze as
    // already-elapsed (1970 default) and surface the alert.
    expect(isActiveAttentionAlert(a({ status: 'snoozed' }))).toBe(true)
  })
})
