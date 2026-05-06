# StudyDesk Implementation Plan — Connect the Islands

**Date:** 2026-05-06
**Author:** product-brainstorming session
**Status:** plan, not yet executed

## North Star

> The biggest "more useful" win is **connecting what already exists**, not adding an 8th island.

The current product has all the parts (timer, cards, captures, notes, deadlines, lo-fi, courses) but they're decoupled. A user who actually wants to study has to manually orchestrate them. The plan below threads them into loops the user follows by default.

## Strategy in one paragraph

Don't add — wire things up. Cut the surface area (10 tabs → 6), add a single command palette as the primary navigator, and turn three currently-disconnected screens (Today, Captures inbox, Pomodoro) into actual workflows. By Week 3, each existing feature pulls double-duty inside a loop, and the product feels 2× more useful without a single new island.

---

## Week 1 — Compression + Discoverability

Goal: the product feels 2× more usable on day one without adding a single feature.

### Ticket 1.1 — IA collapse (10 → 6 tabs)

**Why:** Daily/Today are duplicates. Quiz/Cards overlap. Syllabus/Parser are *actions* mistakenly modelled as destinations. Map and Timeline are mostly empty.

**Final tab list (per-course workspace):**
1. **Today** — triage screen (see Ticket 1.3)
2. **Notes** — the writing surface; daily entries become a *note type*, not a tab
3. **Deadlines** — list view, with Timeline collapsed in as a view-mode toggle
4. **Cards** — flashcards + quiz queue merged
5. **Materials** — readings, syllabus, imports
6. **Class** — live class capture mode

**Out:**
- `Daily` → merged into Today
- `Quiz` → merged into Cards
- `Syllabus`, `Parser` → become `+ Import` menu items on the course shell
- `Map` → demoted to Notes view-mode toggle ("show relation graph")
- `Timeline` → demoted to Deadlines view-mode toggle
- `Dashboard` → becomes the default "All Courses" view when no course is selected (course-rail click → enters that course's tabs)

**Files affected:**
- `src/renderer/notes/App.tsx` — `tools` array, `WorkspaceTool` type union, `WorkspaceSurface` switch
- `src/renderer/notes/components/WorkspaceShell.tsx` — tab strip already handles fewer tabs cleanly

**Acceptance:**
- Tab strip shows exactly 6 items + bell + settings
- All 10 prior surfaces still reachable (some via view toggle, some via `+ Import`)
- 246 tests still passing

---

### Ticket 1.2 — Cmd-K command palette

**Why:** A single keyboard shortcut beats clicking through 6 tabs. After this lands, the tab strip is rarely the primary navigator — it's just orientation.

**Spec:**
- Trigger: `Cmd+K` (renderer global)
- Single fuzzy-search input over all of: notes, captures, deadlines, courses, study items, workspace tabs, slash actions
- Categories shown inline (`▸ Note`, `▸ Capture`, `▸ Action`)
- Type a `/` prefix to filter to actions: `/import`, `/cram`, `/start-focus`
- Enter → navigate / execute. Esc → close.
- No backend; fuzzy match runs locally over the in-memory store

**Library:** `cmdk` (~6 KB, Vercel) or roll a thin wrapper around the existing `filterDsl.ts`. Going with `cmdk` for ship speed.

**Files to add:**
- `src/renderer/notes/components/CommandPalette.tsx`
- `src/renderer/notes/lib/commandPaletteSources.ts` — pluggable source providers

**Acceptance:**
- Cmd-K opens from any workspace tab in <100ms
- Top 10 results render for any 2+ char query
- Action commands (`/cram`, `/start-focus`, `/import`) execute without leaving the palette

---

### Ticket 1.3 — Today as actual triage

**Why:** Today is currently a Daily entry with an empty body — wasted real estate on app launch. Replace with a Linear-style triage screen the user can act on without clicking through.

**Sections (top-to-bottom):**
1. **Due today** — list with one-click Done
2. **Overdue** — Resolve / Snooze / Reschedule
3. **Due this week** — readonly preview
4. **Study queue** — 3 cards inline with Again / Hard / Good / Easy
5. **Recent captures** — one-click `→ Note` / `→ Flashcard` / `→ Deadline` / `→ Trash`

All actions inline; no modal navigation required.

**Files affected:**
- New: `src/renderer/notes/views/TodayView.tsx`
- `src/renderer/notes/App.tsx` — replace `case 'today'` body in `WorkspaceSurface`

**Acceptance:**
- All 5 sections render in scoped course context
- Every action is one click + one keypress reachable
- Empty state for each section is friendly, not blank

---

## Week 2 — Wire the Loops

Goal: connect the islands so existing features pull double-duty.

### Ticket 2.1 — Captures inbox triage mode

**Why:** Captures pool at 80+. Nobody triages a long list. Captures need to *flow*, not pool.

**Spec:**
- New "Process inbox" button in Today's "Recent captures" section
- Modal full-screen takeover: one capture at a time
- Four large buttons: `→ Note` · `→ Flashcard` · `→ Deadline` · `→ Trash`
- Hotkeys 1-2-3-4 + arrow keys for navigation
- Burndown counter: `47 of 80 left`
- Saves progress; closing mid-process resumes where you left off

**Pattern reference:** Hey email triage, Anki card review.

**Files:**
- New: `src/renderer/notes/components/CapturesInboxModal.tsx`

**Acceptance:**
- A user can clear an 80-item inbox in <5 minutes with keyboard only

---

### Ticket 2.2 — Focus Session = course-scoped loop

**Why:** The Pomodoro timer is divorced from content. A 25-minute session should be a *unit of work* tied to a course, not just a clock.

**Spec:**
- New affordance on the notch: hover → "Start session for [BUAD 6621]" (default = current course)
- During the session:
  - Cards tab auto-filters to that course
  - Editor opens the most-recently-edited note for that course
  - Lo-fi plays (respects existing user preference)
  - New captures auto-tag to the session course
- Session-end ring: summary card — "5 cards reviewed · 200 words written · 3 captures · 1 deadline closed"
- Summary persists as a `class_session` record so the user has a logbook

**Files affected:**
- `src/renderer/floating/App.tsx` — start-session affordance
- `src/main/timerEngine.ts` — emit session-bound events
- `src/main/services/classSessionService.ts` — create session record on start, close on end
- `src/renderer/notes/App.tsx` — listen for `session:start` and apply course filter

**Acceptance:**
- Starting a session from the notch auto-scopes the workspace
- Ending a session shows the summary card
- Sessions are persisted and queryable

---

## Week 3+ — Cram Mode

Goal: own the "final exam in 3 days" use case.

### Ticket 3.1 — Cram Mode

**Why:** StudyDesk is currently for *during* the semester. Cram mode is for the moment of truth — exam week. This is the use case that turns a daily-driver app into a tool a student can't graduate without.

**Spec:**
- Trigger: command palette → `/cram` or course header → "Plan cram"
- Form: which course, exam date, hours per day
- App generates a 3-day plan:
  - Day 1: review all flashcards in priority order (overdue first, weakest cards next)
  - Day 2: re-read top captures + practice questions derived from your notes
  - Day 3: simulated exam from your saved Quiz Builder questions + retired assignment prompts
- Each day's plan auto-creates 4-6 Focus Sessions (Ticket 2.2) with pre-loaded content
- "Resume cram" pinned to Today until exam date passes

**Files:**
- New: `src/renderer/notes/views/CramView.tsx`
- New: `src/main/services/cramService.ts`

**Acceptance:**
- A user with an MBA exam in 3 days can start the cram in one click and have a session-by-session plan
- Plan adapts if user falls behind (rolls remaining flashcards into next session)
- Exam-day Today shows a "good luck" banner with a 1-line summary of what was covered

---

## What we explicitly cut

These came up but were rejected — keeping the cut list explicit so they don't accumulate as scope.

- **Templates per student-type** — the user said this is for later; do not build now
- **Multi-user collaboration / sharing** — out of scope; local-first stays
- **Mobile companion** — different product
- **AI tutor / chatbot** — wrong product; user explicitly said no
- **Calendar-app sync (Apple, Google)** — feature-parity trap; ICS export already covers the want
- **Anki / Notion export** — same trap

---

## Success metrics (qualitative for now)

After Week 1:
- User can navigate the entire app via Cmd-K without touching the tab strip
- App-launch screen (Today) requires zero clicks to be useful

After Week 2:
- Captures inbox stays under 20 items at any time (proxy: triage adoption)
- Focus Sessions are started from the notch ≥3× per study day (proxy: loop adoption)

After Week 3:
- Cram Mode is started ≥1× per course before any exam in the seeded BUAD 6621 syllabus

---

## Riskiest assumption

That the user will *actually* trust the Today triage screen instead of going straight to a tab they recognize. **Mitigation:** make Today the default route on launch (it already is), and have the empty state of every other tab include a "← Back to Today" hint for the first week.
