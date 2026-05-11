// Relation map visualization (Trilium-inspired Note Map).
// Trilium uses vasturiano's force-graph; we use its React wrapper
// react-force-graph-2d. Read-only viz of all entity relations.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { Network, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { EmptyState } from './EmptyState'
import type { Note, Course, AcademicDeadline, Assignment, StudyItem, Capture } from '@schema'
import {
  buildRelationGraph,
  KIND_COLORS,
  RELATION_COLORS,
  type GraphNode,
  type GraphLink,
  type GraphNodeKind,
} from '../lib/relationGraph'

interface Props {
  notes: Note[]
  courses: Course[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  studyItems: StudyItem[]
  captures: Capture[]
  /** Filter to a single course; undefined shows everything. */
  courseId?: string
  /** Click a note node to open it in the editor. */
  onSelectNote?: (note: Note) => void
}

const LEGEND: Array<{ kind: GraphNodeKind; label: string }> = [
  { kind: 'course',     label: 'Course' },
  { kind: 'note',       label: 'Note' },
  { kind: 'deadline',   label: 'Deadline' },
  { kind: 'assignment', label: 'Assignment' },
  { kind: 'card',       label: 'Flashcard' },
  { kind: 'capture',    label: 'Capture' },
]

export function RelationMapView({
  notes, courses, deadlines, assignments, studyItems, captures,
  courseId, onSelectNote,
}: Props) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hovered, setHovered] = useState<GraphNode | null>(null)

  const graph = useMemo(
    () => buildRelationGraph({ notes, courses, deadlines, assignments, studyItems, captures, courseId }),
    [notes, courses, deadlines, assignments, studyItems, captures, courseId]
  )

  // Track container size so canvas fills its panel
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Auto-zoom to fit on first render after data is available
  useEffect(() => {
    if (!fgRef.current || graph.nodes.length === 0) return
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 60), 350)
    return () => clearTimeout(t)
  }, [graph])

  const handleNodeClick = (node: GraphNode) => {
    if (node.kind === 'note') {
      const n = notes.find(x => x.id === node.refId)
      if (n) onSelectNote?.(n)
    }
    // Center camera on click for visual feedback
    fgRef.current?.centerAt(
      (node as any).x ?? 0,
      (node as any).y ?? 0,
      400
    )
    fgRef.current?.zoom(2.5, 400)
  }

  if (graph.nodes.length === 0) {
    return (
      <EmptyState icon={Network} title="No connections yet" description="Add note links with [[brackets]] to build your relation map." />
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[var(--sd-ink-0)]">
      <ForceGraph2D
        ref={fgRef as any}
        graphData={graph}
        width={size.w || 800}
        height={size.h || 600}
        backgroundColor="#08080c"
        nodeId="id"
        nodeLabel={(n: GraphNode) => `${n.kind}: ${n.label}`}
        nodeRelSize={5}
        // Custom node renderer: filled circle + label below
        nodeCanvasObject={(node: GraphNode, ctx, globalScale) => {
          const x = (node as any).x ?? 0
          const y = (node as any).y ?? 0
          const r = node.kind === 'course' ? 8 : 5
          ctx.fillStyle = KIND_COLORS[node.kind]
          ctx.beginPath()
          ctx.arc(x, y, r, 0, 2 * Math.PI, false)
          ctx.fill()

          // Subtle outer ring for course (anchor) nodes
          if (node.kind === 'course') {
            ctx.strokeStyle = 'rgba(255,255,255,0.30)'
            ctx.lineWidth = 1.5
            ctx.stroke()
          }

          // Highlight hovered node
          if (hovered?.id === node.id) {
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'
            ctx.lineWidth = 2
            ctx.stroke()
          }

          // Label only when zoomed in enough to read it
          if (globalScale > 1.0) {
            const fontSize = 10 / globalScale
            ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`
            ctx.fillStyle = 'rgba(255,255,255,0.85)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            const text = node.label.length > 30 ? node.label.slice(0, 28) + '…' : node.label
            ctx.fillText(text, x, y + r + 2)
          }
        }}
        nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
          const x = (node as any).x ?? 0
          const y = (node as any).y ?? 0
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, 8, 0, 2 * Math.PI, false)
          ctx.fill()
        }}
        linkColor={(l: GraphLink) => RELATION_COLORS[l.relation]}
        linkWidth={1}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={0.85}
        cooldownTicks={100}
        onNodeClick={handleNodeClick}
        onNodeHover={(n: GraphNode | null) => setHovered(n)}
        enableNodeDrag={true}
      />

      {/* Legend */}
      <div className="absolute top-3 left-3 px-3 py-2 rounded-lg bg-[var(--sd-ink-1)] border border-white/[0.08] backdrop-blur-md">
        <div className="text-2xs uppercase tracking-wider text-white/45 font-bold mb-1.5">Relation Map</div>
        <div className="flex flex-col gap-1">
          {LEGEND.map(({ kind, label }) => {
            const count = graph.nodes.filter(n => n.kind === kind).length
            if (count === 0) return null
            return (
              <div key={kind} className="flex items-center gap-2 text-xs text-white/75">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: KIND_COLORS[kind] }}
                />
                <span className="flex-1">{label}</span>
                <span className="text-white/40 font-mono text-2xs">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Node tooltip on hover */}
      {hovered && (
        <div className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-[var(--sd-ink-1)] border border-white/[0.10] backdrop-blur-md max-w-[320px]">
          <div className="text-2xs uppercase tracking-wider font-bold mb-1" style={{ color: KIND_COLORS[hovered.kind] }}>
            {hovered.kind}
          </div>
          <div className="text-sm text-white font-semibold truncate">{hovered.label}</div>
          {hovered.meta && <div className="text-xs text-white/55 mt-0.5">{hovered.meta}</div>}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => fgRef.current?.zoom((fgRef.current.zoom() ?? 1) * 1.4, 250)}
          className="w-8 h-8 rounded-md bg-[var(--sd-ink-1)] border border-white/[0.08] flex items-center justify-center text-white/65 hover:text-white hover:bg-white/[0.06]"
          title="Zoom in"
        >
          <ZoomIn size={13} />
        </button>
        <button
          onClick={() => fgRef.current?.zoom((fgRef.current.zoom() ?? 1) / 1.4, 250)}
          className="w-8 h-8 rounded-md bg-[var(--sd-ink-1)] border border-white/[0.08] flex items-center justify-center text-white/65 hover:text-white hover:bg-white/[0.06]"
          title="Zoom out"
        >
          <ZoomOut size={13} />
        </button>
        <button
          onClick={() => fgRef.current?.zoomToFit(400, 60)}
          className="w-8 h-8 rounded-md bg-[var(--sd-ink-1)] border border-white/[0.08] flex items-center justify-center text-white/65 hover:text-white hover:bg-white/[0.06]"
          title="Fit to screen"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}
