# Notes Tab Architecture

## 1. Component Tree

```
App.tsx (existing — owns all state)
├── WorkspaceShell (existing — 3-column layout)
│   ├── IconRail (existing — course selection)
│   ├── LeftSidebar (existing — tool nav + note list)
│   │   ├── NotesListView (existing — extended with capture badge + type filter)
│   │   └── CaptureInbox (NEW)
│   │       ├── CaptureInboxHeader (count badge, collapse toggle)
│   │       └── CaptureInboxItem[] (text preview, link/create actions)
│   ├── MainPanel
│   │   ├── Editor (existing — TipTap)
│   │   │   └── CaptureInsertBlock (NEW — inline dropped capture)
│   │   └── MaterialsReaderView (NEW — read-only + annotation mode)
│   │       ├── MaterialsToolbar (highlight, annotate)
│   │       └── TipTap EditorContent (read-only with highlight marks)
│   └── RightPanel
│       └── StudioPanel (existing — extended)
│           ├── StudioCard[quiz] (existing)
│           ├── StudioCard[flashcards] (existing)
│           ├── StudioCard[ai-notes] (NEW)
│           │   ├── GenerateNotesButton
│           │   ├── SummarizeButton
│           │   └── MergeNotesButton
│           ├── StudioCard[note-health] (NEW)
│           │   └── NoteHealthIndicators
│           ├── StudioCard[related] (NEW)
│           │   └── RelatedNotesList
│           └── StudioCard[resources] (existing)
```

## 2. Data Flow

```
                    ┌─────────────────────────────────────────────┐
                    │              Main Process                     │
                    │                                               │
  Clipboard/AX ──► │ captureService ──► focusStore.captures[]     │
                    │                                               │
  Folder Watcher ─► │ folderWatcherService ──► IPC event ──────────┼──┐
                    │                                               │  │
                    │ notesService  (CRUD notes)                    │  │
                    │ generationService (Ollama IPC handlers)       │  │
                    └───────────────────────────────────────────────┘  │
                                                                       │
                    ┌──────────────────────────────────────────────┐   │
                    │             Renderer Process                   │   │
                    │                                                │   │
                    │  App.tsx state:                                │   │
                    │    captures[]  ◄── capture:list IPC            │   │
                    │    notes[]     ◄── notes:list IPC              │   │
                    │                                                │   │
  folder:detected ──┼───────────────────────────────────────────────┼───┘
  (IPC event)       │         │                                     │
                    │         ▼                                     │
                    │  extractFileText() → notes:create             │
                    │  (documentType: 'reading',                    │
                    │   capturedFromIds: [], courseId: X)            │
                    │                                                │
                    │  CaptureInbox ──── user clicks "Link" ────►   │
                    │                    notes:update (append to     │
                    │                    content + push to           │
                    │                    capturedFromIds[])          │
                    │                                                │
                    │  AI Actions:                                   │
                    │    [Generate Notes] ──► ai:generateStudyNotes │
                    │    [Summarize]      ──► ai:generateStudyNotes │
                    │    [Merge]          ──► notes:create (local   │
                    │                         concat, no AI needed)  │
                    │                                                │
                    │  Auto-tag:                                     │
                    │    On note save ──► autoCategorize (main)      │
                    │    Result ──► notes:update({ tags: [...] })    │
                    └──────────────────────────────────────────────┘
```

### Capture-to-Note Lifecycle

1. User highlights text anywhere on macOS
2. `captureService` fires, saves `Capture` to store
3. Renderer polls `capture:list`, shows in `CaptureInbox`
4. User links capture to note: renderer calls `notes:update` with content patch + `capturedFromIds` push
5. Badge on `NotesListView` card shows `capturedFromIds.length > 0`

### Materials-to-Note Lifecycle

1. `folderWatcherService` detects new file in course materials folder
2. Emits `folder:detected` IPC event to renderer
3. Renderer calls `extractFileText(path)` (existing, in `src/renderer/notes/lib/extractFileText.ts`)
4. Renderer calls `notes:create` with `{ documentType: 'reading', courseId, content: tiptapJson }`
5. Renderer calls `folder:recordImport` to update `MaterialsImportRecord`
6. Reading note appears in sidebar under "readings" filter

### AI Generation Flow

1. User clicks "Generate Notes" in StudioPanel
2. Renderer collects: `activeNote.content` + all captures in `capturedFromIds` + related reading notes (same courseId, documentType: 'reading')
3. Concatenates into a single context string (truncated to ~8000 chars for Ollama context window)
4. Calls `ipc.invoke('ai:generateStudyNotes', { noteContent: context })`
5. On success: creates new note with generated content, links back via `parentId`
6. On failure (Ollama offline): shows toast "AI unavailable - start Ollama to use this feature"

## 3. New IPC Contracts Needed

Minimal additions to `src/renderer/shared/ipc-contracts.ts`:

```typescript
// Add to IPCContracts interface:

// Capture linking (batch operation)
'capture:linkToNote': {
  req: { captureIds: string[]; noteId: string };
  res: { note: Note; linked: number };
};

// Unlinked captures query (avoids filtering in renderer for large capture sets)
'capture:unlinked': {
  req: { courseId?: string; limit?: number };
  res: Capture[];
};

// AI: summarize (reuses generateStudyNotes internally but with different prompt framing)
'ai:summarize': {
  req: { content: string; maxLength?: number };
  res: string;
};

// Auto-tag (expose the main-process autoCategorize to be called on-demand)
'notes:autoTag': {
  req: { noteId: string };
  res: { tags: string[] };
};
```

**Why only 4 new channels:**
- `capture:linkToNote` — batch link avoids N round-trips when linking multiple captures
- `capture:unlinked` — filtering in main is cheaper for large capture stores; avoids sending all captures to renderer just to filter
- `ai:summarize` — distinct UX from "generate study notes" (shorter output, different system prompt)
- `notes:autoTag` — makes auto-tagging callable on-demand from UI, reuses existing `autoCategorize` logic

All other operations (merge notes, create reading note, etc.) compose from existing IPC contracts.

## 4. File-by-File Implementation Plan

### Phase 1: Capture Sync (Foundation)

**File: `src/main/services/capture/captureService.ts`**
- No changes needed (already saves captures correctly)

**File: `src/main/ipcHandlers.ts` (or wherever IPC handlers are registered)**
- Add handler for `capture:linkToNote`:
  - Read note by id
  - Parse TipTap JSON content
  - Append a `sourceQuote` node for each capture's text
  - Push each captureId to `note.capturedFromIds`
  - Call `notesService.update()`
  - Return updated note + count
- Add handler for `capture:unlinked`:
  - Read all captures
  - Read all notes' `capturedFromIds` arrays
  - Return captures whose id does not appear in any note's `capturedFromIds`
  - Filter by courseId if provided
- **Acceptance:** `ipc.invoke('capture:linkToNote', { captureIds: ['x'], noteId: 'y' })` returns updated note with capture text appended

**File: `src/renderer/shared/ipc-contracts.ts`**
- Add the 4 new channel type definitions listed above
- **Acceptance:** TypeScript compiles without error

**File: `src/renderer/notes/components/CaptureInbox.tsx` (NEW)**
- Props: `{ captures: Capture[]; onLink: (captureId: string) => void; onCreateNote: (captureIds: string[]) => void; courseId?: string }`
- Renders collapsible section with badge count
- Each item shows: text preview (80 chars), source app icon, timestamp, "Link to open note" button, "New note from this" button
- Multi-select mode: checkbox per item, "Create note from selected" action
- **Acceptance:** Renders in sidebar; clicking "Link" calls parent handler; empty state when 0 unlinked captures

**File: `src/renderer/notes/components/NotesListView.tsx` (MODIFY)**
- Add capture badge: show a small dot/count indicator on cards where `note.capturedFromIds.length > 0`
- Add "readings" and "captures" to `DOC_TYPE_LABELS` map
- **Acceptance:** Cards with linked captures show visual indicator; filter chips include "Reading" type

**File: `src/renderer/notes/App.tsx` (MODIFY)**
- Add state: `unlinkedCaptures` (fetched via `capture:unlinked`)
- Add `CaptureInbox` to sidebar below notes list
- Wire `onLink` handler: calls `capture:linkToNote` then refreshes notes + unlinked captures
- Wire `onCreateNote`: calls `notes:create` with concatenated capture text, then `capture:linkToNote`
- **Acceptance:** Sidebar shows capture inbox; linking a capture removes it from inbox and adds to note

### Phase 2: Course Materials Integration

**File: `src/renderer/notes/App.tsx` (MODIFY)**
- Existing `folder:detected` listener already creates reading notes (verify this path works)
- Add filter for "readings" in the tools/materials view — already partially implemented via `activeTool === 'materials'`
- Ensure reading notes show in NotesListView when type filter = "reading"
- **Acceptance:** Dropping a PDF into a watched folder auto-creates a reading note visible in the notes list

**File: `src/renderer/notes/components/MaterialsReaderView.tsx` (NEW)**
- Props: `{ note: Note; onAnnotate: (selection: string) => void }`
- Renders TipTap in read-only mode with a custom highlight mark enabled
- Toolbar: "Highlight" button — wraps selected text in a highlight mark + creates a Capture
- "Open source" button — calls `shell:openSourceFile` with the original file path (stored in note metadata or sourceQuote attrs)
- **Acceptance:** User can select text in a reading note and create a capture from it; capture links back to the reading note

**File: `src/renderer/notes/editor/highlightMark.ts` (NEW)**
- TipTap Mark extension for in-document highlights
- Attributes: `{ captureId: string; color?: string }`
- Renders as `<mark>` with a data-capture-id attr
- **Acceptance:** Highlighted text renders with yellow background; clicking it shows the linked capture

### Phase 3: AI Note Generation

**File: `src/main/services/ai/generationService.ts` (MODIFY — add summarize handler)**
- Add `ai:summarize` handler that calls Ollama with a "summarize concisely" system prompt
- Reuse existing Ollama connection logic from `ai:generateStudyNotes`
- **Acceptance:** `ipc.invoke('ai:summarize', { content: '...' })` returns shortened text when Ollama is running; returns error obj when offline

**File: `src/renderer/notes/components/StudioPanel.tsx` (MODIFY)**
- Add new StudioCard: "AI Notes" with three actions:
  1. **Generate Notes** — collects active note content + linked captures (resolved from `capturedFromIds`) + reading notes for same course; calls `ai:generateStudyNotes`; creates new child note with result
  2. **Summarize** — calls `ai:summarize` with active note content; inserts summary as a new section at top of note OR creates a new note
  3. **Merge Notes** — opens a multi-select overlay of course notes; on confirm, concatenates their TipTap JSON content arrays into a new note (purely local, no AI)
- All buttons show loading spinner; disabled state when no active note
- Graceful fallback: if `ai:checkOllama` returns `{ ok: false }`, show "Start Ollama" message instead of action buttons
- **Acceptance:** Generate Notes creates a child note with AI content; Summarize inserts summary; Merge combines selected notes; all degrade gracefully when Ollama is offline

**File: `src/renderer/notes/lib/mergeNotes.ts` (NEW)**
- `mergeNoteContents(notes: Note[]): string` — takes N notes, returns single TipTap JSON doc
- Strategy: insert H1 divider with each note's title, then its content array
- Deduplicates identical paragraphs (exact text match)
- **Acceptance:** Unit test passes — 3 notes merge into 1 doc with section headers

### Phase 4: Smart Organization

**File: `src/main/ipcHandlers.ts` (MODIFY — add notes:autoTag handler)**
- Handler for `notes:autoTag`:
  - Read note content as plain text (reuse `noteText()` extraction)
  - Run existing `autoCategorize()` for category match
  - Additionally: extract top 3 keywords by TF-IDF-lite (word frequency minus stop words, compare against corpus)
  - Update `note.tags` with results
  - Return new tags array
- **Acceptance:** Calling `notes:autoTag` on a note about "photosynthesis" adds ["biology", "photosynthesis"] or similar

**File: `src/renderer/notes/lib/noteHealth.ts` (MODIFY)**
- Add new lint kinds:
  - `low_capture_count`: note in a course with many captures but this note has 0 linked
  - `needs_review`: note hasn't been opened in 14+ days and has linked study items with low FSRS stability
- Export `computeNoteHealthScore(note, captures, studyItems): { score: 0-100; indicators: Indicator[] }`
  - Completeness: has title + content + tags + at least 1 linked capture or study item
  - Review status: last updated within 7 days = green, 14 = yellow, 30+ = red
  - Linked materials count: how many reading notes share this course
- **Acceptance:** `computeNoteHealthScore()` returns numeric score and typed indicators; existing lint tests still pass

**File: `src/renderer/notes/components/NoteHealthBadge.tsx` (NEW)**
- Small circular badge (green/yellow/red) rendered on note cards
- Tooltip shows breakdown on hover
- **Acceptance:** Badge renders on cards; color matches health score range

**File: `src/renderer/notes/components/RelatedNotesList.tsx` (NEW)**
- Props: `{ note: Note; allNotes: Note[]; captures: Capture[] }`
- Algorithm: score each other note by:
  - +3 if same courseId
  - +2 per shared tag
  - +1 per shared capturedFromId
  - +1 if same documentType
- Show top 5, each as a clickable row
- **Acceptance:** Renders 0-5 related notes; clicking one calls `onSelect(note)`

## 5. Edge Cases and Error Handling

| Scenario | Handling |
|----------|----------|
| Capture linked to a note that was deleted | `capturedFromIds` entry becomes orphan. Add to `noteHealth` linter as `orphan_capture_ref` warning. UI filters out missing captures gracefully. |
| Ollama not running when user clicks Generate | Check `ai:checkOllama` before showing action as enabled. If it fails mid-request, catch error, show toast: "Ollama connection lost. Generated content may be incomplete." Never crash. |
| Folder watcher detects file but extractFileText fails (corrupt PDF) | `folder:recordImport` stores `error` field. Show in materials list as "Import failed" with retry button. Do not create a broken note. |
| User links same capture to same note twice | `capture:linkToNote` handler checks if captureId already in `capturedFromIds`. If yes, skip (idempotent). Return success without duplicating. |
| Very large note content sent to Ollama (>context window) | Truncate to 8000 chars with a trailing `[...truncated]` marker. Prefer keeping the first 2000 + last 6000 chars (intro + recent content). Log a warning. |
| Merge notes with 0 or 1 selected | Disable "Merge" button when <2 notes selected. |
| User uploads non-JSONL to materials folder | `extractFileText` returns null/throws for unsupported extensions. Watcher only emits for SUPPORTED_EXTENSIONS (already filtered). |
| Auto-tag returns empty (no matching categories, no keywords) | Leave `note.tags` unchanged. Show "No tags suggested" in UI, not an error. |
| CaptureInbox has 500+ unlinked captures | Paginate: show 20, "Load more" button. `capture:unlinked` accepts `limit` param. |
| Note content is empty when user clicks "Summarize" | Disable button when `isEmptyContent(note.content)` returns true. |
| Race condition: two windows open same note | Existing `notes:update` uses last-write-wins (no CRDT). Acceptable for single-user desktop app. The more recent `updatedAt` wins on next `notes:list` fetch. |

## 6. Implementation Order

Build in this sequence to maintain a working app at every step:

### Sprint 1: Capture Inbox (3-4 days)
1. Add IPC contracts (`ipc-contracts.ts` — types only, compiles immediately)
2. Implement `capture:unlinked` handler in main process
3. Implement `capture:linkToNote` handler in main process
4. Build `CaptureInbox.tsx` component
5. Wire into `App.tsx` sidebar
6. Add capture badge to `NotesListView.tsx` cards

**Ship checkpoint:** Captures appear in inbox, can be linked to notes.

### Sprint 2: Materials Integration (2-3 days)
1. Verify existing folder watcher → reading note path works end-to-end
2. Add "Reading" to filter chips in NotesListView
3. Build `highlightMark.ts` TipTap extension
4. Build `MaterialsReaderView.tsx`
5. Wire annotation → capture creation flow

**Ship checkpoint:** PDFs auto-import; user can highlight text in readings to create captures.

### Sprint 3: AI Generation (2-3 days)
1. Add `ai:summarize` handler (trivial — reuses Ollama infra)
2. Build `mergeNotes.ts` utility + unit test
3. Add "AI Notes" card to StudioPanel
4. Wire Generate Notes (content collection → IPC → new note)
5. Wire Summarize action
6. Wire Merge Notes (local, no AI)
7. Add Ollama-offline graceful degradation

**Ship checkpoint:** All 3 AI actions work with Ollama; app still usable without it.

### Sprint 4: Smart Organization (2-3 days)
1. Add `notes:autoTag` handler
2. Extend `noteHealth.ts` with `computeNoteHealthScore`
3. Build `NoteHealthBadge.tsx`
4. Build `RelatedNotesList.tsx`
5. Add RelatedNotes card to StudioPanel
6. Wire auto-tag to run on note save (debounced, non-blocking)

**Ship checkpoint:** Notes show health badges; related notes appear in right panel; tags auto-populate.

### Sprint 5: Polish (1-2 days)
1. CSS: all new components use `--sd-*` design tokens
2. Keyboard shortcuts: `Cmd+Shift+L` to link selected capture
3. Empty states for all new sections
4. Loading skeletons for AI operations
5. Verify no regressions in existing NotesListView, Editor, StudioPanel

---

## Existing Code Reuse Map

| Need | Reuse |
|------|-------|
| Capture data | `capture:list` IPC, `Capture` schema — no schema changes |
| Note CRUD | `notes:create`, `notes:update` — no changes |
| TipTap content manipulation | `parseContent.ts`, existing JSON walkers in `studioGenerators.ts` |
| File text extraction | `extractFileText.ts` in `src/renderer/notes/lib/` |
| Auto-categorize | `src/main/services/notes/autoCategorize.ts` — extend for tags |
| Ollama AI calls | `ai:generateStudyNotes`, `ai:checkOllama` — already working |
| Note health linting | `noteHealth.ts` — extend, don't rewrite |
| Relation scoring | `relationGraph.ts` — borrow the link-type taxonomy |
| Source attribution | `sourceQuoteNode.ts` — reuse for inserted captures |
| Deduplication | `studyDedup.ts` patterns — apply to merged note paragraphs |

## New Dependencies

None required. All features build on:
- `@tiptap/core` (already installed) for the highlight mark
- Existing Ollama IPC infrastructure
- Standard Node.js/Electron APIs

## CSS Token Usage

All new components will use existing design tokens from the workspace theme:

```css
/* Capture inbox item */
.capture-inbox-item {
  background: var(--sd-fg-base);
  border: 1px solid var(--sd-border);
  color: var(--sd-ink);
  border-radius: var(--sd-radius-md);
}

/* Health badge */
.note-health-badge--green  { background: var(--sd-success); }
.note-health-badge--yellow { background: var(--sd-warning); }
.note-health-badge--red    { background: var(--sd-danger); }

/* AI loading state */
.ai-action-loading { color: var(--sd-accent); }
```
