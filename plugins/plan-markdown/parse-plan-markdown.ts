/**
 * Plan markdown parser — validates structure aligned with `plan-template.md`.
 *
 * - Numbered steps under tasks are parsed as arrays (`1.`, `2.`, …).
 * - `#implementation` tasks must include at least one `[RED]` and one `[GREEN]` step;
 *   TDD brackets must appear only at the end of a step line; violations are errors.
 * - Task lines: optional `#tag` at end (any non-empty label); omitted means no tag.
 * - `steps` on tasks are validated by `TaskStepSchema` + `PlanSchema` superRefine.
 * - YAML frontmatter: `status` and `updated` (see `FrontmatterSchema`).
 */
import type { z } from "zod";
import { PlanSchema } from "./schema";
import { extractMarkdownParts, notesSectionIsValid } from "./extract";
import type { ParseResult } from "./types";

function formatZodErrors(error: z.ZodError): string {
  const errorMessages: string[] = [];

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? `[${issue.path.join(".")}]` : "[root]";

    let message = issue.message;
    if (issue.code === "invalid_value") {
      const values = (issue as { values?: unknown[] }).values;
      const input = (issue as { input?: unknown }).input;
      if (input !== undefined && input !== null) {
        message = `Invalid value "${String(input)}". Expected: ${values?.join(" | ") ?? "valid value"}`;
      }
    } else if (
      issue.code === "invalid_type" &&
      (issue as { input?: unknown }).input === null
    ) {
      message = "Required field missing";
    }

    errorMessages.push(`${path}: ${message}`);
  }

  return errorMessages.join("\n");
}

const skillHint =
  "Load skill('plan-protocol') for format spec, skill('tdd-philosophy') for TDD discipline. Canonical shape: skills/plan-protocol/plan-template.md.";

/**
 * Parse and validate markdown plan in a single boundary operation.
 */
export function parsePlanMarkdown(content: string): ParseResult {
  if (typeof content !== "string") {
    return {
      ok: false,
      error: `Expected markdown string, received ${typeof content}`,
      hint: skillHint,
    };
  }

  if (!content.trim()) {
    return {
      ok: false,
      error: "Empty content provided",
      hint: skillHint,
    };
  }

  if (!notesSectionIsValid(content)) {
    return {
      ok: false,
      error:
        "`## Notes` must be the last section: no `## Phase N:` may appear after `## Notes`.",
      hint: skillHint,
    };
  }

  const parts = extractMarkdownParts(content);

  const candidate = {
    frontmatter: parts.frontmatter,
    goal: parts.goal,
    phases: parts.phases.map((p) => ({
      ...p,
      tasks: p.tasks.map(({ detailText: _dt, ...t }) => t),
    })),
  };

  const result = PlanSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      error: formatZodErrors(result.error),
      hint: skillHint,
    };
  }

  const warnings: string[] = [];
  let currentCount = 0;
  let inProgressCount = 0;

  for (const phase of result.data.phases) {
    if (phase.status === "IN PROGRESS") inProgressCount++;
    for (const task of phase.tasks) {
      if (task.isCurrent) currentCount++;
    }
  }

  if (currentCount > 1) {
    return {
      ok: false,
      error: `Multiple tasks marked ← CURRENT (found ${currentCount}). Only one task may be current.`,
      hint: skillHint,
    };
  }

  if (inProgressCount > 1) {
    warnings.push(
      "Multiple phases marked IN PROGRESS. Consider focusing on one phase at a time.",
    );
  }

  return { ok: true, data: result.data, warnings };
}
