---
name: plan-forge
description: Unified runtime workflow for plan creation, validation, and plan_save execution
---

# Skill: plan-forge

## TL;DR

Use this skill as the single runtime entry point for creating or updating implementation plans.
`plan-forge` orchestrates structural rules (`plan-protocol`) and TDD discipline (`plan-tdd`) so planning and `plan_save` behavior stay consistent.

## Workflow

Follow this sequence:

1. Load `plan-protocol`.
2. Load `plan-tdd`.
3. Create or update the plan (every phase header must include a valid phase tag).
4. Apply TDD discipline to `#implementation` and `#refactor` tasks.
5. Call `plan_save`.
6. If the validator returns an `error`, fix it and run `plan_save` again.
7. If the validator returns only a `warning`, saving is allowed, but you must document the reason and follow-up action in `## Notes`.
8. For quality-critical warnings, fix first and save second by default. If you must save first, record the exemption rationale and remediation deadline in `## Notes`.

## Phase Tags Quick Reference

| Tag | Purpose | Notes |
| --- | --- | --- |
| `#search` | Research and information gathering | Optionally cite `ref:delegation-id` |
| `#implementation` | Production code implementation | **TDD is required (RED/GREEN)** |
| `#testing` | Testing and verification | Focus on coverage and regression safety |
| `#refactor` | Refactoring and structural improvements | **TDD is required (RED/GREEN)** |
| `#documentation` | Documentation and delivery artifacts | Record decisions and outcomes |

## TDD Task Template

> Keep parser-compatible task formatting and hierarchical numbering (for example, `- [ ] 2.1 ...`).

```markdown
## Phase 2: Implementation [IN PROGRESS] #implementation

- [x] 2.1 Define behavior and boundaries (input/output/failure paths)
- [ ] 2.2 RED: Write a failing test first with interpretable failure output ← CURRENT
- [ ] 2.3 GREEN: Implement the smallest change that makes the test pass
- [ ] 2.4 REFACTOR: Improve naming and structure under test protection
- [ ] 2.5 Run regression checks and confirm all relevant checks pass
```

## Baseline Structural Checklist (from plan-protocol)

These are the minimum structural constraints inherited from `plan-protocol`:

- [ ] Frontmatter includes `status`, `phase`, and `updated`.
- [ ] `## Goal` is present and written as one sentence.
- [ ] `## Context & Decisions` is present, with citations for decision entries.
- [ ] Phase headers use valid status markers (`[PENDING]`, `[IN PROGRESS]`, `[COMPLETE]`, `[BLOCKED]`).
- [ ] Tasks use hierarchical numbering (for example, `1.1`, `1.2`, `2.1`).
- [ ] Exactly one task is marked `← CURRENT`.
- [ ] Every research-based decision includes a citation (`ref:delegation-id`).

## Pre-Save Checklist

Before calling `plan_save`, verify all of the following:

- [ ] Frontmatter includes all required fields: `status`, `phase`, `updated`.
- [ ] `## Goal` exists and states a clear one-sentence outcome.
- [ ] Every research-based decision is cited with `ref:id` (for example, `ref:swift-amber-falcon`).
- [ ] Exactly one task is marked with `← CURRENT`.
- [ ] Every phase uses a valid status marker (`[PENDING]`, `[IN PROGRESS]`, `[COMPLETE]`, `[BLOCKED]`).
- [ ] Task IDs follow hierarchical numbering (for example, `1.1`, `1.2`, `2.1`).
- [ ] Every phase header includes a valid phase tag.
- [ ] `#implementation` and `#refactor` phases explicitly show TDD flow (minimum RED/GREEN loop).

## Failure Recovery

When `plan_save` fails or warns, handle it in this order:

1. Read the validator message and locate the exact section (`frontmatter`, `phase`, `task`, `citation`).
2. For `error`: fix the issue (structural issues first, semantic issues second), then call `plan_save` again.
3. For `warning`: save is allowed, but you must document cause and next action in `## Notes`.
4. For quality-critical warnings (for example, missing TDD cues in `#implementation` / `#refactor`), fix before saving by default.
5. Keep changes minimal; do not rewrite sections that are already correct.

## Runtime Compatibility / Validation Matrix

Use actual `plan_save` + workspace validator behavior as the runtime source of truth:

| Scenario | Runtime Result |
| --- | --- |
| Phase headers contain valid tags, and `#implementation` / `#refactor` include TDD cues (for example, RED/GREEN) | Save succeeds |
| Phase headers contain valid tags, but `#implementation` / `#refactor` do not include TDD cues | Save is allowed with warning; record reason and follow-up action in `## Notes`, and prefer fixing first |
| Any phase header is missing a tag | Save fails (add valid tags before retry) |
