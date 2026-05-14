// SurfSense-style three-column workspace shell.
// Layout structure mirrors `surfsense_web/components/layout/ui/shell/LayoutShell.tsx`:
//   [IconRail] [LeftSidebar] [resize] [MainPanel] [RightPanel]
// Styling matches: gap-2 p-2 outer, rounded-xl borders, bg-muted ambient, panel cards.

import React, { useState, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Settings,
  Bell,
  Folder,
  FileText,
  ClipboardList,
  Image as ImageIcon,
  GraduationCap,
  X,
  Layers,
  LayoutDashboard,
  CalendarDays,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'
import type { Course } from '@schema'
import { cn } from '@shared/lib/utils'

// ── IconRail ─────────────────────────────────────────────────────────────────
// Vertical narrow column, holds search-space avatars (we use Course avatars).
// Mirrors surfsense_web/components/layout/ui/icon-rail/IconRail.tsx
interface IconRailProps {
  courses: Course[]
  activeCourseId: string | null
  onSelectCourse: (courseId: string | null) => void
  onAddCourse: () => void
  onOpenSettings?: () => void
  onBackToDashboard?: () => void
}

export function IconRail({ courses, activeCourseId, onSelectCourse, onAddCourse, onOpenSettings, onBackToDashboard }: IconRailProps) {
  return (
    <div className="hidden md:flex w-[60px] shrink-0 flex-col items-center gap-2 py-2">
      {onBackToDashboard && (
        <>
          <button
            onClick={onBackToDashboard}
            className={cn(
              'group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              'border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.12]',
            )}
            title="Back to dashboard"
          >
            <LayoutDashboard size={16} className="text-white/70 group-hover:text-white" />
          </button>
          <div className="h-px w-6 bg-white/[0.08]" />
        </>
      )}
      {/* Per-course avatars */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-none">
        {courses.map(course => {
          const isActive = activeCourseId === course.id
          const initials = course.code?.slice(0, 2) ?? course.name.slice(0, 2).toUpperCase()
          return (
            <button
              key={course.id}
              onClick={() => onSelectCourse(course.id)}
              className={cn(
                'group relative w-10 h-10 rounded-xl flex items-center justify-center text-2xs font-bold transition-all',
                'border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.02]',
                'hover:scale-105 hover:border-white/[0.20]',
                isActive && 'ring-1 ring-blue-500/40 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
              )}
              title={course.name}
            >
              <span className="text-white/85">{initials}</span>
              {isActive && <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-blue-400" />}
            </button>
          )
        })}
        <button
          onClick={onAddCourse}
          className="w-10 h-10 rounded-xl flex items-center justify-center border border-dashed border-white/[0.12] text-white/40 hover:text-white/80 hover:border-white/[0.30] transition-colors"
          title="Add course"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="h-px w-6 bg-white/[0.08]" />
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      )}
    </div>
  )
}

// ── PanelCard ────────────────────────────────────────────────────────────────
// Generic rounded panel — same look as SurfSense's Sidebar/main/right cards.
export function PanelCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-xl border border-white/[0.06] bg-[var(--sd-ink-1)] flex flex-col overflow-hidden',
      className
    )}>{children}</div>
  )
}

// ── ChatStyleSidebarItem ─────────────────────────────────────────────────────
// Matches SurfSense's ChatListItem / SidebarButton row styling.
export interface SidebarRowProps {
  title: string
  meta?: string
  icon?: React.ReactNode
  badge?: { label: string; tone: 'imported' | 'parsed' | 'pending' | 'warning' | 'critical' }
  active?: boolean
  onClick?: () => void
}

export function SidebarRow({ title, meta, icon, badge, active, onClick }: SidebarRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left',
        'transition-all duration-120 ease-out',
        'hover:bg-white/[0.04]',
        active && 'bg-white/[0.07] hover:bg-white/[0.09]'
      )}
    >
      {/* Active indicator strip */}
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-blue-400/70" />}
      {icon && (
        <span className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
          'bg-white/[0.04] border border-white/[0.06] text-white/55',
          'group-hover:text-white/80 group-hover:border-white/[0.10]',
          'transition-colors duration-120',
          active && 'bg-blue-500/10 border-blue-500/25 text-blue-300 group-hover:text-blue-200'
        )}>
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={cn(
          'block text-sm font-semibold truncate transition-colors',
          active ? 'text-white' : 'text-white/85 group-hover:text-white'
        )}>{title || 'Untitled'}</span>
        {meta && <span className="block text-xs text-white/40 truncate mt-0.5">{meta}</span>}
      </span>
      {badge && (
        <span className={cn(
          'shrink-0 px-1.5 py-px rounded text-2xs font-bold uppercase tracking-wider whitespace-nowrap',
          badge.tone === 'imported' && 'bg-[var(--sd-success-soft)] text-[var(--sd-success)] border border-[var(--sd-success)]',
          badge.tone === 'parsed' && 'bg-blue-500/12 text-blue-300 border border-blue-500/20',
          badge.tone === 'pending' && 'bg-[var(--sd-warn-soft)] text-[var(--sd-warn)] border border-[var(--sd-warn)]',
          badge.tone === 'warning' && 'bg-[var(--sd-warn-soft)] text-[var(--sd-warn)] border border-[var(--sd-warn)]',
          badge.tone === 'critical' && 'bg-[var(--sd-danger-soft)] text-[var(--sd-danger)] border border-[var(--sd-danger)]',
        )}>{badge.label}</span>
      )}
    </button>
  )
}

// ── SidebarSection ───────────────────────────────────────────────────────────
// Collapsible section with count + add button. Matches SurfSense's SidebarSection.
interface SectionProps {
  title: string
  icon: LucideIcon
  count?: number
  onAdd?: () => void
  children: React.ReactNode
  defaultOpen?: boolean
}

export function SidebarSection({ title, icon: Icon, count, onAdd, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="px-2 py-1">
      <header className="flex items-center justify-between h-7 px-1 group">
        <button
          onClick={() => setOpen(p => !p)}
          className="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors"
        >
          <ChevronRight
            size={12}
            className={cn('transition-transform', open && 'rotate-90')}
          />
          <Icon size={12} />
          <span className="text-2xs font-bold uppercase tracking-wider">{title}</span>
          {typeof count === 'number' && count > 0 && (
            <span className="ml-1 px-1.5 py-px rounded text-2xs font-bold bg-white/[0.06] text-white/55 normal-case tracking-normal">
              {count}
            </span>
          )}
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.06] transition-all"
            title={`Add ${title}`}
          >
            <Plus size={11} />
          </button>
        )}
      </header>
      {open && <div className="mt-0.5 space-y-px">{children}</div>}
    </section>
  )
}

// ── LeftSidebar ──────────────────────────────────────────────────────────────
// "Sources" sidebar — chat-list-style notes/captures grouped by section.
interface LeftSidebarProps {
  searchSpaceLabel: string
  onCollapse: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  children: React.ReactNode      // SidebarSection[] from parent
  bottomSlot?: React.ReactNode    // Materials folder row, etc.
}

export function LeftSidebar({ searchSpaceLabel, onCollapse, searchQuery, onSearchChange, children, bottomSlot }: LeftSidebarProps) {
  return (
    <PanelCard className="hidden md:flex w-[280px] shrink-0">
      {/* Header */}
      <header className="flex items-center gap-2.5 h-11 px-3 border-b border-white/[0.06] shrink-0">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/25 to-purple-500/15 border border-white/[0.10] flex items-center justify-center shrink-0">
          <GraduationCap size={13} className="text-blue-300" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-md font-bold text-white truncate leading-tight">{searchSpaceLabel}</div>
        </div>
        <button
          onClick={onCollapse}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white/85 hover:bg-white/[0.06] transition-all"
          title="Collapse sidebar"
        >
          <ChevronLeft size={14} />
        </button>
      </header>
      {/* Search */}
      <div className="px-2.5 pt-2 pb-1.5 shrink-0">
        <div className={cn(
          'flex items-center gap-2 h-8 px-2.5 rounded-lg border transition-all',
          searchQuery
            ? 'bg-blue-500/[0.05] border-blue-500/30'
            : 'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.08] focus-within:bg-white/[0.06] focus-within:border-blue-500/35'
        )}>
          <Search size={11} className={cn('shrink-0 transition-colors', searchQuery ? 'text-blue-300' : 'text-white/40')} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search notes, captures…"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-white/95 placeholder:text-white/30"
            aria-label="Search notes"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="w-4 h-4 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.10] transition-all"
              aria-label="Clear search"
            >
              <X size={9} />
            </button>
          )}
        </div>
      </div>
      {/* Sections (scrollable) */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">{children}</div>
      {/* Bottom slot */}
      {bottomSlot && (
        <div className="px-3 py-2 border-t border-white/[0.06] shrink-0">{bottomSlot}</div>
      )}
    </PanelCard>
  )
}

// ── MainPanel ────────────────────────────────────────────────────────────────
interface MainPanelProps {
  tabs: Array<{ id: string; label: string; icon: React.ReactNode }>
  activeTabId: string
  onTabSelect: (id: string) => void
  rightActions?: React.ReactNode
  children: React.ReactNode
}

export function MainPanel({ tabs, activeTabId, onTabSelect, rightActions, children }: MainPanelProps) {
  const activeTab = tabs.find(t => t.id === activeTabId)
  return (
    <main className="flex-1 min-w-0 rounded-xl border border-white/[0.06] bg-[var(--sd-ink-1)] flex flex-col overflow-hidden">
      <header className="flex items-center h-11 px-2 border-b border-white/[0.06] shrink-0 gap-2">
        <nav role="tablist" className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map(tab => {
            const active = activeTabId === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => onTabSelect(tab.id)}
                title={tab.label}
                className={cn(
                  'flex items-center gap-1.5 h-8 px-2 rounded-md text-sm font-medium whitespace-nowrap shrink-0',
                  'transition-all duration-150',
                  active
                    ? 'bg-[var(--sd-accent)] text-white shadow-[0_8px_20px_rgba(40,123,255,0.20)] px-2.5'
                    : 'text-white/55 hover:text-white/90 hover:bg-white/[0.04]'
                )}
              >
                <span className="shrink-0 opacity-60">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
        {rightActions && <div className="flex items-center gap-0.5 shrink-0 pl-2 border-l border-white/[0.04]">{rightActions}</div>}
      </header>
      <div role="tabpanel" className="flex-1 overflow-auto scrollbar-thin">{children}</div>
      {activeTab && (
        <div className="sr-only" aria-live="polite">Active tool: {activeTab.label}</div>
      )}
    </main>
  )
}

// ── RightPanel (Documents) ───────────────────────────────────────────────────
type RightTab = 'sources' | 'materials' | 'study' | 'health'

interface RightPanelProps {
  open: boolean
  onClose: () => void
  activeTab: RightTab
  onTabChange: (tab: RightTab) => void
  sourcesSlot: React.ReactNode
  materialsSlot: React.ReactNode
  studySlot: React.ReactNode
  healthSlot: React.ReactNode
  /** Optional badge count for the Health tab (e.g. "3 issues"). */
  healthBadge?: number
}

export function RightPanel({ open, onClose, activeTab, onTabChange, sourcesSlot, materialsSlot, studySlot, healthSlot, healthBadge }: RightPanelProps) {
  if (!open) return null

  const tabs: Array<{ id: RightTab; label: string; icon: LucideIcon; badge?: number }> = [
    // Audit fix (P1.2): tab was labelled "Sources" but contains Upcoming
    // Deadlines + Local Alerts. Renamed to "Inbox" so the label matches
    // what the panel actually shows. Tab id stays 'sources' to avoid a
    // store/state migration.
    { id: 'sources', label: 'Inbox', icon: CalendarDays },
    { id: 'materials', label: 'Materials', icon: Folder },
    { id: 'study', label: 'Study', icon: Sparkles },
    { id: 'health', label: 'Health', icon: Target, badge: healthBadge },
  ]

  return (
    <PanelCard className="hidden md:flex w-[320px] shrink-0">
      <header className="flex items-center justify-between h-11 px-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <Folder size={11} className="text-white/65" />
          </span>
          <span className="text-xs uppercase tracking-wider text-white/65 font-bold">Documents</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white/85 hover:bg-white/[0.06] transition-all"
          title="Close panel"
        >
          <ChevronRight size={14} />
        </button>
      </header>
      {/* Segmented tab control */}
      <div className="px-2 pt-2 pb-2 shrink-0">
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          {tabs.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-semibold whitespace-nowrap',
                  'transition-all duration-150',
                  active
                    ? 'bg-white/[0.10] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                    : 'text-white/55 hover:text-white/90'
                )}
              >
                <Icon size={11} />
                {tab.label}
                {tab.badge && tab.badge > 0 && (
                  <span className="ml-0.5 px-1 py-px rounded text-2xs font-bold bg-[var(--sd-warn-soft)] text-[var(--sd-warn)] border border-[var(--sd-warn)]">{tab.badge > 9 ? '9+' : tab.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        {activeTab === 'sources' && sourcesSlot}
        {activeTab === 'materials' && materialsSlot}
        {activeTab === 'study' && studySlot}
        {activeTab === 'health' && healthSlot}
      </div>
    </PanelCard>
  )
}

// Right panel collapsed state — small expand pill on the right edge
export function RightPanelCollapsedButton({ onClick, badge }: { onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="hidden md:flex w-9 h-16 rounded-l-xl items-center justify-center border border-r-0 border-white/[0.06] bg-[var(--sd-ink-1)] hover:bg-[var(--sd-ink-2)] text-white/55 hover:text-white relative shrink-0 self-center transition-colors"
      title="Open Documents panel"
    >
      <ChevronLeft size={14} />
      {badge && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-2xs font-bold text-white flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ── ShellContainer ───────────────────────────────────────────────────────────
// Outer flexbox: gap-2 p-2 ambient bg.
export function ShellContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen gap-1.5 p-1.5 bg-[var(--sd-ink-0)] overflow-hidden text-white antialiased relative">
      {children}
    </div>
  )
}

export const FileIcons = { FileText, ClipboardList, ImageIcon, Folder, CalendarDays, Bell, Sparkles, Target }
