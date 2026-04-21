import type { z } from "zod";
import { PlanSchema, TaskStepSchema } from "./schema";

/** In sync with `TaskStepSchema` / `parseNumberedTaskSteps` output. */
export type ParsedTaskStep = z.infer<typeof TaskStepSchema>;

export type TaskStepTddMarker = NonNullable<ParsedTaskStep["tddMarker"]>;

/**
 * Raw extracted parts from markdown (no validation).
 * Used as intermediate type before Zod validation.
 */
export interface ExtractedParts {
  frontmatter: Record<string, string | number> | null;
  goal: string | null;
  phases: Array<{
    number: number;
    name: string;
    status: string;
    tasks: Array<{
      id: string;
      checked: boolean;
      tag?: string;
      content: string;
      isCurrent: boolean;
      citation?: string;
      /** Indented lines after the task line until the next task (not in Zod schema). */
      detailText?: string;
      /** Numbered steps; also validated by `TaskSchema` when present. */
      steps?: ParsedTaskStep[];
    }>;
  }>;
}

/**
 * Result type for plan parsing - either valid data or descriptive error.
 */
export type ParseResult =
  | { ok: true; data: z.infer<typeof PlanSchema>; warnings: string[] }
  | { ok: false; error: string; hint: string };
