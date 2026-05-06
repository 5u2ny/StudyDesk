# Student Research — Raw Findings (May 2026)

**Method:** three parallel research passes, no productivity-guru quotes admitted. Total user voices captured ≈ 450 (anonymous channels n~340 across ~60 threads; short-form social n~50 indexed posts/articles; NotebookLM-specific n~50–60 verbatim/near-verbatim).

**Honest caveat:** Reddit direct fetch was blocked in the NotebookLM pass; many "Reddit quotes" reach us through aggregator articles. Treat NotebookLM frequency numbers as ordinal, not counts. Anonymous-platform pass had richer raw access.

---

## What the three passes converged on (high confidence)

These appeared in **all three** independent passes. Highest confidence.

1. **The shared spine is shame.** Every student segment, anonymously, is asking the same underlying thing: *"make me feel less alone and less ashamed while I do this."* Feature requests are downstream of that.
2. **AI summaries are an anti-feature** and now signal *"not actually studying"* in student social. *"NotebookLM made up a case that doesn't exist and I almost cited it"* (r/LawSchool). *"AI summary of my notes — now the canonical 'you're not actually studying' tell"* (short-form).
3. **Streaks are anti-features.** *"Streaks are emotional terrorism"* (r/Anki). *"Streaks made me lie to my own flashcard app."* Public productivity content claims streaks motivate; anonymous voice reveals students fake reviews to preserve them.
4. **Note-making is often avoidance, not work.** *"I want to stop making notes as a coping mechanism"* (r/GetStudying). Productivity YouTube cannot say this because note-making is the genre.
5. **Cross-notebook / cross-course global search is the #1 unmet need.** NotebookLM's biggest gap (12+ distinct mentions). Anonymous voice: *"I'm tab-switching myself into a coma."* Short-form rising trend: Claude Projects winning *because* it walls off context, but students still want a "where did I see X across all my classes" query.
6. **Notes that quiz back, not summarize.** *"I don't want pretty notes, I want my notes to quiz me back"* (r/GetStudying). *"Stopped re-reading. Started failing practice questions on purpose"* (Threads, MIT grad). Top public + anonymous request.
7. **Panic mode / weakness analysis.** *"6 hours till exam, what do I drill?"* (r/medicalschool). *"Find what I don't know"* — top NotebookLM feature request. *"Honest 'you will probably pass / not pass' predictor — I'd pay $200"* (r/MBA).
8. **Mobile is universally bad** across every app. NotebookLM's Android app: *"my favorite AI tool, but wow, its Android version is bad."*
9. **Source-grounded answers are the trust contract.** NotebookLM's killer feature is empirical: 13% hallucination vs ~40% for ChatGPT/Gemini on sample tasks (arxiv 2509.25498). Any study tool that doesn't match this loses immediately.
10. **Editable AI output, not final AI output.** Students want AI as draft, not authority. *"If only there was a way to tweak the podcast script."* The pattern is universal — Audio Overview length, voice, system instructions, all wanted.

---

## The cool/uncool axis flipped on AI (2026)

The most surprising finding. Two years ago every AI feature signaled "savvy student." Now:

| Now uncool — signals "not actually studying" | Now cool |
|---|---|
| AI-generated note summaries | Claude Projects with a tight source set |
| NotebookLM podcast as a study method | Hand-drawn Heptabase whiteboards posted as photos |
| Notion second-brain aesthetic / templates from influencers | Active recall / failed-question screenshots |
| Public 8-hour "study with me" streams | Anki spaced-repetition heatmaps |
| Posting your dashboard | Ollama / local-model setups (CS-student X) |
| Vanity hour-tracking | *"I deleted my AI summary and re-read the source"* |
| AI tutor that just answers the homework | |

This means: **building AI features that look impressive in a marketing video is now a brand liability with the audience that shapes signal.**

---

## Top features students want (rank-aggregated across all 3 passes)

| Rank | Feature | Source convergence |
|---|---|---|
| 1 | Cross-source / cross-notebook query | NotebookLM (12+), anonymous ("tab-switching myself into a coma"), short-form ("walled-off but searchable across") |
| 2 | Notes that auto-quiz me back (active recall extraction, not summary) | All three. The most-requested *positive* feature. |
| 3 | Panic mode / weakness analysis / "find-what-I-don't-know" | Anonymous ("6h till exam, what do I drill"), short-form ("weakness analysis"), NotebookLM (~6 mentions) |
| 4 | Source-grounded answers with clickable citations | All three. NotebookLM moat. |
| 5 | YouTube/lecture video → flashcards in one click | NotebookLM (~12), short-form (rising 2026 workflow) |
| 6 | Spaced repetition built into the AI tool itself | NotebookLM (~3-8), anonymous ("notes that schedule themselves") |
| 7 | Editable AI output (script, length, voice, system prompt) | NotebookLM (audio script ~6, voice ~8), short-form |
| 8 | Body-doubling (silent video of someone else studying) | Anonymous (r/ADHD, r/college). Genuinely new signal. |
| 9 | "Forgive me" / Anki-bankruptcy reset | Anonymous (~45 mentions, r/medicalschool, r/Anki) |
| 10 | Honest pass/fail predictor | Anonymous (r/MBA, r/medicalschool), short-form (concrete grade outcomes celebrated) |
| 11 | Detect when I'm fake-studying | Anonymous ("flag when I've highlighted but answered 0 questions in 45 min") |
| 12 | Single-pane lecture + notes + cards | Anonymous, short-form |
| 13 | Page/paragraph-precise citations | NotebookLM (~4), anonymous (law school) |
| 14 | Annotation export back to source PDF | NotebookLM (~4), short-form |
| 15 | Free tier that survives finals week | NotebookLM (cost ~9), India market |

---

## Top features students want killed (rank-aggregated)

| Rank | Feature | Source convergence |
|---|---|---|
| 1 | Streaks / gamified XP / wizard-hat levels | Anonymous (heaviest), short-form ("infantilizing") |
| 2 | AI summaries (forced, hallucinating) | All three. Top-mocked feature in 2026 student social. |
| 3 | Two-host AI podcast small talk | NotebookLM (~6), short-form ("they laugh at nothing") |
| 4 | Push notifications about being behind | Anonymous (*"app told me 'you're falling behind' at 11pm. I know. I live here."*) |
| 5 | Notion AI write-for-me / sycophancy | Anonymous, short-form |
| 6 | Pomodoro as default 25-min timer | Anonymous (*"25 minutes is an insult to organic chemistry"*) |
| 7 | Social leaderboards | Anonymous (*"Quizlet's leaderboard ruined my friendships"*) |
| 8 | Mandatory onboarding tutorials | Anonymous (*"trying to study at 1am, not meet your mascot"*) |
| 9 | AI-generated Anki cards without review | NotebookLM, short-form (AnKing community) |
| 10 | Subscription paywalls on offline features | Anonymous (*"I pay $15/mo to read my own notes on a plane"*) |
| 11 | Pomodoro-with-anime-girl study apps | Short-form (now mocked) |
| 12 | Influencer-sold Notion templates ($47 for a database) | Short-form |
| 13 | Vanity dashboards showing hours but not retention | Short-form |
| 14 | Generic motivational quotes built into apps | Short-form |
| 15 | Forced AI sycophancy ("That's a great point!") | NotebookLM audio host filler complaints |

---

## Per-segment differences (real but smaller than the shared spine)

| Segment | Dominant signal |
|---|---|
| Premed / medschool | **Backlog shame.** Want bankruptcy reset + panic-mode triage. Strongest, n~80. |
| Law school | **Hallucination fear.** Want trustworthy citation, not generation. n~40. |
| MBA | **Imposter + comparison.** Lowest interest in flashcards, highest in "predict my grade." n~25. |
| Undergrad | **Aesthetic-vs-reality gap + loneliness.** Body-doubling demand. n~70. |
| PhD / grad | **Identity-level procrastination.** Want accountability not features. n~45. |

---

## Geographic / cultural differences

| Region | Dominant pattern |
|---|---|
| US | NotebookLM + Anki + Claude stack. r/medicalschool is the canonical anglo medical signal. |
| **India** | YouTube-first (NEET/JEE coachings). NotebookLM + YouTube transcript pipeline is the breakout 2026 workflow. **Free-tier sensitivity dominant.** |
| UK | Threads/X presence; less TikTok study content; Notion + Obsidian skews higher. |
| Korea | Timer / group-accountability apps (열품타-style) dominate over AI tools. AI demand notably *lower*. Visible discipline (planners, photos) > AI features. |
| Japan | Paper-first culture persists; iPad + Goodnotes dominant; NotebookLM mentions sparse. |
| China | Not surfaced in indexed Western search; Xiaohongshu signal not captured. |

---

## What StudyDesk should attack vs. what it can't

**Open attack surfaces on NotebookLM specifically:**
1. Cross-notebook / global search (NotebookLM walls notebooks off by design)
2. Adaptive tutoring loop (NotebookLM is read-only retrieval)
3. Granular citations (page/paragraph)
4. Annotation export back to PDF
5. Editable audio scripts
6. Spaced-repetition-scheduled cards (NotebookLM generates, doesn't schedule)
7. Mobile-first study (commute / between-class)

**What students will NOT migrate from:**
1. Source-grounded refusal to hallucinate (the trust contract — match it or lose)
2. One-click multi-format generation (audio + mind map + flashcards + quiz from one source set)
3. Free tier with usable limits
4. Google account / Drive ingestion
