import React from 'react'
import { Loader2 } from 'lucide-react'

/** Shared spinner for async loading states. Uses the `.spin` keyframe
 *  animation defined in notes.css. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`spin ${className}`.trim()} aria-label="Loading" />
}
