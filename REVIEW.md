# HackBoard — PR Review Contract

Reviews follow the Obvious `pr-review` + `code-review` flow: check run per
head SHA, findings-only review body, severity Blocker / High / Medium /
Suggestion, check run always completed. This file states what each PR must
demonstrate before it can merge.

## Branch topology

```
main                    base loop (markup, design system, theme)
└── feat/site-core      data layer + board rendering  ← PR #1
    ├── feat/win-predictor   heuristic scoring        ← PR #2 (stacked)
    └── feat/hackbot-agent   agent widget + CV match  ← PR #3 (stacked)
```

PR #1 merges into `main`; PRs #2 and #3 target `feat/site-core` and are
rebased on it after merge. They are reviewed in parallel.

## Per-PR acceptance criteria

### PR #1 — feat/site-core → main
- All 11 open events render, sorted by soonest deadline, each with prize,
  location/format, date range, countdown chip, tags, and a working
  registration link.
- Countdown chips compute from `Date.now()` — no hardcoded day counts.
- Every filter chip narrows the grid; empty state shows when zero match.
- Concluded section renders newest-first; winners show
  announced/pending status correctly.
- No inline styles that duplicate token-based CSS; no XSS surface — all
  rendered content originates from `data.js`, not user input.

### PR #2 — feat/win-predictor → feat/site-core
- Score is a documented heuristic: weights live in `WEIGHTS`, verdict
  labels at 80% / 60% thresholds.
- Output always includes the disclaimer note; the page never presents
  percentages as real odds.
- Track/venue combos missing from the weight table fall back to 0.5,
  never throw.
- Best-event list only includes events still open, sorted by deadline.

### PR #3 — feat/hackbot-agent → feat/site-core
- Intents covered: news, deadlines, prizes, winners, CV match, greeting,
  help, thanks, fallback — every path replies.
- All chat output passes through the `md()` escaper first; user text is
  never interpolated raw into `innerHTML`.
- CV flows: paste detection (≥280 chars + resume keywords), .txt/.md
  upload, drag-drop, PDF refusal with guidance, unreadable-file error.
- Match reasons are grounded in detected skill domains; no invented
  credentials or rankings.
- Widget opens/closes cleanly; focus lands in the input on open.

## Data hygiene (applies to every PR)

- Event data carries a tracked date; deadlines and prize totals must be
  verifiable on the linked event page before release.
- Prize strings mix currencies and credits — never sort numerically on
  the raw string (see the comment in `agent.js replyPrizes`).
