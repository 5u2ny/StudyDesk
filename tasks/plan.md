# UI Restructure Plan — Dashboard-First Architecture

## New App Flow
```
App Launch
  → Dashboard (home screen — all courses, status, reminders)
    → Click course card → Course Workspace (current shell with tabs)
    → Click + Add Course → AddCourseModal (details + syllabus)
    → Back button in workspace → returns to Dashboard
```

## Phases

### Phase 1: Dashboard home screen
Build a new `DashboardView` component that renders when no course is "entered."
The dashboard shows:
- Course cards (one per course, with color/code/name + quick stats)
- Add Course card (+ button, triggers AddCourseModal)
- Upcoming deadlines across ALL courses (next 7 days)
- Active reminders/alerts (unresolved, high-priority first)
- Quick stats summary (total cards due, assignments pending)

**State change**: New `appView` state: `'dashboard' | 'workspace'`
- `appView === 'dashboard'` → render DashboardView
- `appView === 'workspace'` → render current ShellContainer (course workspace)
- Entering a course: `setAppView('workspace')` + `setSelectedCourseId(id)`
- Back to dashboard: `setAppView('dashboard')`

### Phase 2: Add Course modal
Multi-step modal triggered from Dashboard's + card:
- Step 1: Name, code, professor, schedule
- Step 2: Paste/drop syllabus (optional, can skip)
- On submit: creates course, parses syllabus, enters that course's workspace

### Phase 3: Studio panel consolidation
Slim the right panel to 3 cards: Quiz, Flashcards, Resources

### Phase 4: Notes tab
Add Notes as a primary tab in the workspace tab strip

### Phase 5: Design pass
Token audit, light-theme, build verification
