# StudyDesk UI Architecture

Three on-screen surfaces, three different jobs. This file is the canonical
reference for **what each surface contains and how they relate.** When the
implementation plan compresses tabs from 10 → 6, the diagrams below are the
target end state.

```
                           ┌─────────────────────┐
                           │  ELECTRON MAIN      │
                           │  (single instance)  │
                           │  • windowManager    │
                           │  • IPC handlers     │
                           │  • focusStore (JSON)│
                           │  • timerEngine      │
                           └──────────┬──────────┘
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
        ▼ surface 1              ▼ surface 2              ▼ surface 3
   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
   │  NOTCH HUD   │         │  WORKSPACE   │         │ QUICK CAPTURE│
   │  (always on) │         │  (main app)  │         │ (transient)  │
   └──────────────┘         └──────────────┘         └──────────────┘
```

---

## Surface 1 — Notch HUD

Always-on-top panel pinned to the top-center of the primary display. Lives in
its own BrowserWindow (`type: 'panel'`, `transparent: true`). Three states:
**idle** (180×38, just the cap), **hoverDock** (420×38, wings visible),
**activePopover** (540×430, popover rendered below).

```
                              IDLE  (default — user is doing other work)
                              ┌───────────────────┐
                              │     [black cap]   │   180 × 38 px
                              └───────────────────┘
                            ↓ user hovers ↓
                              HOVER DOCK
        ┌────────────────────────────────────────────────────────────┐
        │ ◯ 25:00 · Quiz 2  │  [black cap]  │  🎯 📅 ⚙ 📚 🔔 ⏱  │
        │  (timer ring +    │  always blank │  feature icon dock     │
        │   next deadline)  │   center      │  click → opens popover │
        └────────────────────────────────────────────────────────────┘   420 × 38 px
                            ↓ user clicks a feature icon ↓
                              ACTIVE POPOVER
         ┌────────────────────────────────────────────────────┐
         │  [hoverDock above]                                  │
         │  ┌──────────────────────────────────────────────┐  │
         │  │  Popover panel                                │  │   540 × 430 px
         │  │  e.g. Today, Capture form, Deadlines, Study   │  │
         │  │       — feature-specific content              │  │
         │  └──────────────────────────────────────────────┘  │
         └────────────────────────────────────────────────────┘
```

### Notch HUD components

| Component                         | File                                            | Job                                                 |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `NotchShell`                      | `floating/notch/NotchShell.tsx`                 | Three-part layout (left wing · cap · right dock)    |
| `NotchShape`                      | `floating/notch/NotchShape.tsx`                 | SVG silhouette: concave top, convex bottom         |
| `NotchTimerRing`                  | `floating/notch/NotchTimerRing.tsx`             | Pomodoro phase ring on the left wing                |
| `NotchIdle`                       | `floating/notch/NotchIdle.tsx`                  | Timer + next-deadline chip                          |
| `NotchFeatureButton` × 6          | `floating/notch/NotchFeatureButton.tsx`         | Right dock: today / capture / deadlines / study / settings / alerts |
| `NotchPopover`                    | `floating/notch/NotchPopover.tsx`               | Glass panel that appears below the notch            |
| `lofiPlayer`                      | `floating/lofiPlayer.ts`                        | Audio loop tied to the timer running                |
| `notchModel`, `notchSizing`       | `floating/notch/notchModel.ts`, `notchSizing.ts`| Pure logic: live status, badges, geometry           |
| `notch_helper.node`               | `native/notch_helper.mm`                        | Native panel subclass + CGSSpace placement          |

### Notch state machine

```
       hover                  feature icon click
   ┌─────────────┐ ─────────────────► ┌─────────────────┐
   │    IDLE     │                    │                 │
   │  (180×38)   │ ◄───── close ───── │ ACTIVE POPOVER  │
   └─────────────┘                    │   (540×430)     │
        ▲       │                     │                 │
        │       │ hover               └────────┬────────┘
        │       ▼                              │
        │  ┌─────────────┐                     │
        └──│ HOVER DOCK  │ ◄───── close popover┘
   leave  │  (420×38)   │ leave (no feature open)
          └─────────────┘
```

---

## Surface 2 — Workspace window

The primary writing/study surface. Standard frameless-with-traffic-lights
BrowserWindow (1440×880 default). Four-zone layout (SurfSense pattern):

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ● ● ●   StudyDesk — Workspace                                                │
├──┬──────────────────────┬──────────────────────────────────┬─────────────────┤
│  │                      │                                  │                  │
│  │ COURSE WORKSPACE     │  TAB STRIP (6 tabs target)       │  RIGHT PANEL     │
│  │                      │  ┌──────────────────────────┐    │                  │
│IR│ ▾ BUAD 6621 [active] │  │ Today│Notes│Deadlines│  │    │  Sources tab     │
│ R│   • New course +     │  │ Cards│Materials│Class   │    │   ├─ Upcoming    │
│  │                      │  └──────────────────────────┘    │   │  deadlines   │
│  │ ▾ MAIN PANEL CONTENT │                                  │   ├─ Sources     │
│Y │   (one of:           │  Document header: breadcrumb +   │   │  cited       │
│  │    • TodayView       │    save status + ⋯ More menu     │   ├─ Materials   │
│  │    • Notes editor    │                                  │   │  imported    │
│  │    • Deadlines list  │  Editor toolbar: B I U H2 ⋯     │   ├─ Study queue │
│  │    • Cards review    │                                  │   └─ Local       │
│  │    • Materials list  │  Editor body                     │      alerts      │
│  │    • Class capture)  │                                  │                  │
│  │                      │  Scratch pane (per-note sidecar) │                  │
│  │ Sidebar sections:    │  Footer: Last saved · word count │                  │
│  │   ▾ Syllabus imports │                                  │                  │
│  │   ▾ Assignment       │                                  │                  │
│  │     prompts          │                                  │                  │
│  │   ▾ Notes            │                                  │                  │
│  │   ▸ Captures (80)    │                                  │                  │
│  │                      │                                  │                  │
└──┴──────────────────────┴──────────────────────────────────┴─────────────────┘
   ↑           ↑                          ↑                              ↑
 Icon        Sidebar                    Main panel                   Right panel
  rail
 (left
  edge)
```

### Workspace zones

| Zone           | Width      | Job                                              |
| -------------- | ---------- | ------------------------------------------------ |
| **Icon rail**  | 56 px      | Course chips (B, BU, +) and global toggles       |
| **Sidebar**    | 280 px     | Course context: imports, prompts, notes, captures, search |
| **Main panel** | flex       | Active tab content; tab strip is its header     |
| **Right panel**| 280 px     | Sources / Materials / Study / Health pillars     |

### Tab content (target post-IA-collapse)

```
TAB           ROUTES TO COMPONENT             RENDERED IN MAIN PANEL
────────────  ───────────────────────────────  ───────────────────────────────
Today         TodayView                        Triage screen — due/overdue/
                                               study queue/recent captures
Notes         DocumentWorkspace                TipTap editor, daily entries
                                               are a *note type* here
Deadlines     DeadlinesView (+ Timeline mode)  List view; toggle to Timeline
Cards         FlashcardsView (+ Quiz tab)      Review queue + quiz builder
Materials     MaterialsView                    Imported files, syllabus,
                                               readings — drop zone + list
Class         ClassModeView                    Live class session capture
```

Replaced/relocated:

```
PRE-COMPRESSION → POST-COMPRESSION
─────────────────────────────────
Daily             → Note type inside Notes ("daily entry")
Quiz              → Cards tab, sub-mode
Syllabus Import   → "+ Import" action button on course header
Assignment Parser → "+ Import" action button on course header
Map               → Notes view-mode toggle ("Show relation graph")
Timeline          → Deadlines view-mode toggle
Dashboard         → Default view when no course selected
```

### Workspace-level overlays (above the main panel)

| Overlay              | Trigger                  | File                              |
| -------------------- | ------------------------ | --------------------------------- |
| **Cmd-K palette**    | `Cmd+K` (Week 1 ship)    | `notes/components/CommandPalette.tsx` (new) |
| **Captures inbox**   | "Process inbox" button   | `notes/components/CapturesInboxModal.tsx` (new) |
| **Slash menu**       | Type `/` in editor       | `notes/editor/SlashCommandPopup.tsx` |
| **Note-link picker** | Type `[[` in editor      | `notes/editor/NoteLinkPopup.tsx`  |
| **Revisions modal**  | More menu → History      | inline in `App.tsx`               |

---

## Surface 3 — Quick Capture window

Transient panel that appears at the cursor on global hotkey, dies on
submit/escape. 360×180 frameless transparent BrowserWindow. UI is inlined as
a data-URL HTML so it doesn't need its own Vite entry point.

```
                           ┌─────────────────────────┐
                           │ 📝 QUICK CAPTURE  ⌘↵ ⎋ │
                           ├─────────────────────────┤
                           │                         │
                           │ [textarea — autofocus]  │
                           │                         │
                           │                         │
                           └─────────────────────────┘
                                      360 × 180 px
        Trigger: Cmd+Shift+C (global)  ·  also on global mouse-up
                       capture (PopClip pattern)
```

### Capture flow

```
  user copies / selects text  ─►  global hook fires
                                   ▼
  capture popup at cursor  ──►  user hits Cmd+Enter  ──►  Capture record
                                                          (stored in
                                                          focusStore)
                                                          ▼
                                              auto-categorize (rules)
                                                          ▼
                                              tagged to current course
                                                          ▼
                                              appears in:
                                                • notch live row
                                                • Today triage
                                                • workspace Captures sidebar
                                              available for:
                                                • drag into a note
                                                • → flashcard / deadline /
                                                  trash via inbox triage
                                                  (Week 2 ship)
```

---

## Cross-surface flows (the loops Week 2 wires up)

### Focus Session loop (Ticket 2.2)

```
            NOTCH                         WORKSPACE                    LO-FI
            ─────                         ─────────                    ─────
   1.  user hovers → Start session
                for [BUAD 6621]
                     │
                     ▼
   2.  resizeNotch('activePopover')
       timerEngine.start(focus)
                     │
                     ▼ session:start event
   3.                            ◄────── filter Cards to course
                                          open most-recent course note
                                          captures auto-tag to course
                                                                          ▼
   4.                                                              startLofi()
                     │
                     ▼ tick every second (timer:tick)
   5.  ring fills counterclockwise
                     │
                     ▼ session:end event
   6.                            ◄────── show summary card:
                                          "5 cards · 200 words · 3 captures"
                                                                          ▼
   7.                                                             pauseLofi()
       resizeNotch('idle')
```

### Capture → Note loop (already partially wired; Week 2 finishes)

```
   QUICK CAPTURE  →  capture record  →  TODAY (Recent captures section)
        │                                    │
        ▼                                    ▼ "Process inbox"
   focusStore.captures            CAPTURES INBOX MODAL
        │                                    │
        │   one of: → Note / → Flashcard / → Deadline / → Trash
        │                                    │
        ▼                                    ▼
   notch live status                   destination created
   right rail counts                   capture marked processed
```

### Cmd-K (Week 1, primary navigator)

```
   anywhere in workspace  →  Cmd+K  →  CommandPalette
                                            │
                fuzzy over:                 │
                  notes / captures / dead-  │
                  lines / courses / study   │
                  items / slash actions     │
                                            ▼
                                ┌──────────────────────┐
                                │ ▸ note: "Quiz 1..."   │
                                │ ▸ deadline: "SIM2..."  │
                                │ ▸ /import — Import…   │
                                │ ▸ /cram — Cram mode   │
                                │ ▸ /start-focus — …    │
                                └──────────────────────┘
                                       │
                                       ▼ Enter
                              navigate / execute, close
```

---

## File-system view of the UI surfaces

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # entry, single-instance lock, dock icon
│   ├── windowManager.ts           # creates 3 surfaces, handles resize
│   ├── ipcHandlers.ts             # all ipcMain handlers
│   ├── timerEngine.ts             # pomodoro state machine
│   └── services/                  # one module per domain
│       ├── store.ts               # focus-os-store.json (single source)
│       ├── classSessionService.ts
│       ├── captureService.ts
│       └── …                      # study, deadlines, courses, gmail, …
│
├── preload/                       # context-isolated bridges
│   ├── floatingPreload.ts         # bridge for the notch surface
│   └── notesPreload.ts            # bridge for the workspace surface
│
└── renderer/                      # one Vite entry per surface
    ├── floating/                  # Surface 1: notch HUD
    │   ├── App.tsx
    │   ├── lofiPlayer.ts
    │   └── notch/
    │       ├── NotchShell.tsx
    │       ├── NotchShape.tsx     (SVG silhouette)
    │       ├── NotchTimerRing.tsx
    │       ├── NotchIdle.tsx
    │       ├── NotchFeatureButton.tsx
    │       ├── NotchPopover.tsx
    │       ├── notchModel.ts      (logic: live status, badges)
    │       ├── notchSizing.ts     (geometry per state)
    │       └── SFIcons.tsx
    │
    ├── notes/                     # Surface 2: workspace
    │   ├── App.tsx                (DocumentWorkspace + WorkspaceSurface)
    │   ├── Editor.tsx             (TipTap)
    │   ├── components/
    │   │   ├── WorkspaceShell.tsx (rail + sidebar + main + right)
    │   │   ├── TimelineView.tsx
    │   │   ├── DailyJournalView.tsx
    │   │   ├── RelationMapView.tsx
    │   │   ├── FileDropZone.tsx
    │   │   └── …
    │   ├── editor/                (custom TipTap nodes / marks)
    │   │   ├── slashCommands.ts
    │   │   ├── noteLink.ts
    │   │   ├── footnoteNode.ts
    │   │   ├── sourceQuoteNode.ts
    │   │   ├── dataBlockNode.ts
    │   │   ├── diagramNode.ts
    │   │   └── inlineCommentMark.ts
    │   └── lib/                   (pure helpers, all unit-tested)
    │       ├── studyDedup.ts
    │       ├── exportMarkdown.ts
    │       ├── extractFileText.ts
    │       └── …
    │
    └── (quick capture is inlined HTML in windowManager.ts — no entry)
```

---

## Process / data flow at a glance

```
                  ┌─────────────────────────────────────────────┐
                  │       focus-os-store.json (local-first)     │
                  │  notes · captures · courses · deadlines ·   │
                  │  studyItems · classSessions · alerts · …    │
                  └────────────────┬────────────────────────────┘
                                   │ read/write via service modules
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │   ELECTRON MAIN        │
                       │   ipcHandlers.ts       │
                       └───┬────────────┬───────┘
                           │            │
                  contextBridge      contextBridge
                   (floating)        (notes)
                           │            │
                           ▼            ▼
                  ┌───────────────┐  ┌──────────────────┐
                  │ NOTCH HUD     │  │ WORKSPACE        │
                  │ floating/App  │  │ notes/App        │
                  └───────────────┘  └──────────────────┘
                           │            │
                           └────┬───────┘
                                │ (no direct comms; both go through main)
                                ▼
                          ┌─────────────────┐
                          │  QUICK CAPTURE  │
                          │  (data-URL UI)  │
                          └─────────────────┘
```

Surfaces never talk to each other directly. All cross-surface effects go
through `ipcMain` events from main:

- `capture:new` — quick-capture saved → notch flashes, workspace updates list
- `session:start`, `session:end` — notch timer → workspace filters, lo-fi plays
- `notes:openNote` — Cmd-K result → workspace selects note
- `folder:fileDetected` — folderWatcher → workspace surfaces import banner

---

## Where the implementation plan slots in

| Plan item                       | Surface affected                | New components                                |
| ------------------------------- | ------------------------------- | --------------------------------------------- |
| 1.1 IA collapse 10 → 6          | Workspace                       | (deletes); modifies `App.tsx`, `WorkspaceShell.tsx` |
| 1.2 Cmd-K palette               | Workspace overlay               | `CommandPalette.tsx`, `commandPaletteSources.ts` |
| 1.3 Today as triage             | Workspace tab                   | `TodayView.tsx`                               |
| 2.1 Captures inbox triage       | Workspace overlay               | `CapturesInboxModal.tsx`                      |
| 2.2 Focus Session loop          | Notch + Workspace + Lo-fi       | wires existing services; new IPC events       |
| 3.1 Cram Mode                   | Workspace tab + Notch nudges    | `CramView.tsx`, `cramService.ts`              |

The architecture above is the target end state. Each ticket either deletes,
relocates, or wires together pieces that exist; the only net-new components
are the ones in the right column above.
