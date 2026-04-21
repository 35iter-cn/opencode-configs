# Plan Markdown Spec

This document defines the canonical format and validation rules for `plan-template.md`.

## 1. Frontmatter

Plan files must start with YAML frontmatter:

```md
---
status: in-progress
updated: 2026-04-21
---
```

Rules:

- `status` is required and must be one of:
  - `not-started`
  - `in-progress`
  - `complete`
  - `blocked`
- `updated` is required and must match `YYYY-MM-DD`.

## 2. Goal Section

The file must contain:

```md
## Goal
```

Rules:

- Goal content is required.
- Goal text must satisfy minimum length validation.

## 3. Phase Sections

Each phase header must follow:

```md
## Phase N: Name [STATUS]
```

Rules:

- `N` must be a positive integer.
- `Name` must be non-empty.
- `STATUS` must be one of:
  - `PENDING`
  - `IN PROGRESS`
  - `COMPLETE`
  - `BLOCKED`
- Every phase must contain at least one task.
- Multiple phases marked `[IN PROGRESS]` are allowed but generate a warning.

## 4. Task Line Format

Task lines must start with a checkbox and hierarchical ID:

```md
- [ ] 2.1 Task title #tag
- [x] 1.1 Task title
```

Rules:

- Checkbox must be `[ ]` or `[x]`.
- Task ID must be hierarchical (`N.M`), e.g. `1.1`, `2.3`.
- `#tag` is optional and free-form.
- `← CURRENT` is optional.
- At most one task in the entire plan may be marked `← CURRENT`.

## 5. Task Steps (Numbered List)

Indented numbered steps under a task are parsed into `steps`:

```md
1. Step text. [RED]
2. Step text. [GREEN]
```

Rules:

- Only digit-prefixed numbered lines (`1.`, `2.`, ...) are parsed as steps.
- Step markers examples: `[RED]`, `[GREEN]`, `[REFACTOR]`.
- Markers are valid only when they appear at the end of the line.
- If a marker appears in any other position (start/middle), it is treated as a misplaced marker and causes validation failure.

## 6. Notes Section

Notes must be last:

```md
## Notes
```

Rule:

- No `## Phase ...` section may appear after `## Notes`.
