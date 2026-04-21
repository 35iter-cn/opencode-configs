---
status: in-progress
updated: 2026-04-21
---

## Goal

Refresh login and auth UI in a controlled way: update key controls and copy while keeping behavior regression-safe.

## Phase 1: Discovery [COMPLETE]

- [x] 1.1 Align requirements and constraints #search
  1. Capture scope, non-goals, dependencies, and open questions.
- [x] 1.2 Map the login module as-is #search
  1. List relevant files, component boundaries, and test gaps for Phase 2.

## Phase 2: Login module build [IN PROGRESS]

- [ ] 2.1 Update login primary button #implementation ← CURRENT
  1. Add or adjust tests for primary button display and behavior so they describe the outcome and fail first. [RED]
  2. Run tests; confirm the failure is from assertions, not compile or syntax issues. [RED]
  3. Make the smallest production change that makes the new tests pass. [GREEN]
  4. Re-run the full or scoped suite; stay green before refactor. [GREEN]
  5. Without changing behavior, clarify targets for naming, duplication, and structure. [REFACTOR]
  6. Refactor with tests green; split risky cleanups into a follow-up task if needed. [REFACTOR]

## Phase 3: Verify and close [PENDING]

- [ ] 3.1 Regression and pre-release checks #testing
  1. Run full or agreed-scope tests; fix regressions before closing the phase.

## Notes

- Track risks and follow-ups here. `## Notes` must stay after all `## Phase` sections.
- Additional note line.
