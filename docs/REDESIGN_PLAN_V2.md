# StudyDesk Redesign Plan v2 — Anti-Shame, Source-Grounded, Cross-Course

**Date:** 2026-05-06
**Supersedes:** `IMPLEMENTATION_PLAN.md` and `REDESIGN_PLAN.md` (the first attempt was anchored on charismatic individuals — Matuschak, Justin Sung, Ali Abdaal — which the user correctly called out as bad methodology). This v2 is grounded in `RESEARCH_FINDINGS.md`, which captures n≈450 user voices across three independent passes with **zero productivity-guru quotes**.
**Status:** plan, not yet executed.

---

## Three product principles, in priority order

These three are the brand. If a feature can't defend itself against all three, it doesn't ship.

### 1. Anti-shame UX — the brand promise

The single most important finding from the anonymous research: **the shared spine across every student segment is shame.** Backlog shame, comparison shame, fake-productivity shame, late-night panic shame. *"Streaks are emotional terrorism."* *"App told me 'you're falling behind' at 11pm. I know. I live here."*

**What this means concretely:**
- No streaks, no XP, no "you're falling behind" notifications
- "Forgive me" reset for backlogs, no judgmental UI
- Empty states that don't lecture
- Late-night UI tone — quieter, no exclamation marks, no mascot
- Honest difficulty calibration ("you're not mastering this, you're forgetting it") instead of dishonest "you're crushing it"
- No leaderboards. No social pressure tooling beyond personal accountability.

This is genuinely different positioning from every competitor in the audit. Anki, Quizlet, Forest, Notion — all gamify. StudyDesk should explicitly not.

### 2. Source-grounded everything — the trust contract

NotebookLM's empirical hallucination rate is ~13% vs. ~40% for ChatGPT/Gemini (arxiv 2509.25498). Law students *almost cited a fabricated case.* This is the trust contract. Any study tool that doesn't match it loses immediately.

**What this means concretely:**
- Any LLM-generated content must show citations to user-uploaded sources, clickable, with page/paragraph anchor
- "Refuse rather than invent" is the default. If sources don't cover it, say so. Do not fall back to general-knowledge LLM.
- No AI surfaces that present output as final. Always frame as draft, always editable.
- No "Ask my notes" Q&A surface unless we can match NotebookLM's hallucination floor — and even then, frame as research aid, not authority.

### 3. Cross-course query — the unique attack on NotebookLM

NotebookLM walls off notebooks by design. Students with 6 courses can't ask *"where did I see X across all my classes?"* — and they want to (#1 NotebookLM gap, 12+ distinct mentions).

**What this means concretely:**
- Universal search across notes + captures + sourceQuotes + assignments + deadlines, scoped to all-courses or any subset
- Citations preserved in results back to source note + line
- This is the wedge. Lead with it.

---

## What we WILL build (top 8, ranked by the research)

Each ticket below appeared explicitly in the user-voice research with multi-pass support. None are speculative.

### T1 — Cross-course universal search (the wedge)

**Why:** #1 NotebookLM gap, top anonymous request, top short-form request.
**What:** Cmd-K palette (already in the v1 plan) but the result ranking is the feature, not the UX. Index all notes + captures + sourceQuotes + assignments + deadlines + studyItems + classSessions, weighted by recency + course relevance. Results show snippet + course chip + "open in note" link. No LLM in v1 — pure local fuzzy + lexical match.
**Build:** 2 days. `cmdk` library + a single index built in `src/renderer/notes/lib/searchIndex.ts`. No backend.
**Acceptance:** A student typing 3 chars finds anything they've ever written or captured, across all courses, in <100ms.

### T2 — Notes that quiz back, not summarize

**Why:** Top public + anonymous request. *"I don't want pretty notes, I want my notes to quiz me back."* Strict opposite of AI summary.
**What:** When the user finishes a note (timestamp threshold or explicit "I'm done" button), we extract H2/H3 headings + key sentences and propose them as 3-5 active-recall questions. Crucially: no LLM. Heading + first-sentence-of-paragraph extraction, deterministic. The student grades each candidate (Keep / Skip / Edit) before they become study items. **AI as draft, never final.**
**Build:** 2 days. Builds on existing `study:syncNote` heading-sync; adds a draft-review modal.
**Acceptance:** A user finishing a 500-word note can convert it to study items in 30 seconds, with full agency over which sentences become questions.

### T3 — Panic mode / weakness analysis

**Why:** *"6 hours till exam, what do I drill?"* (r/medicalschool, top demand). *"Find what I don't know"* (NotebookLM #6 request).
**What:** A single screen, triggered by a course chip's "Final in 3 days" button. Shows:
- The 20 study items most likely to be failed (lowest FSRS retrievability + recency-of-failure weighting)
- The 5 deadlines closest to the exam date
- The recently-captured-but-uncompressed material
- A countdown
- One button: "Drill these 20 cards now"
**Build:** 3 days. Reuses existing FSRS state if we ship T7 (FSRS swap) first; otherwise SM-2-based heuristic for retrievability.
**Acceptance:** A user 3 days before an exam clicks "Plan cram" and starts a focused 25-minute session of the 20 most-likely-to-fail cards in under 30 seconds.

### T4 — Anti-shame defaults audit (no streaks, gentle copy)

**Why:** The brand. The single most contrarian feature vs. competitors.
**What:** A pass over the entire workspace replacing every emotionally-loaded UI element:
- Remove all streaks/XP if present (we don't have them; verify)
- Replace "you're falling behind" copy in alerts with neutral "X items aged > 7 days"
- Add a "Forgive me" / "Reset backlog" button on the Cards tab — reschedules everything back to today without losing the cards. One-click bankruptcy.
- Late-night-mode CSS class triggered after 10pm: lower contrast, no red colors, smaller exclamation, quieter copy
- Remove "Resolve" mock-emerald success colors in favor of muted grays for completion (less dopamine theater)
**Build:** 1 day for the copy + CSS pass; 1 day for the Forgive-me button. 2 days total.
**Acceptance:** A user who hasn't opened the app in 11 days does not feel attacked when they open it.

### T5 — Editable AI surfaces (frame all AI as draft)

**Why:** Every AI feature in the audit suffers from "users can't edit it." NotebookLM's audio script is the canonical complaint (~6 mentions).
**What:** Anywhere we generate text via LLM (currently: Quiz "extract questions", Cards "extract from document", and any future surfaces), the output is **always editable** before commit. No "save and apply." Draft → review → confirm. Three buttons per item: Keep, Edit, Skip. Audit fix P2.2 already renamed Generate→Extract; this builds on it.
**Build:** 1 day. Verify all current AI-adjacent surfaces follow this pattern; some already do.
**Acceptance:** No AI-derived content can land in the store without an explicit per-item Keep click.

### T6 — Source quote with page + audio timestamp

**Why:** NotebookLM gap (granular citations ~4 mentions). Logseq's edge.
**What:** Extend existing `sourceQuoteNode.ts` to support `path?page=N` and `path?t=HH:MM:SS` URI fragments. Click a source quote → opens the PDF at the right page or seeks audio to the right second.
**Build:** 2 days. Existing node already stores `sourcePath`; just need fragment parsing + a viewer hand-off.
**Acceptance:** Cited source quotes jump to the exact page or second in PDF/audio.

### T7 — FSRS swap (replace SM-2)

**Why:** Anki itself adopted FSRS in 2023. Open-source `ts-fsrs` is a drop-in. Measurably better retention scheduling.
**What:** Replace the SM-2 logic in `src/main/services/study/studyService.ts` with `ts-fsrs`.
**Build:** 1-2 days. Library is well-documented. Migration of existing study items is the hard part — preserve `reviewCount` history, recompute next-due via FSRS forward pass.
**Acceptance:** Existing study items continue working; new reviews schedule via FSRS; a daily test-day comparison shows measurably-different (and ideally better) intervals.

### T8 — Mobile companion (deferred but acknowledged)

**Why:** Universal pain. Every app has bad mobile. This is StudyDesk's biggest scope risk.
**What:** Defer. But scope it explicitly so we know what we're not building.
**Build:** Months, if ever. iPad-only via Catalyst is the cheapest path.

---

## What we will NOT build (the hard anti-list)

These came up in research with explicit negative sentiment. **Building any of these is a brand violation.**

| Anti-feature | Why no |
|---|---|
| Streaks, XP, wizard-hat levels | Anonymous voice unanimous: "emotional terrorism." Students fake reviews to preserve. |
| AI summaries of notes | Now signals "not actually studying" in 2026 student social. Top-mocked feature. |
| AI tutor chatbot that answers homework | Mocked. Sycophancy. Hallucination. Not the job students want done. |
| AI handwriting completion | Goodnotes killed it after backlash. |
| Two-host AI podcast (NotebookLM-style) | Hype died. *"They laugh at nothing."* |
| Notion-style template gallery | Templates are the procrastination trap. |
| Real-tree gamification | Forest pattern — feels manipulative once noticed. |
| Pomodoro as default 25-min | *"An insult to organic chemistry."* (Allow it, don't enforce it.) |
| Social leaderboards | Friendships ruined. |
| Push notifications about falling behind | Top hated. |
| Subscription on offline features | Notability scarred everyone. |
| Database / table primitives | Capacities won by removing them. |
| Mascot / character / animated assistant | Anonymous: *"I'm trying to study at 1am, not meet your mascot."* |

---

## Phased ship plan

Each phase has explicit STOP signals. If signals don't hit, debate before next phase.

### Phase 1 — Brand + wedge (1 week)

**Tickets:** T4 (anti-shame defaults), T1 (cross-course search), T2 (notes that quiz back).

**STOP signal:** if a beta tester actively prefers streaks/loud UI to gentle UI, the brand is wrong, debate before continuing.

**Acceptance:** A user opens the app after a week away. They feel welcomed, not attacked. They search for "stakeholder" across all 3 courses and find every relevant note in 1 query. They convert today's lecture note to 3-5 study items in 30 seconds.

### Phase 2 — Trust contract + cram (1 week)

**Tickets:** T3 (panic mode), T6 (source quote with page/timestamp), T5 (editable AI verify).

**STOP signal:** if T6 turns out to need a custom PDF viewer, defer T6. Don't build a viewer.

**Acceptance:** 3 days before an exam, "Plan cram" surfaces the 20 most-likely-to-fail cards. Source quotes in any note jump to the exact PDF page.

### Phase 3 — Engine swap (1 week, isolated)

**Tickets:** T7 (FSRS).

**STOP signal:** ship behind a feature flag for a week. If review cadence regresses for any user, revert.

**Acceptance:** New cards schedule via FSRS. Existing cards' history preserved. Daily review counts comparable to pre-swap baseline ±20%.

### Phase 4 — Defer all of audio capture, exam-mode lockout, mobile

These were in v1 plan. **Cut from v2.** They were anchored on "Notability moat" / "Cold Turkey moat" thinking — single-app envy. The research says students don't want more features; they want fewer with deeper wiring. Re-introduce only if Phases 1-3 ship clean and signal demands them.

---

## Execution rules

1. **Before each ticket: re-read the research finding it cites.** If the finding is weak, the ticket is weak.
2. **No LLM features in v1 unless they pass the source-grounded refusal test.** ChatGPT-style answer-anything is a brand violation per principle #2.
3. **Anti-shame is the brand.** Every PR description must answer: "what did this make less shameful?"
4. **Build for the audience that shapes signal — not the one that asks loudest in marketing surveys.** They are not the same audience.
5. **The cross-course search is the wedge. If it's not 10× better than NotebookLM's "remember which notebook"/Notion's "Q&A on my pages," we have not earned the comparison.**

---

## Riskiest assumption

That **anti-shame as positioning is a market** large enough to defend. It might be a niche even within students. Cheapest test: ship Phase 1 with public copy that explicitly leans into the anti-shame angle ("StudyDesk doesn't keep a streak. Anki backlog forgiven."), measure week-2 retention vs. a non-anti-shame variant if we can A/B. If anti-shame loses to gamified by >2x retention, the brand is wrong.

---

## What to start now

**Tomorrow's commit: T4 (anti-shame defaults audit).**

It's the smallest ticket, it tests the brand the most directly, and it costs least to revert. Verify we have no streaks/XP. Do the empty-state copy pass. Build the "Forgive me / Reset backlog" button on the Cards tab. Add a late-night CSS mode.

If T4 lands and feels right, T1 (cross-course search) is the next commit.
