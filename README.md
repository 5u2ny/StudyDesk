# StudyDesk

A local-first academic workspace for students. StudyDesk turns courses,
syllabi, assignments, captured source material, study cards, reminders, and
class notes into one desktop app with a lightweight notch HUD and a full
workspace window.

## Portfolio Context

This repo reflects the StudyDesk project from my resume and portfolio: a local-first, AI-agent-assisted Electron/React/TypeScript desktop command center for courses, captures, deadlines, notes, and study workflows. It is useful proof for AI product roles because the product design starts with the actual job-to-be-done, then wraps capture, deadlines, notes, study tools, and optional AI helpers into one workflow.

The main app is no longer a generic note editor. It opens to a course dashboard,
then moves into a structured workspace with notes, deadlines, study tools,
materials, maps, timelines, and an optional Studio panel for generation.

Core flows work without paid AI APIs, hosted models, Ollama, or continuous local
model inference. AI helpers are optional and fail softly when no local model is
available.

## Install

```bash
git clone https://github.com/5u2ny/studydesk-hud-ui.git
cd studydesk-hud-ui
npm install
npm start
```

Requires macOS, Node 20+, and Xcode Command Line Tools
(`xcode-select --install`). On first launch, grant **Accessibility**
permission to StudyDesk in System Settings → Privacy & Security so the global
mouse hook can drive auto-capture.

## Notch UI

StudyDesk lives in the MacBook notch. The floating window is a frameless
always-on-top panel pinned to the top-center of the display.

### Layout

The shell is a three-part horizontal bar: **left wing** (120 px), **center cap**
(180 px, hidden behind the physical notch), and **right wing** (120 px). Wings
are invisible at rest; hovering over the notch area expands the shell sideways
with a 280 ms ease-out transition, revealing:

- **Left wing** -- Pomodoro timer display and idle status chips (next deadline,
  due review count).
- **Center cap** -- Opaque black fill continuous with the hardware notch. Blank;
  acts as the hover target.
- **Right wing** -- Feature dock icons for Today, Capture, Timer, and
  Deadlines with live counts.

Clicking a dock icon opens a popover panel below the bar. Each popover renders
live data from the local store; there are no mock views. A native Objective-C
addon (`notch_helper.node`) removes AppKit window constraints so the panel can
overlap the menu bar and attach flush to the display top edge.

### Tray icon

A menu-bar tray icon shows a circular progress ring colored by the current
timer phase (red for focus, green for break, blue for long break). The ring
updates every tick and doubles as a quick launcher: Show, Open StudyDesk, Quit.

### Workspace window

Clicking **Open StudyDesk** opens a separate standard-frame workspace window.
The current workspace opens to a course dashboard with:

- course cards for every active course,
- top-level counts for deadlines, cards due, assignments, and reminders,
- upcoming deadline rows,
- setup reminders and course-specific alerts,
- an **Add Course** flow with optional syllabus import.

Selecting a course moves into the workspace shell. The primary tabs are:

- **Today** -- focused current-course surface with active note context.
- **Notes** -- searchable note list with document type badges.
- **Deadlines** -- course deadline board with complete actions.
- **Map** -- relationship map for notes and linked sources.

Less frequent tools stay in the overflow menu: daily journal, flashcards,
materials, class mode, dashboard, quiz, assignment parser, syllabus parser,
and timeline.

The workspace hides on close rather than destroying, so reopening is instant.

## Features

- **Dashboard first** -- launch into a clean overview of courses, deadlines,
  due cards, assignments, and reminders.
- **Notes tab** -- a first-class notes browser instead of hiding notes inside
  the editor surface. The notebook header shows filtered notes, total course
  notes, and linked capture counts so students can see whether source material
  has been connected.
- **Course plan language** -- calendar and deadline surfaces use student-facing
  labels such as next dated work, assigned readings, assessments due, and class
  prep so syllabus imports read like an action plan rather than a raw calendar.
- **Capture inbox** -- view unlinked captures and attach them to the active
  note; `Cmd+Shift+L` links the newest unlinked capture to the current note.
- **Materials reader** -- attach course material folders, import PDFs or
  Markdown, and read imported materials in a dedicated view.
- **Studio panel** -- generate summaries, study notes, quizzes, and flashcards
  from the active note through the local generation service. Draft-oriented
  labels make clear when questions or cards are editable review candidates
  before they are saved to the study queue.
- **Auto-tagging** -- content edits trigger best-effort note tags based on
  extracted keywords and course context.
- **Syllabus review** -- paste or select syllabus text, parse course metadata,
  class meetings, assignments, deadlines, readings, and setup tasks, then
  review before confirming import.
- **Note health** -- surface thin notes, missing links, and review issues with
  lightweight badges.
- **Relation map and timeline** -- inspect note relationships, linked captures,
  deadlines, study items, and course chronology.
## Stack

Electron 41 · React 18 · TypeScript 5.9 · Vite 8 · Tailwind · Radix UI ·
TipTap 2 (notes) · Phosphor and Lucide icons · `uiohook-napi` global capture
shortcuts · `pdfjs-dist`, `mammoth`, and `tesseract.js` for local document and
OCR workflows · `react-force-graph-2d` for note maps · `ts-fsrs` for study
scheduling · local JSON persistence in `src/main/services/store.ts` ·
deterministic local rules by default.

## Development

```bash
npm run typecheck
npm test
npm run rebuild:native
npm run build
npm start
```

`npm install` runs `npm run rebuild:native` after dependencies install. That
script rebuilds native modules, including the local `notch_helper.node` addon,
for the Electron runtime. If the rebuild warning appears, install Xcode Command
Line Tools with `xcode-select --install`, then run `npm run rebuild:native`
manually.

`npm start` builds the renderer and main process, applies the development
rebrand script, and launches the actual Electron app. Use it when checking the
desktop UI. `npm run dev:renderer` is only for isolated renderer debugging; the
notes workspace preview is served at
`http://localhost:7331/src/renderer/notes/index.html`.

## Troubleshooting

**Stale renderer after rebuild.** Electron aggressively caches compiled
renderer JS. If the UI shows old text or layout after `npm run build`, clear
the cache before relaunching:

```bash
rm -rf ~/Library/Application\ Support/focus-os/Cache \
       ~/Library/Application\ Support/focus-os/Code\ Cache
npm start
```

This only removes V8 bytecode and Blink resource caches. User data in
`focus-os-store.json` is not affected.

**Old floating HUD appears but not the workspace.** Use the **Open StudyDesk**
button in the HUD or the Window menu item **StudyDesk — Workspace**. The
workspace is created at app start and may sit behind the HUD if another Electron
window already has focus.

**Wrong checkout.** The current StudyDesk repo is
`https://github.com/5u2ny/studydesk-hud-ui`. Do not use older sibling checkouts
when committing workspace UI changes.

See [`CLAUDE.md`](./CLAUDE.md) for the architecture deep-dive and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev workflow. MIT licensed.
