# Workspace Bottom-Up Audit

**Repo:** /Users/e/Documents/GitHub/studydesk-hud-ui
**Date:** 2026-05-06
**Method:** code-evidence audit (three parallel agents) — central section, left side, right panel
**Scope:** UI → wiring → IPC → handlers → store

## Executive Summary

- **Overall status:** Mostly working with real data. The store → IPC → renderer pipeline is end-to-end intact for all major flows. No phantom IPC channels detected. Almost no hardcoded mock data. The product is in noticeably better shape than the surface noise suggests.
- **Biggest blocker:** None — there is no single failure that gates anything. The biggest *cumulative* issue is **silent no-op buttons** (bell, settings gear, sidebar collapse, Study/Questions row clicks) that erode trust because they look interactive but do nothing.
- **Highest-leverage fix:** **Wire the Study right-panel actions** (review buttons + resolve confusion) — the data is there, the IPC is there, the UI just doesn't dispatch. ~30 lines of code, removes two duplicate-looking-but-dead surfaces.
- **What not to touch yet:** The TipTap editor + slash menu + custom nodes (sourceQuote / footnote / data block / diagram). Editor toolbar is fully wired. Don't refactor.

---

## Central Section

### UI entity: Tab strip (10 tabs) + main panel
- **Files inspected:**
  - `src/renderer/notes/components/WorkspaceShell.tsx` (tab strip render)
  - `src/renderer/notes/App.tsx` (`WorkspaceSurface` switch around L1147; views inline at L1198+ for Today/Daily/Dashboard, L1674 Parser, L1886 Quiz, L2025 Cards, L2162 Syllabus, L2531 Class)
  - `src/renderer/notes/components/{Daily,Timeline,RelationMap}View.tsx`
  - `src/renderer/notes/Editor.tsx` + `editor/writingModes.ts`
  - `src/renderer/shared/ipc-contracts.ts`
- **Functional status:** Working (8 of 10 tabs); Partial (Quiz, Cards — heuristic, not AI as label implies)
- **Evidence (per tab):**

| Tab | Status | Wiring |
|---|---|---|
| Today | Working | Routes to `DocumentWorkspace`; full IPC for create/update/delete |
| Daily | Working | `DailyJournalView` filters real notes by dayKey + courseId; `notes:create` + `notes:update` set documentType=daily_entry |
| Dashboard | Working | Real `courses/deadlines/studyItems/alerts`; Complete/Resolve buttons hit `deadline:complete` / `attentionAlerts:resolve`, then `await refresh()` |
| Quiz | Partial | "Generate questions" is regex/heuristic on selectedText, NOT an LLM call. Save calls `notes:create`+`notes:update`; "Save as study questions" calls `study:create` per item |
| Cards | Partial | Same heuristic generation pattern. Review buttons call `study:review` correctly |
| Parser | Working | Full chain: `assignment:parse` → `assignment:create`/`update` → `notes:update` → `deadline:create`. Honest partial-failure messaging |
| Syllabus | Working | `syllabus:parse` → `syllabus:confirmImport` → `notes:update` with defensive defaults |
| Class | Working | `class:start`/`update`/`end`; `class:update` adds questions; `confusion:create` for unresolved Qs |
| Map | Working (read-only) | `react-force-graph-2d` over real data via `buildRelationGraph`; click opens note |
| Timeline | Working | Buckets real items by week; click opens note. DST-safe weekStart |

- **Editor toolbar (B/I/U/H2/list/quote/typewriter/focus):** All 8 buttons fire real TipTap chain commands. Typewriter and Focus are backed by `writingModes.ts` ProseMirror plugin with real DecorationSet — not visual-only toggles.
- **Problem:**
  1. **"Generate questions" / "Generate" labels imply AI** but implementation is regex matching `:`, "is/means/refers to" patterns — functional but cosmetically misleading.
  2. **Export silent failures:** `notes:exportMarkdown`, `notes:exportPdf`, `notes:exportSlides` swallow errors to `console.warn` only. User has no idea if the export failed (App.tsx L1484, 1493, 1502).
- **Recommended fix:** Rename "Generate" → "Extract candidates" (truth-in-labelling); surface export failures via the existing `setStatus()` toast.

---

## Left Panel

### UI entities: Icon rail + Sidebar
- **Files inspected:**
  - `src/renderer/notes/components/WorkspaceShell.tsx` (IconRail L44-95, LeftSidebar L122-280, SidebarRow L122-162)
  - `src/renderer/notes/App.tsx` (rail wiring L907-915; sidebar wiring L918-986; selectors L380-450)
- **Functional status:** Working (8 of 12 entities); Partial (3); Mock (1)
- **Evidence (per entity):**

| Entity | Status | Notes |
|---|---|---|
| "All courses" Layers chip | Working | `setSelectedCourseId(null)`; filters everywhere read `selectedCourseId` |
| Course chips (B, BU, …) | Working | Click sets `selectedCourseId`; `visibleNotes/Captures` filter; auto-selects first note as side-effect |
| "+" Add course | Working | Opens QuickAdd → `course:create` IPC |
| **IconRail Settings gear** | **Missing** | `onOpenSettings` prop is optional and **never passed** by App.tsx — gear never renders. Code is there, hookup isn't. |
| Workspace header (course label) | **Partial / Broken** | Falls back to `mostRecentlyCreatedCourse` when `selectedCourseId === null`. So clicking "All courses" highlights the rail chip but the **header keeps showing a specific course name**. Visible state mismatch. |
| Header collapse chevron | **Mock no-op** | `onCollapse={() => {/* future: hide left sidebar */}}` (App.tsx L920). Looks clickable, does nothing. |
| Search input | Working | `setSearchQuery`; flows into `filterItems(byCourse(notes), …)` and a captures adapter. Scope: notes + captures only — not deadlines/assignments/study items (placeholder text matches actual scope). |
| SYLLABUS IMPORTS section | Working | Real list. "{N} imported" badge counts parsed deadlines+assignments — not raw imported files; label is mildly ambiguous. |
| ASSIGNMENT PROMPTS section | Working | Real list, "parsed" badge tied to linked assignment. |
| NOTES section | Working | Real list, "N cards" badge counts real `studyItems`. |
| **CAPTURES section** | **Partial** | Header count uses `visibleCaptures.length` but list slices `(0, 30)`. **Badge can show 80, only 30 rows render**, no "show more". |
| Per-row active highlight | Working | `selected.id === note.id`; click sets `selected`. |

- **Problem:**
  1. Two visible no-ops (collapse chevron + missing settings gear). Either ship the behavior or remove the affordance.
  2. The "All courses" / header mismatch is jarring once noticed.
  3. Captures count vs visible rows mismatch — appears truncated arbitrarily.
- **Recommended fix:**
  - Remove the collapse chevron until it works.
  - Pass `onOpenSettings` from App.tsx (or remove from WorkspaceShell).
  - When `selectedCourseId === null`, the header should read "All courses".
  - Either add a "show more" / pagination to captures or change the count to "visible / total".

---

## Right Panel

### UI entities: Documents header + 4 sub-tabs (Sources, Materials, Study, Health) + bell + settings
- **Files inspected:**
  - `src/renderer/notes/App.tsx` (slots: `sourcesContent` L612, `materialsContent` L730, `studyContent` L802, `healthContent` L848; `RightPanel` props L1051-1067)
  - `src/renderer/notes/components/WorkspaceShell.tsx` (RightPanel L350-410)
  - `src/main/ipcHandlers.ts`, `src/main/services/calendar/icsExport.ts`
  - `src/renderer/shared/ipc-contracts.ts`
- **Functional status:** Working (10 of 16); Partial (3 — Snooze missing, Study readonly, Sources mislabelled); Mock (3 — bell, settings gear, deadline row when sourceId missing)
- **Evidence:**

| Entity | Status | Notes |
|---|---|---|
| Sub-tab strip (Sources/Materials/Study/Health) | Working | Real `RightTab` union; conditional render of 4 slots |
| DOCUMENTS header + close X | Working | `setRightPanelOpen(false)` |
| UPCOMING DEADLINES list | Working | `orderedVisibleDeadlines = byCourse.filter(!completed).sort(deadlineAt)` |
| OVERDUE / TODAY / Nd pills | Working | `Date.now()` delta math; previous TODAY-on-past-dates bug fixed (L633-636) |
| Deadline row click → open source | **Partial** | If `d.sourceId` missing or source note deleted, `onClick={undefined}` but row still styled as a button. No visual hint it's inert. |
| Export .ics button | Working | `calendar:exportDeadlines` IPC; handler in `icsExport.ts:104` with `dialog.showSaveDialog` |
| Export — historic deadlines | Partial | Hidden when no active deadlines. UI never sends `includeCompleted: true`, so historic .ics never available. |
| LOCAL ALERTS section | Working | Real `activeAlerts` filtered for not-resolved + not-dismissed. |
| Resolve | Working | `attentionAlerts:resolve` IPC + refresh |
| Dismiss | Working | `attentionAlerts:dismiss` IPC + refresh |
| **Snooze** | **Missing in workspace** | Channel `attentionAlerts:snooze` **exists** in contracts L104, mockAPI, ipcHandlers L552, AND is wired in `floating/App.tsx:338` — but the notes right panel never renders a Snooze button. Capability gap. |
| Materials — empty state | Working | "Pick a course in the rail…" |
| Materials — folder picker | Working | `course:pickMaterialsFolder` / `clearMaterialsFolder` |
| Materials — Imported files + Nx backref chip | Working | Real `materialsImportedFiles`; `countMaterialUsages` walks notes for sourceQuote refs |
| Publish static site | Working | `notes:publishStaticSite` IPC; emoji 📦 in label violates project style guidance |
| **Study sub-tab — Study Queue** | **Partial / readonly** | Reads real `dueStudyItems` but rows are plain `<div>`. **No review buttons**, unlike the Cards tab. Duplicates Cards data without the action. |
| **Study sub-tab — Unresolved Questions** | **Partial / readonly** | Renders `unresolvedConfusions` but no Resolve action despite `confusion:resolve` IPC existing. |
| Health sub-tab | Working | Pure-local lint via `lintNotes`/`summarizeIssues`; rows click to open offending note |
| **"Sources" sub-tab label** | **Mismatch** | Tab is *labelled* Sources but actually contains Upcoming Deadlines + Local Alerts. There is **no list of `sourceQuote` nodes or cited sources** anywhere in this slot. |
| **Bell icon** | **Mock** | `<button>` with no `onClick`. Red-dot indicator is hardcoded — unrelated to alerts/unread count. |
| **Settings gear** | **Mock** | No handler, no settings route reachable from this surface. |
| Right-panel collapse pill | Working | Toggles `rightPanelOpen`; collapsed-state badge shows real urgency from next-24h deadlines |

- **Problem (in order of severity):**
  1. **Bell + Settings gear are decorative.** Top-bar buttons that do nothing destroy trust.
  2. **Study sub-tab is dead weight.** Same data as Cards but readonly. Either wire the actions or remove the tab.
  3. **Sources tab label is wrong.** Either rename the tab or actually surface sourceQuote nodes there.
  4. **Snooze action is unreachable** from the workspace despite the IPC being wired end-to-end.
- **Recommended fix:**
  - Remove or wire the bell + settings gear.
  - Add Again/Hard/Good/Easy buttons to the Study Queue rows (call existing `onReviewStudyItem`).
  - Add "Resolve" button to Unresolved Questions rows (call existing `confusion:resolve`).
  - Add Snooze action to LOCAL ALERTS (mirror floating/App.tsx:338).
  - Either rename "Sources" → "Inbox" or "Today" (since it's deadlines+alerts), OR replace the tab body with a real Sources list that walks the active note for sourceQuote nodes.

---

## Cross-System Findings

- **State management:** Single source of truth = `~/Library/Application Support/focus-os/focus-os-store.json` via `focusStore`. Renderer has its own React state mirrors (`notes`, `captures`, `deadlines`, `studyItems`, `alerts`, `courses`, `confusions`, `classSessions`) hydrated by `refresh()` (App.tsx ~L281-298). After most mutations the code calls `await refresh()` to re-pull, with optimistic updates layered on top (notes specifically). This is consistent — no orphan local state.
- **Data flow:** IPC contracts in `src/renderer/shared/ipc-contracts.ts` are honored end-to-end. **All channels referenced by the workspace exist as handlers in `src/main/ipcHandlers.ts`.** Cross-checked across all three sections — zero phantom channels.
- **IPC/backend integration:** Working. Notable wiring quality:
  - Defensive parsing (e.g. `r.course ?? { code: '', name: '', term: '' }` in syllabus parser) prevents crashes on partial AI responses.
  - Honest error surfaces (Parser tab admits "some changes may have been written" on partial-save failure).
  - One legit gap: export operations swallow errors to `console.warn` instead of surfacing to user.
- **Mock vs real data:** Almost no hardcoded fakes. The only mock surfaces detected:
  - Bell icon's red dot (hardcoded, not state-driven)
  - Hover collapse chevron in sidebar (no-op on click)
  - "Generate questions" / "Generate" buttons that imply AI but use regex
  Nothing else is faked. The product is genuinely data-driven.

---

## Fix Priority

### P0 — visible no-ops or trust-eroding mismatches

1. **Wire or remove the bell + settings gear** in the workspace top bar. Two top-bar buttons with no `onClick` is the kind of detail that makes a product feel unfinished.
2. **Wire Study sub-tab actions.** Add the difficulty buttons to Study Queue rows (`onReviewStudyItem` already passed in) and a Resolve button to Unresolved Questions rows (`confusion:resolve` IPC exists). Until then, the tab duplicates Cards data with no agency.
3. **Fix "All courses" header mismatch.** When `selectedCourseId === null`, the workspace header label should read "All courses" — not the most-recently-created course's name. Currently a visible state mismatch with the rail.

### P1 — capability gaps

1. **Add Snooze button to LOCAL ALERTS** — IPC + handler exist; only the workspace UI is missing the affordance.
2. **Replace "Sources" tab content or rename the tab.** It contains Deadlines + Alerts. Either rename to "Inbox" / "Today" or make it actually list sourceQuote nodes from the active note.
3. **Surface export failures** (`notes:exportMarkdown/Pdf/Slides`) via the existing `setStatus()` toast instead of silent `console.warn`.
4. **Fix CAPTURES count vs slice mismatch.** Either show "30 of 80" or paginate.

### P2 — polish

1. Remove the no-op sidebar **collapse chevron** until the behavior ships, OR implement collapse (~10 lines, just toggles a state in WorkspaceShell).
2. Rename "Generate questions" / "Generate from document" → "Extract candidates" so the label matches the regex implementation, not LLM expectations.
3. **Clarify SYLLABUS IMPORTS "N imported" badge** — it counts parsed deadlines+assignments per syllabus note, not raw imported files. Use "N parsed" instead.
4. Persist `rightPanelOpen` and `rightTab` across restarts.
5. Make deadline rows without `sourceId` visually un-clickable (they currently look like buttons but `onClick={undefined}`).
6. Drop the 📦 emoji in the "Publish as static site…" label per CLAUDE.md style guidance.

---

## Next Implementation Plan

Single-batch ship that resolves every P0 + most of P1 in one commit (~2-3 days):

1. **Wire Study sub-tab.** Add Again/Hard/Good/Easy buttons to Study Queue rows (App.tsx L812 area, mirror Cards-tab L2147 pattern). Add Resolve button to Unresolved Questions rows (mirror class-session resolve). Hooks already present in props.
2. **Wire or remove top-bar bell + settings.** Either implement a notifications popover (read `attentionAlerts`, click-through to LOCAL ALERTS section) and a settings modal (open existing SettingsPanel from `floating/components/SettingsPanel.tsx`), or remove both buttons. **Recommend remove for now** — the data is already in LOCAL ALERTS and the Settings is reachable via the notch.
3. **Fix "All courses" header label.** In App.tsx L902 `searchSpaceLabel` computation, prefer `selectedCourse` over `currentCourse` so a null selection renders "All Courses" without falling back to the most-recent course.
4. **Add Snooze to LOCAL ALERTS.** Copy the snooze handler from `floating/App.tsx:338`. Inline date picker or fixed "+1 day"/"+1 week" presets.
5. **Surface export failures.** Replace each `console.warn('[exportXyz]', err)` with `setStatus(\`Export failed: ${err.message}\`)` so the bottom toast surfaces it.
6. **Rename "Sources" sub-tab → "Inbox"** until the tab actually contains source citations. One-line change in `WorkspaceShell.tsx:354`.

After this batch, the workspace has no visible no-ops, no UI/state mismatches, and no actions stranded behind unwired buttons. That's the floor for "feels finished" — and it's the right floor before starting Ticket 1.1 (the IA collapse from the implementation plan).
