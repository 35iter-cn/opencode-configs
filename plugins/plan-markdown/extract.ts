import type { ExtractedParts, ParsedTaskStep, TaskStepTddMarker } from "./types";

/**
 * Parse indented body lines into numbered steps (`  1. ...`). Non-blank lines that do not
 * start with `digits.` are skipped.
 */
export function parseNumberedTaskSteps(bodyLines: string[]): ParsedTaskStep[] {
  const out: ParsedTaskStep[] = [];
  for (const line of bodyLines) {
    const t = line.trimEnd();
    if (!t) continue;
    const parsed = parseOneNumberedStepLine(t);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseOneNumberedStepLine(line: string): ParsedTaskStep | null {
  const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
  if (!m) return null;
  const n = parseInt(m[1] ?? "0", 10);
  let full = (m[2] ?? "").trimEnd();
  const endTag = full.match(/\s+\[(RED|GREEN|REFACTOR)\]\s*$/i);
  let tddMarker: TaskStepTddMarker | undefined;
  let bodyAfterStrip = full;
  if (endTag && endTag.index !== undefined) {
    const kind = endTag[1].toUpperCase() as TaskStepTddMarker;
    tddMarker = kind;
    bodyAfterStrip = full.slice(0, endTag.index).trimEnd();
  }
  const strayTddMarker = /\[(RED|GREEN|REFACTOR)\]/i.test(bodyAfterStrip);
  return {
    n,
    body: bodyAfterStrip,
    tddMarker: strayTddMarker ? undefined : tddMarker,
    strayTddMarker,
  };
}

/**
 * Parse a single task line. Task id may be wrapped in markdown bold, e.g. `**1.1**`.
 * Optional `#tag` at end of title (after optional `← CURRENT` and trailing `` `ref:` ``).
 * When omitted, the task has no tag.
 */
export function parseTaskLine(
  line: string,
): ExtractedParts["phases"][0]["tasks"][0] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- [")) return null;
  const m = trimmed.match(
    /^- \[([ x])\] (\*\*)?(\d+\.\d+)(\*\*)?\s+(.*)$/,
  );
  if (!m) return null;
  let rest = (m[5] ?? "").trimEnd();
  let citation: string | undefined;
  const refMatch = rest.match(/`ref:([a-z0-9][-a-z0-9]*)`\s*$/);
  if (refMatch && refMatch.index !== undefined) {
    citation = `ref:${refMatch[1]}`;
    rest = rest.slice(0, refMatch.index).trimEnd();
  }
  let isCurrent = false;
  if (rest.endsWith("← CURRENT")) {
    isCurrent = true;
    rest = rest.slice(0, -"← CURRENT".length).trimEnd();
  }
  const tagMatch = rest.match(/#([^\s#]+)\s*$/);
  if (!tagMatch || tagMatch.index === undefined) {
    const content = rest.replace(/\*\*/g, "").trim();
    return {
      id: m[3],
      checked: m[1] === "x",
      content,
      isCurrent,
      citation,
    };
  }
  const tag = tagMatch[1];
  const beforeTag = rest.slice(0, tagMatch.index).trim();
  const content = beforeTag.replace(/\*\*/g, "").trim();
  return {
    id: m[3],
    checked: m[1] === "x",
    tag,
    content,
    isCurrent,
    citation,
  };
}

/**
 * If a `## Notes` heading exists, no `## Phase N:` may appear after it (Notes must be last).
 * Expects raw markdown; normalizes CRLF/CR internally.
 */
export function notesSectionIsValid(content: string): boolean {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const m = text.match(/^## Notes\s*$/m);
  if (!m || m.index === undefined) return true;
  const afterNotes = text.slice(m.index + m[0].length);
  return !/\n## Phase \d+:/.test(afterNotes);
}

/**
 * Extract all parts from markdown without validation (Law 2: Parse Don't Validate).
 * Returns raw extracted data - validation happens in parsePlanMarkdown.
 */
export function extractMarkdownParts(content: string): ExtractedParts {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, string | number> | null = null;

  if (fmMatch) {
    frontmatter = {};
    const fmLines = fmMatch[1].split("\n");
    for (const line of fmLines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        const value = valueParts.join(":").trim();
        frontmatter[key.trim()] = value;
      }
    }
  }

  const goalSectionMatch = text.match(/## Goal\n(?:\n)*\s*([^\n#]+)/);
  const goal = goalSectionMatch?.[1]?.trim() || null;

  const phases: ExtractedParts["phases"] = [];
  const phaseRegex =
    /## Phase (\d+): ([^[]+)\[([^\]]+)\]\s*\n([\s\S]*?)(?=## Phase \d+:|## Notes|## Blockers|$)/g;

  let phaseMatch = phaseRegex.exec(text);
  while (phaseMatch !== null) {
    const phaseNum = parseInt(phaseMatch[1], 10);
    const phaseName = phaseMatch[2].trim();
    const phaseStatus = phaseMatch[3].trim();
    const phaseContent = phaseMatch[4];

    const tasks: ExtractedParts["phases"][0]["tasks"] = [];
    const lines = phaseContent.split("\n");
    let i = 0;
    while (i < lines.length) {
      const parsed = parseTaskLine(lines[i] ?? "");
      if (parsed) {
        const bodyLines: string[] = [];
        i++;
        while (i < lines.length) {
          if (parseTaskLine(lines[i] ?? "")) break;
          bodyLines.push(lines[i] ?? "");
          i++;
        }
        const detailText = bodyLines.join("\n").trimEnd();
        const steps = parseNumberedTaskSteps(bodyLines);
        tasks.push({
          ...parsed,
          ...(detailText.length > 0 ? { detailText } : {}),
          ...(steps.length > 0 ? { steps } : {}),
        });
      } else {
        i++;
      }
    }

    phases.push({
      number: phaseNum,
      name: phaseName,
      status: phaseStatus,
      tasks,
    });
    phaseMatch = phaseRegex.exec(text);
  }

  return { frontmatter, goal, phases };
}
