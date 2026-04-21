import { z } from "zod";

/** Allowed values for `## Phase N: Name [STATUS]` (square brackets in markdown). */
export const PHASE_STATUS_VALUES = [
  "PENDING",
  "IN PROGRESS",
  "COMPLETE",
  "BLOCKED",
] as const;

export type PhaseStatusValue = (typeof PHASE_STATUS_VALUES)[number];

export const PhaseStatus = z.enum(PHASE_STATUS_VALUES, {
  error: () =>
    `Phase [STATUS] must be one of: ${PHASE_STATUS_VALUES.join(", ")}`,
});

/** One numbered step line under a task (`1. ...`, `2. ...`). */
export const TaskStepSchema = z.object({
  n: z.number().int().positive(),
  body: z.string(),
  tddMarker: z.enum(["RED", "GREEN", "REFACTOR"]).optional(),
  strayTddMarker: z.boolean(),
});

export const TaskSchema = z.object({
  id: z
    .string()
    .regex(/^\d+\.\d+$/, "Task ID must be hierarchical (e.g., '2.1')"),
  checked: z.boolean(),
  /** Any label after `#` on the task line; omit when there is no tag. */
  tag: z.string().min(1).optional(),
  content: z.string(),
  isCurrent: z.boolean().optional(),
  citation: z
    .string()
    .regex(
      /^ref:[a-z0-9][-a-z0-9]*$/,
      "Citation must be ref:word-word format",
    )
    .optional(),
  /** Parsed numbered steps; optional. */
  steps: z.array(TaskStepSchema).optional(),
});

export const PhaseSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().min(1, "Phase name cannot be empty"),
  status: PhaseStatus,
  tasks: z.array(TaskSchema).min(1, "Phase must have at least one task"),
});

export const FrontmatterSchema = z.object({
  status: z.enum(["not-started", "in-progress", "complete", "blocked"]),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

const PlanSchemaBase = z.object({
  frontmatter: FrontmatterSchema,
  goal: z.string().min(10, "Goal must be at least 10 characters"),
  context: z
    .array(
      z.object({
        decision: z.string(),
        rationale: z.string(),
        source: z.string(),
      }),
    )
    .optional(),
  phases: z.array(PhaseSchema).min(1, "Plan must have at least one phase"),
});

export const PlanSchema = PlanSchemaBase.superRefine((plan, ctx) => {
  for (let pi = 0; pi < plan.phases.length; pi++) {
    const phase = plan.phases[pi];
    for (let ti = 0; ti < phase.tasks.length; ti++) {
      const task = phase.tasks[ti];
      if (task.tag !== "implementation") continue;
      const steps = task.steps ?? [];
      for (let si = 0; si < steps.length; si++) {
        const step = steps[si];
        if (step.strayTddMarker) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              `Task ${task.id} (#implementation) in phase '${phase.number}: ${phase.name}' step ${step.n}: TDD markers [RED]/[GREEN]/[REFACTOR] must appear only at the end of the line.`,
            path: ["phases", pi, "tasks", ti, "steps", si],
          });
        }
      }
      const hasRed = steps.some((s) => s.tddMarker === "RED");
      const hasGreen = steps.some((s) => s.tddMarker === "GREEN");
      if (!hasRed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `Task ${task.id} (#implementation) in phase '${phase.number}: ${phase.name}' requires at least one numbered step ending with [RED].`,
          path: ["phases", pi, "tasks", ti, "steps"],
        });
      }
      if (!hasGreen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `Task ${task.id} (#implementation) in phase '${phase.number}: ${phase.name}' requires at least one numbered step ending with [GREEN].`,
          path: ["phases", pi, "tasks", ti, "steps"],
        });
      }
    }
  }
});
