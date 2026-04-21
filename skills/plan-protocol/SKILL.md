---
name: plan-protocol
description: Use when writing or updating plan markdown files and you need clear section-by-section writing conventions and meaning
---

# Plan Protocol

## Prerequisites (MANDATORY)

Before writing or updating any plan, you **MUST**:

1. **Load the `tdd-philosophy` skill** — This is non-negotiable. You cannot correctly judge TDD applicability without first understanding the RED/GREEN discipline.
2. **Load the `plan-brainstorming` skill** — Constrains planning behavior. This is also mandatory.

**Why mandatory?** The TDD skill provides the framework for identifying which tasks require `[RED]`/`[GREEN]` markers. Without loading it first, you will miss `#implementation` tags on tasks that need them.

## When to Use

- Writing a new phase-based execution plan
- Updating an existing plan with Goal / Phase / Task / Notes sections
- Standardizing plan wording and section semantics across the team

<system-reminder>
- `./plan-template.spec.md` is the single non-negotiable source of truth and must be followed without exception.
- After loading `tdd-philosophy`, you **MUST evaluate** every task against the TDD applicability checklist below. If any check passes, add the `#implementation` tag.
- After loading `plan-brainstorming`, you **MUST apply** its brainstorming constraints before structuring any plan section.

</system-reminder>

## TDD Applicability Checklist

For each task in your plan, ask:

- [ ] Does this task involve **writing or modifying business logic** (functions, algorithms, state management, data transformations) that requires a test to prove correctness?
- [ ] Does this task involve **changing user-facing behavior** where a failing test must precede the fix to prevent regression?
- [ ] Does this task have a clear pass/fail criterion that **cannot be verified by a static check** (lint, type-check, build) alone?

**If ANY answer is YES** → Mark the task with `#implementation` and ensure its steps include `[RED]` and `[GREEN]` markers.

**When NOT to use `#implementation`:**

- Configuration changes (package.json, build config, tool settings) — verify with commands, not tests.
- Class name replacements, file moves, import path updates — verify with build/type-check.
- Pure documentation updates (no behavior change to verify).
- Administrative tasks (scheduling meetings, updating labels).
- Research-only tasks that produce findings but don't modify production code or configuration.

**Common mistakes to avoid:**

- ❌ "This is just config migration, not code — no TDD needed" — Correct: config migration does NOT need `#implementation`.
- ❌ "I'll load TDD later if I need it" — Load it **before** planning. Judgment requires the skill.
- ❌ "Every task that modifies code needs `#implementation`" — Only tasks that need RED/GREEN test cycles qualify.
