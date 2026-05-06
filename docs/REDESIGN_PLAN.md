# StudyDesk Redesign Plan — Workflow-First, Less Surface, More Wiring

**Date:** 2026-05-06
**Inputs:** three parallel deep-research passes — student venting (Reddit/HN/App Store), competitive feature audit (15 study apps), and high-performer workflow patterns. Sources cited inline.
**Status:** plan, not yet executed. Supersedes the earlier `IMPLEMENTATION_PLAN.md` for anything past Ticket 1.1.

---

## What the research said (consolidated, with the receipts)

The three agents converged on a remarkably consistent picture. I'll quote the strongest evidence so the redesign is grounded, not vibes.

### Convergent finding 1 — Students want LESS, not more

> *"I spent 3 weeks building the perfect Notion second brain and got a C+ on my midterm. My friend uses a single Google Doc and got a 94."* — r/GetStudying

> *"Students with the prettiest Anki decks are usually the ones failing. Top quartile uses stock decks (AnKing) and just grinds."* — r/medicalschool

> *"I might spend a hundred hours tweaking it and never actually writing a thing."* — Obsidian forum

> *"Notion makes me feel like I'm studying when I'm actually just decorating."* — r/Notion

**The product trap is "build a second brain."** Tiago Forte's PARA gets eviscerated by Andy Matuschak ("note-writing systems are not thinking systems"). The Stanford Daily calls it *"productive procrastination — the art of convincing themselves that building the perfect system is the work."*

### Convergent finding 2 — The workflow that actually works is a 24-hour loop

Across r/Anki power users, AnKing interviews, Justin Sung's iCanStudy, Cajun Koi Academy, and Andy Matuschak's evergreen-notes essays, top performers describe the same loop:

```
Capture (during lecture, ugly surface, no formatting)
   ↓ within 4 hours
Compress (5 questions + 3 facts on a single page)
   ↓ next morning, before new input
Recall (blank-page mode — write everything you remember, THEN check)
   ↓ silently, on a 1d/3d/7d cadence
Spaced re-recall (FSRS-scheduled, 5 cards max per session)
```

The **two shifts that genuinely move grades** (~50% retention gains, Karpicke & Roediger 2008): active recall replacing re-reading, and spaced review at increasing intervals. **Pomodoro, AI summaries, dopamine-detox routines are rounding error.**

### Convergent finding 3 — The plumbing is what students will pay for, not AI

> *"Notes live in Notion while memory lives in Anki, and nothing talks to each other nicely."* — FlashRecall blog summarizing the universal pain.

> *"Students currently re-type every syllabus by hand."* — Coursicle student blog re: Canvas/Blackboard ↔ Calendar.

> *"You cannot exit the app without killing the tree if you need to access other apps for homework."* — Forest 1-star reviews.

**Counter-intuitive:** AI summaries are an ANTI-feature. *"Q&A fails to find information that is clearly in users' notes"* (Notion AI, Reddit). NIH study: ~47% of ChatGPT references are hallucinated. Goodnotes' Word Complete was killed in March 2025 because *"AI deletes my words."* Students universally rewrite AI summaries by hand.

What students actually pay for: **boring plumbing nobody ships.** Notes-to-cards in one click. LMS-to-calendar sync. Audio synced to handwriting (Notability's moat). PDF/video timestamp linking back to a note (Logseq). Un-bypassable lockout for exam week (Cold Turkey).

### Convergent finding 4 — One-time-purchase trust > feature parity

The Notability subscription pivot in 2021 is **still cited 5 years later** as a brand-killing trust violation. Goodnotes won not on features but on a one-time license. RemNote's $192-over-2-years pricing gets compared to Anki's $25 lifetime mobile, repeatedly.

**Implication:** if StudyDesk ever monetizes, one-time + free-tier is the only credible path with this audience.

### Convergent finding 5 — Real workflow is messy + ugly + retrieval-heavy

Top performers don't post their setups. They use ugly single-surface tools and **spend their study time on retrieval, not formatting.** Justin Sung: *"Notes are not learning. If your study session ended with a beautiful page, you didn't study."*

This is the foundational design tension we have to resolve. **A pretty note-taking app actively works against learning.** The redesign has to reward retrieval and de-emphasize aesthetic editing.

---

## What this means for StudyDesk

The blunt translation, with no spin:

| Current state | What the research says |
|---|---|
| 8 visible tabs + More menu | Probably still too many. Tabs imply destinations; students want a *flow*. |
| Today = empty Daily entry | Wasted real estate on launch. Should be the day's *triage + recall* surface. |
| Cards tab is a list view | Should be a 5-card *session*, not a queue browser. |
| Pomodoro timer is decoupled from content | Top complaint about Forest. Timer should bind to a course + a content surface. |
| Heading-sync to flashcards | Right idea. Doesn't go far enough — students want **inline cloze syntax** (RemNote model) so cards form during writing, not after. |
| sourceQuote node links to PDF | Right idea. Extend to **video/audio timestamp linking** (Logseq's edge). |
| No audio capture | Notability's #1 moat. Universally praised. We have nothing here. |
| AI surfaces (Quiz "generate", Cards "generate") | Already correctly relabelled to "extract" (P2.2). Resist all temptation to add LLM-as-judge. |
| Folder watcher + materials | Boring plumbing — exactly what students want. Already built. Underadvertised in the UI. |
| Map / Timeline | Maps in particular got pushback for being "productivity theater" (Maggie Appleton, "Tools for Thought" essay: *"the seductive uselessness of the link graph."*). Keep them, but don't make them the primary surface. They're decoration; the 24-hour loop is the product. |

**Three product principles that fall out of this**:

1. **Reward retrieval, not aesthetics.** Every UI moment should ask "did this push the user toward writing/recalling, or toward decorating?"
2. **Ship plumbing that beats Notion + Anki + Forest at being *connected*.** Don't out-feature them. Out-wire them.
3. **The notch HUD is the capture surface; the workspace is the compress + recall surface.** Each surface has one job.

---

## The redesign — what changes

### IA: workspace tabs collapse to **3 primary + 5 secondary**

The 8-tab strip from `da8a375` is already a meaningful improvement, but the research says we should go further. Three primary tabs reflecting the 24-hour loop, the rest demoted to a popover:

**Primary (always visible):**
1. **Today** — today's compress + recall surface (was empty journal, now the thing the user opens the app to do)
2. **Notes** — the writing surface (was `today` route)
3. **Cards** — today's 5-card recall session (not a queue browser)

**Secondary (chip set, one click away):**
- Deadlines (with Timeline view-mode)
- Materials (folder + readings)
- Class (live capture)
- Quiz (generate from selection)
- Map (relation graph)

Why three primary? The research is unambiguous: top performers use **one ugly surface** at a time. More primary tabs = more decision fatigue = more procrastination. The Capture/Compress/Recall loop maps cleanly to Today (compress + recall) → Notes (write) → Cards (recall again later).

### Today screen rebuild — the headline change

Today becomes a **two-pane workflow**, not a journal:

```
┌─────────────────────────────────────────────────────────────┐
│ MORNING RECALL          │  YESTERDAY'S CAPTURES             │
│  (blank-page mode)      │   3 captures awaiting compression │
│                         │   ┌─ "x is defined as…"   [⤷]    │
│  Type what you remember │   ├─ "Schneider 2019 ch 3"  [⤷]   │
│  about yesterday.       │   └─ "Why does X work?"     [⤷]   │
│                         │                                   │
│  [textarea, full focus] │   Click ⤷ to send to Compress     │
│                         │  ─────────────────────────────    │
│  Then click "Reveal"    │  COMPRESS TODAY'S LECTURE         │
│  to see your notes.     │                                   │
│                         │   Q1: ___________________________ │
│                         │   Q2: ___________________________ │
│                         │   Q3: ___________________________ │
│                         │   Q4: ___________________________ │
│                         │   Q5: ___________________________ │
│                         │                                   │
│                         │   Fact 1: _______________________ │
│                         │   Fact 2: _______________________ │
│                         │   Fact 3: _______________________ │
└─────────────────────────────────────────────────────────────┘
                       [Start 25-min focus]
```

Key behaviors:
- The recall pane is **default empty**. Yesterday's notes are hidden until the user types something — a hard fight against the "open notes and re-read" anti-pattern.
- The compress pane has **5 question slots + 3 fact slots**. Not freeform. The constraint is the feature.
- "Start 25-min focus" binds the timer to today + this course. Lo-fi plays. At ring-end, summary surfaces here.

### Cards tab — session, not queue

Today's Cards tab is a list of due flashcards. After the redesign:

- Default view is a **session of 5 cards**, one at a time, big.
- Buttons: **Again / Hard / Good / Easy** (already wired, keyboard 1-2-3-4).
- After 5 cards: a "session complete · 3 due tomorrow" summary card, not "load more."
- A small subtab/toggle "Manage cards" for power users who want the queue browser.
- Algorithm: **swap SM-2 for FSRS** (dropped-in via `ts-fsrs`). FSRS is the modern open-source spaced-repetition algorithm Anki itself adopted in 2023; it's measurably better and trivial to integrate.

### Notch popover — the capture surface

Make Capture the *first* feature on the dock (left-most). Hover the notch → click capture → minimal text input + "ship" button. Already exists. Verify it's frictionless and one keystroke from anywhere.

### New plumbing — the wins the research demanded

These are the **boring plumbing** features that all three research passes converged on:

1. **Inline cloze syntax in Notes (RemNote model).** Type `{{cloze::answer}}` in any note → flashcard auto-creates on save. Schedules itself via FSRS. No more "now I have to go make Anki cards." Solves the #1 plumbing gap students complained about.

2. **Audio-synced lecture capture (Notability moat).** Class Mode already exists. Add: hit Record at lecture start, every line of text the user types is timestamped to the audio. Tap a sentence later → audio plays from that moment. The single most-paid-for feature across all 15 apps audited.

3. **Source quote with timestamp (Logseq edge).** Extend the existing `sourceQuote` TipTap node to support `pdf?page=42` and `audio?t=14:32` URI fragments. Click a quote in a note → jump to PDF page or audio moment.

4. **LMS calendar import.** Drop an `.ics` file (Canvas exports them) → all assignments + due dates land in Deadlines, pre-tagged to the course. Two-way sync (`calendar:exportDeadlines` already exists for the export side; add the import side). One-shot pain killer.

5. **Exam-week lockout mode.** Press a button → for the next N hours, distracting apps are blocked at the OS level (uses macOS' Screen Time API or `osascript` to hide Dock items). Survives reboot — Cold Turkey's "Frozen Turkey" pattern. The feature students pay $39/year for separately.

### What we *don't* build (the explicit anti-list)

These came up in research and are **rejected.**

| Feature | Why no |
|---|---|
| AI summaries / "Ask my notes" | Highest-criticism feature across Notion, Mem, Goodnotes. Hallucination rate ~47%. Students rewrite by hand. |
| AI study tutor / chatbot | NotebookLM is the only partial exception (because it's grounded). General AI buddies fail in reviews. |
| AI handwriting completion | Goodnotes killed Word Complete in March 2025 after backlash. |
| Beautiful Notion-style templates gallery | The templates *are* the procrastination trap. |
| Real-tree planting gamification | Forest pattern — feels manipulative once noticed. |
| Subscription conversion of one-time features | Notability is still being roasted 5 years later. |
| Database / table primitives | Capacities won by removing them. Notion's #1 student complaint is template fatigue. |
| Social leaderboards / streaks beyond personal | Forest's social leaderboards rank #4 in their own complaint list. |

---

## Phased plan (do not ship in one wave)

Each phase has a clear acceptance criterion and a STOP signal — if metrics don't move, don't proceed to the next phase. This is the version control on overreach.

### Phase 1 — Today screen rebuild + IA tightening (1 week)

**Tickets:**
- T1.1 Today as morning-recall + yesterday-captures + compress-today three-pane (new `TodayView.tsx`)
- T1.2 Reduce primary tab strip to 3 (Today, Notes, Cards). Move Deadlines/Materials/Class/Quiz/Map to a chip row below the breadcrumb (still one click)
- T1.3 Cards tab → 5-card session view with "Manage" subtab for power users

**STOP signal:** if the user (or beta testers) actively miss the 8-tab layout and ask to revert, do not proceed to Phase 2. The 3-tab IA is the riskiest UX change in the plan.

**Acceptance:** App-launch screen requires zero clicks to start studying.

### Phase 2 — Plumbing wins (2 weeks)

**Tickets:**
- T2.1 FSRS scheduler swap (replace SM-2 in `studyService.ts`; `ts-fsrs` is a drop-in)
- T2.2 Inline cloze syntax in Notes (parse `{{cloze::x}}`, auto-create study items on save, FSRS-schedule them)
- T2.3 Source quote with PDF page anchor + audio timestamp (extend `sourceQuoteNode.ts`)
- T2.4 LMS `.ics` import → Deadlines bulk-create

**STOP signal:** ship T2.1 alone first. If FSRS doesn't measurably improve retention/review-completion vs SM-2 over 2 weeks, debate before doing T2.2.

**Acceptance:** A user who imports a Canvas `.ics`, writes notes with `{{cloze::}}` syntax, and reviews daily *never opens a second app* for studying.

### Phase 3 — Audio + lockout (2-3 weeks)

**Tickets:**
- T3.1 Class-mode audio recording timestamped to typed lines (Notability moat)
- T3.2 "Exam mode" lockout — hide selected apps at OS level for N hours; survives reboot

**STOP signal:** these are the moonshot features. Don't build them if Phases 1-2 didn't ship clean. T3.1 in particular is non-trivial (audio buffering, sync, storage).

**Acceptance:** A user can record a 90-minute lecture, type live notes, and click any line later to hear the lecturer at that moment. Exam mode survives a reboot.

### Phase 4 — Polish + monetize (deferred, only if 1-3 land)

**Decisions deferred:**
- One-time purchase pricing (research says this is the only path)
- iPad companion via Catalyst (or stay Mac-only — the audience is OK with Mac-only)
- Sync (local-first stays; iCloud for the device-pair case)

---

## Execution principles (the version control on this plan)

1. **Each phase ships independently.** No "we'll merge it all at the end." Phase 1 in main before Phase 2 starts.
2. **Each ticket has a STOP signal.** If the previous ticket's metric didn't move, debate before the next.
3. **Resist every AI feature suggestion** that comes up during build. The research is unambiguous: students don't want it. The ones who say they do are not the ones who actually use the app.
4. **The notch is the capture surface; the workspace is compress+recall.** Don't blur this. If a feature doesn't fit one of those two surfaces, it doesn't belong.
5. **Honest cuts.** When in doubt, cut. Every retained feature has to defend itself against "does this push the user toward writing/recalling, or toward decorating?"

---

## What to start now

Tomorrow morning's commit:
**Phase 1 / Ticket 1.1 — TodayView.tsx**, the three-pane morning-recall screen. That's the highest-leverage single change in this plan and the one that will tell us whether the rest is even worth building.

Estimated 1-2 days of focused work. Acceptance: the screen makes the 24-hour Capture-Compress-Recall loop the *default* path, not a hidden feature.

Everything else in this doc is downstream of T1.1 working.
