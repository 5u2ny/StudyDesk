// DashboardView — the home screen.
//
// Shows all courses as cards, cross-course deadlines, reminders, and
// quick stats. This is the first thing the user sees on launch.
// Clicking a course card enters that course's workspace.

import React, { useMemo } from 'react'
import {
  CalendarDays,
  Bell,
  ClipboardList,
  BookOpen,
  Plus,
  ChevronRight,
  GraduationCap,
  Clock3,
  Layers,
} from 'lucide-react'
import type { Course, AcademicDeadline, AttentionAlert, Assignment, StudyItem } from '@schema'
import { cn } from '@shared/lib/utils'

export interface DashboardViewProps {
  courses: Course[]
  deadlines: AcademicDeadline[]
  alerts: AttentionAlert[]
  assignments: Assignment[]
  studyItems: StudyItem[]
  onEnterCourse: (courseId: string) => void
  onAddCourse: () => void
}

// ── Color palette for course cards ──
const CARD_COLORS = [
  { bg: 'var(--sd-accent-soft)', border: 'var(--sd-accent)', text: 'var(--sd-accent)' },
  { bg: 'rgba(168, 85, 247, 0.10)', border: '#a855f7', text: '#a855f7' },
  { bg: 'rgba(236, 72, 153, 0.10)', border: '#ec4899', text: '#ec4899' },
  { bg: 'rgba(20, 184, 166, 0.10)', border: '#14b8a6', text: '#14b8a6' },
  { bg: 'rgba(245, 158, 11, 0.10)', border: '#f59e0b', text: '#f59e0b' },
  { bg: 'rgba(99, 102, 241, 0.10)', border: '#6366f1', text: '#6366f1' },
]

function cardColor(index: number) {
  return CARD_COLORS[index % CARD_COLORS.length]
}


function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardView({
  courses,
  deadlines,
  alerts,
  assignments,
  studyItems,
  onEnterCourse,
  onAddCourse,
}: DashboardViewProps) {
  const now = Date.now()

  // Cross-course stats
  const upcomingDeadlines = useMemo(
    () => [...deadlines]
      .filter(d => !d.completed && d.deadlineAt > now)
      .sort((a, b) => a.deadlineAt - b.deadlineAt)
      .slice(0, 8),
    [deadlines, now],
  )

  const activeAlerts = useMemo(
    () => alerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed'),
    [alerts],
  )

  const pendingAssignments = useMemo(
    () => assignments.filter(a => a.status !== 'archived' && a.status !== 'submitted'),
    [assignments],
  )

  const dueStudyItems = useMemo(
    () => studyItems.filter(i => !i.nextReviewAt || i.nextReviewAt <= now),
    [studyItems, now],
  )

  // Per-course quick stats
  const courseStats = useMemo(() => {
    const map: Record<string, { deadlineCount: number; cardsDue: number; assignmentCount: number }> = {}
    for (const c of courses) {
      map[c.id] = {
        deadlineCount: deadlines.filter(d => d.courseId === c.id && !d.completed).length,
        cardsDue: studyItems.filter(s => s.courseId === c.id && (!s.nextReviewAt || s.nextReviewAt <= now)).length,
        assignmentCount: assignments.filter(a => a.courseId === c.id && a.status !== 'archived' && a.status !== 'submitted').length,
      }
    }
    return map
  }, [courses, deadlines, studyItems, assignments, now])

  return (
    <div className="dashboard-home">
      {/* Header */}
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{greeting()}</h1>
          <p className="dashboard-subtitle">Your courses at a glance</p>
        </div>
        <div className="dashboard-quick-stats">
          <StatPill icon={<Clock3 size={13} />} value={upcomingDeadlines.length} label="deadlines" />
          <StatPill icon={<Layers size={13} />} value={dueStudyItems.length} label="cards due" />
          <StatPill icon={<ClipboardList size={13} />} value={pendingAssignments.length} label="assignments" />
          <StatPill icon={<Bell size={13} />} value={activeAlerts.length} label="reminders" />
        </div>
      </header>

      <div className="dashboard-body">
        {/* ── Course cards grid ── */}
        <section className="dashboard-section">
          <h2 className="dashboard-section-title">
            <GraduationCap size={16} />
            My Courses
          </h2>
          <div className="dashboard-courses-grid">
            {courses.filter(c => !c.archived).map((course, i) => {
              const color = cardColor(i)
              const stats = courseStats[course.id]
              return (
                <button
                  key={course.id}
                  className="dashboard-course-card"
                  onClick={() => onEnterCourse(course.id)}
                  style={{
                    '--card-bg': color.bg,
                    '--card-border': color.border,
                    '--card-text': color.text,
                  } as React.CSSProperties}
                >
                  <div className="dashboard-course-code">
                    {course.code ?? course.name.slice(0, 8)}
                  </div>
                  <div className="dashboard-course-name">{course.name}</div>
                  {course.professorName && (
                    <div className="dashboard-course-prof">{course.professorName}</div>
                  )}
                  <div className="dashboard-course-stats">
                    {stats && stats.deadlineCount > 0 && (
                      <span><CalendarDays size={11} /> {stats.deadlineCount}</span>
                    )}
                    {stats && stats.cardsDue > 0 && (
                      <span><Layers size={11} /> {stats.cardsDue} due</span>
                    )}
                    {stats && stats.assignmentCount > 0 && (
                      <span><ClipboardList size={11} /> {stats.assignmentCount}</span>
                    )}
                  </div>
                  <ChevronRight size={16} className="dashboard-course-arrow" />
                </button>
              )
            })}

            {/* Add course card */}
            <button className="dashboard-add-card" onClick={onAddCourse}>
              <Plus size={24} />
              <span>Add Course</span>
            </button>
          </div>
        </section>

        {/* ── Upcoming deadlines ── */}
        {upcomingDeadlines.length > 0 && (
          <section className="dashboard-section">
            <h2 className="dashboard-section-title">
              <CalendarDays size={16} />
              Upcoming Deadlines
            </h2>
            <div className="dashboard-list">
              {upcomingDeadlines.map(d => {
                const daysLeft = Math.ceil((d.deadlineAt - now) / 86_400_000)
                const courseName = courses.find(c => c.id === d.courseId)?.code ?? ''
                return (
                  <div key={d.id} className="dashboard-list-row">
                    <div className="dashboard-list-main">
                      <span className="dashboard-list-title">{d.title}</span>
                      {courseName && <span className="dashboard-list-tag">{courseName}</span>}
                    </div>
                    <span className={cn(
                      'dashboard-list-meta',
                      daysLeft <= 1 && 'is-urgent',
                      daysLeft <= 3 && daysLeft > 1 && 'is-warning',
                    )}>
                      {daysLeft <= 0 ? 'Overdue' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days`}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Reminders / alerts ── */}
        {activeAlerts.length > 0 && (
          <section className="dashboard-section">
            <h2 className="dashboard-section-title">
              <Bell size={16} />
              Reminders
            </h2>
            <div className="dashboard-list">
              {activeAlerts.slice(0, 6).map(a => {
                const courseName = courses.find(c => c.id === a.courseId)?.code ?? ''
                return (
                  <div key={a.id} className="dashboard-list-row">
                    <div className="dashboard-list-main">
                      <span className="dashboard-list-title">{a.title}</span>
                      {courseName && <span className="dashboard-list-tag">{courseName}</span>}
                    </div>
                    <span className={cn(
                      'dashboard-list-meta',
                      (a.priority === 'critical' || a.priority === 'high') && 'is-urgent',
                    )}>
                      {a.priority}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="dashboard-stat-pill">
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
