# StudyDesk UI Restructure — Task List

## Phase 1: Dashboard home screen
- [ ] **T1** Add `appView` state (`'dashboard' | 'workspace'`) to App.tsx
- [ ] **T2** Build `DashboardView` component — course cards grid + add card
- [ ] **T3** Add cross-course summary: upcoming deadlines, reminders, stats
- [ ] **T4** Wire course card click → enter workspace for that course
- [ ] **T5** Add back-to-dashboard button in workspace header
- [ ] **T6** Dashboard CSS with design tokens

### Checkpoint: Dashboard renders as home, click enters workspace ⬜

## Phase 2: Add Course modal
- [ ] **T7** Build `AddCourseModal` — Step 1: name, code, professor, schedule
- [ ] **T8** Step 2: syllabus paste/drop (optional skip)
- [ ] **T9** Submit: create course + parse syllabus + enter workspace
- [ ] **T10** Wire from Dashboard + card and workspace + button

### Checkpoint: + opens modal, course created with syllabus ⬜

## Phase 3: Studio panel consolidation
- [ ] **T11** Remove Brief, Study guide, Generate study notes, Open questions
- [ ] **T12** Merge Quiz cards → single Quiz card with two modes
- [ ] **T13** Simplify Flashcards card
- [ ] **T14** Add Resources card
- [ ] **T15** Header → "Study tools"

### Checkpoint: exactly 3 Studio cards ⬜

## Phase 4: Notes tab
- [ ] **T16** Add `'notes'` to WorkspaceTool type + tools array
- [ ] **T17** Build NotesListView (course-filtered note list)
- [ ] **T18** Wire note click → editor

### Checkpoint: Notes tab functional ⬜

## Phase 5: Design pass
- [ ] **T19** Token audit on all new components
- [ ] **T20** Light-theme verification
- [ ] **T21** Full build: `tsc --noEmit` + `build:renderer`

### Checkpoint: all tasks complete ⬜
