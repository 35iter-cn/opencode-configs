import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type Plugin, tool } from "@opencode-ai/plugin";
import { getProjectId } from "./kdco-primitives/get-project-id";
import { parsePlanMarkdown } from "./plan-markdown";

export {
  extractMarkdownParts,
  notesSectionIsValid,
  parsePlanMarkdown,
  parseTaskLine,
} from "./plan-markdown";
export type { ExtractedParts, ParseResult } from "./plan-markdown";

/**
 * Format parse error with actionable guidance (Law 4: Fail Loud).
 * Includes error message, example, and skill hint.
 */
function formatParseError(error: string, hint: string): string {
  return `❌ Plan validation failed:

${error}

💡 ${hint}`;
}

/**
 * Type guard for Node.js filesystem errors (ENOENT, EACCES, etc.)
 * Follows "Parse, Don't Validate" - handle uncertainty at boundaries.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Expected input for experimental.chat.system.transform hook (see @opencode-ai/plugin).
 */
interface SystemTransformInput {
  sessionID?: string;
}

/**
 * KDCO Workspace Plugin
 *
 * Provides plan management tools. Plan/build agent prompts live in `agent/plan.md` and
 * `agent/build.md`. Research is handled by the delegation system (background-agents).
 */

// ==========================================
// CODER TASK TRACKING FOR REVIEW TRIGGER
// ==========================================

/** Tracks in-flight coder task callIDs with timestamps for stale cleanup */
const activeCoderCalls = new Map<string, { startTime: number }>();

/** Stale call timeout - matches MAX_RUN_TIME_MS in background-agents.ts */
const STALE_CALL_TIMEOUT_MS = 15 * 60 * 1000;

/** Periodic cleanup of orphaned callIDs (runs every 60s) */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [callID, data] of activeCoderCalls) {
    if (now - data.startTime > STALE_CALL_TIMEOUT_MS) {
      activeCoderCalls.delete(callID);
    }
  }
}, 60_000);
// Prevent interval from keeping process alive
cleanupInterval.unref?.();

export const WorkspacePlugin: Plugin = async (ctx) => {
  const { directory } = ctx;

  // Use git root commit hash for cross-worktree consistency
  const projectId = await getProjectId(directory);
  const baseDir = path.join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "workspace",
    projectId,
  );

  /**
   * Resolves the root session ID by walking up the parent chain.
   */
  async function getRootSessionID(sessionID?: string): Promise<string> {
    if (!sessionID) {
      throw new Error("sessionID is required to resolve root session scope");
    }

    let currentID = sessionID;
    for (let depth = 0; depth < 10; depth++) {
      const session = await ctx.client.session.get({
        path: { id: currentID },
      });

      if (!session.data?.parentID) {
        return currentID;
      }

      currentID = session.data.parentID;
    }

    throw new Error(
      "Failed to resolve root session: maximum traversal depth exceeded",
    );
  }

  return {
    tool: {
      plan_save: tool({
        description:
          "Save the implementation plan as markdown. Must include citations (ref:delegation-id) for decisions based on research. Plan is validated before saving.",
        args: {
          content: tool.schema
            .string()
            .describe("The full plan in markdown format"),
        },
        async execute(args, toolCtx) {
          // Guard 1: Session required (Law 1: Early Exit)
          if (!toolCtx?.sessionID) {
            return {
              output:
                "❌ plan_save requires sessionID. This is a system error.",
              metadata: {
                ok: false,
                code: "PLAN_SAVE_SESSION_REQUIRED",
              },
            };
          }

          const rootID = await getRootSessionID(toolCtx.sessionID);
          const sessionDir = path.join(baseDir, rootID);
          await fs.mkdir(sessionDir, { recursive: true });

          // Guard 2: Parse and validate at boundary (Law 2: Parse Don't Validate)
          const result = parsePlanMarkdown(args.content);
          if (!result.ok) {
            return {
              output: formatParseError(result.error, result.hint),
              metadata: {
                ok: false,
                code: "PLAN_SAVE_VALIDATION_FAILED",
                hint: result.hint,
              },
            };
          }

          // Happy path: save
          const planPath = path.resolve(sessionDir, "plan.md");
          await fs.writeFile(planPath, args.content, "utf8");
          const warningCount = result.warnings?.length ?? 0;
          const warningLines = result.warnings
            ?.map((warning) => `- ${warning}`)
            .join("\n");
          const nextActionReminder = `<system-reminder>
🔒 MANDATORY: Delegate to reviewer before showing user.
   Use "delegate" → reviewer agent → request Overall Assessment${warningCount > 0 ? "; include all warnings in the prompt and request concrete suggestions for each" : ""}.
   WAIT for result. DO NOT present plan first.
🔓 OPTIONAL: If this plan was previously approved and edits are minor, review may be skipped.
</system-reminder>`;
          const outputText =
            warningCount > 0
              ? `✅ Saved: ${planPath}

Warnings:
${warningLines}

${nextActionReminder}`
              : `✅ Saved: ${planPath}

${nextActionReminder}`;

          return {
            output: outputText,
            metadata: {
              ok: true,
              code: "PLAN_SAVE_SUCCESS",
              planPath,
              warningCount,
            },
          };
        },
      }),

      plan_read: tool({
        description: "Read the current implementation plan for this session.",
        args: {
          reason: tool.schema
            .string()
            .describe("Brief explanation of why you are calling this tool"),
        },
        async execute(_args, toolCtx) {
          // Guard: Session required (Law 1: Early Exit)
          if (!toolCtx?.sessionID) {
            return "❌ plan_read requires sessionID. This is a system error.";
          }
          const rootID = await getRootSessionID(toolCtx.sessionID);
          const planPath = path.join(baseDir, rootID, "plan.md");
          try {
            return await fs.readFile(planPath, "utf8");
          } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT")
              return "No plan found.";
            throw error;
          }
        },
      }),
    },

    // Universal date awareness (plan/build prompts live in agent/*.md)
    "experimental.chat.system.transform": async (
      _input: SystemTransformInput,
      output,
    ) => {
      const today = new Date().toISOString().split("T")[0];
      output.system.push(`<date-awareness>
Today is ${today}. When searching for documentation, APIs, or external resources, use the current year (${new Date().getFullYear()}). Do not default to outdated years from training data.
</date-awareness>`);
    },

    // Track coder task starts for review trigger
    "tool.execute.before": async (
      input: { tool: string; callID?: string },
      output: { args?: { subagent_type?: string } },
    ) => {
      if (input.tool !== "task") return;
      if (!input.callID) return;
      if (output.args?.subagent_type !== "coder") return;

      activeCoderCalls.set(input.callID, { startTime: Date.now() });
    },

    // Trigger review reminder when all coder tasks complete
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      // Coder task completion tracking
      if (!input.callID) return;
      if (!activeCoderCalls.has(input.callID)) return;

      activeCoderCalls.delete(input.callID);

      if (activeCoderCalls.size === 0) {
        output.output += `\n\n<system-reminder>
Coder task complete. Proceed to code review:
1. Delegate to \`reviewer\` agent with the changed files
2. Include findings in your completion report
3. Offer to fix any critical/major issues found
</system-reminder>`;
      }
    },

    // Compaction Hook - Inject plan context when session is compacted
    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ) => {
      const rootID = await getRootSessionID(input.sessionID);
      const planPath = path.join(baseDir, rootID, "plan.md");

      let planContent: string | null = null;
      try {
        planContent = await fs.readFile(planPath, "utf8");
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      }

      if (!planContent) return;

      // Extract current task from plan
      const currentMatch = planContent.match(/← CURRENT/);
      let currentTask: string | null = null;
      if (currentMatch?.index !== undefined) {
        const start = Math.max(0, currentMatch.index - 100);
        const end = currentMatch.index + 50;
        currentTask =
          planContent.slice(start, end).match(/\d+\.\d+ [^\n←]+/)?.[0] ?? null;
      }

      output.context.push(`<workspace-context>
## Current Plan
${planContent}

## Resume Point
${currentTask ? `Current task: ${currentTask}` : "No task marked as CURRENT"}

## Verification
To verify any cited decision, use \`delegation_read("ref:id")\`.
</workspace-context>`);
    },
  };
};

export default WorkspacePlugin;
