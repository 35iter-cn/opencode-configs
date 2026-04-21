import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  extractMarkdownParts,
  notesSectionIsValid,
  parseNumberedTaskSteps,
  parsePlanMarkdown,
  parseTaskLine,
} from "../plan-markdown";

// --- 反例用 fixture（除 plan-template.md 正例外，均表示禁止/非规范/会失败或特殊行为）---

// 反例：全文 CRLF 换行（非 LF），须与 LF 解析结果一致。
const PLAN_CRLF = [
  "---",
  "status: in-progress",
  "updated: 2026-04-21",
  "---",
  "",
  "## Goal",
  "",
  "Ship the feature with tests.",
  "",
  "## Phase 1: First [PENDING]",
  "",
  "- [ ] 1.1 Find references #search",
  "",
].join("\r\n");

// 反例：仅使用单独 CR 换行，须规范化为 \n 后解析。
const PLAN_LONE_CR =
  "---\rstatus: complete\rupdated: 2026-01-01\r---\r\r## Goal\r\rOnly goal here.\r";

// 反例：仅在 frontmatter 中写 goal、无 ## Goal 正文——不得将 YAML goal 当作正文 goal。
const PLAN_ANTI_GOAL_YAML_ONLY = `---
status: not-started
updated: 2026-04-21
goal: From YAML only
---
`;

// 反例：有 ## Goal 标题但无正文、下一节直接 Phase——goal 应为 null。
const PLAN_ANTI_EMPTY_GOAL_SECTION = `---
status: in-progress
updated: 2026-04-21
---

## Goal

## Phase 1: Placeholder [PENDING]

- [ ] 1.1 One task #search
`;

// 反例：frontmatter 与 ## Goal 同时写 goal——须忽略 YAML，只采正文（非模板最小片段）。
const PLAN_GOAL_MARKDOWN_OVERRIDES_YAML = `---
status: in-progress
updated: 2026-04-21
goal: YAML goal text here
---

## Goal

Markdown goal wins because it is longer.
`;

// 任务 ID 使用 **1.1** 包裹——仍应解析为任务。
const PLAN_TASK_BOLD_AROUND_ID = `---
status: in-progress
updated: 2026-04-21
---

## Goal

Minimum ten chars goal text here.

## Phase 1: Build [PENDING]

- [ ] **1.1** Task title with bold id #implementation
`;

// 反例：非 plan-template 的极简多任务片段（用于 CURRENT / #tag，非正例全文）。
const PLAN_FRAGMENT_TASKS_CURRENT = `---
status: in-progress
updated: 2026-04-21
---

## Goal

Minimum ten chars goal text here.

## Phase 1: Build [IN PROGRESS]

- [x] 1.1 Write tests for extraction #implementation
- [ ] 1.2 Implement feature #implementation ← CURRENT
`;

// 反例：Notes 在文末前须有全部 Phase（Notes 后不得再出现 Phase）。
const PLAN_NOTES_LAST_STOPS_PHASE = `---
status: in-progress
updated: 2026-04-21
---

## Goal

Minimum ten chars goal text here.

## Phase 1: One [PENDING]

- [ ] 1.1 Task A #documentation

## Phase 2: Two [PENDING]

- [ ] 2.1 Task B #testing

## Notes

Extra text after phases; Notes is the last heading.
`;

// 反例：## Notes 出现在中间、其后仍有 ## Phase——notesSectionIsValid 为 false。
const PLAN_ANTI_NOTES_NOT_LAST = `---
status: in-progress
updated: 2026-04-21
---

## Goal

Minimum ten chars goal text here.

## Phase 1: One [PENDING]

- [ ] 1.1 Task A #documentation

## Notes

Notes must not appear before the last phase.

## Phase 2: Two [PENDING]

- [ ] 2.1 Task B #testing
`;

// 反例：Phase [STATUS] 非法（如 [DONE]）——parsePlanMarkdown 失败。
const PLAN_ANTI_INVALID_PHASE_STATUS = `---
status: in-progress
updated: 2026-04-21
---

## Goal

Minimum ten chars goal text here.

## Phase 1: Wrong status [DONE]

- [ ] 1.1 Task #search
`;

// 反例：非计划结构纯文本。
const PLAIN_NO_STRUCTURE = "just plain text without plan structure";

// 反例：有 frontmatter 与足够长的 ## Goal，但无任何 ## Phase——phases 为空。
const PLAN_ANTI_PARSE_NO_PHASE = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal text is intentionally longer than ten characters.
`;

// 任务行可无 #tag — 应能通过校验。
const PLAN_UNTAGGED_TASK_OK = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal has at least ten characters for the parser.

## Phase 1: Build [PENDING]

- [ ] 1.1 Untagged task line only

## Notes

N.
`;

// #implementation：仅 RED/GREEN（无 REFACTOR）— 应无 warning。
const PLAN_IMPL_RED_GREEN_ONLY = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal has at least ten characters for the parser.

## Phase 1: Build [IN PROGRESS]

- [ ] 1.1 Short title #implementation ← CURRENT
  1. First step. [RED]
  2. Second. [RED]
  3. Third. [GREEN]
  4. Fourth. [GREEN]

## Notes

Notes here.
`;

// #implementation：含可选 [REFACTOR] 步骤 — 应无 warning。
const PLAN_IMPL_WITH_OPTIONAL_REFACTOR = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal has at least ten characters for the parser.

## Phase 1: Build [IN PROGRESS]

- [ ] 1.1 Short title #implementation ← CURRENT
  1. First step. [RED]
  2. Second. [RED]
  3. Third. [GREEN]
  4. Fourth. [GREEN]
  5. Fifth. [REFACTOR]
  6. Refactor scope cleanup. [REFACTOR]

## Notes

Notes here.
`;

// #implementation：缺 GREEN — 应有 warning。
const PLAN_IMPL_MISSING_GREEN = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal has at least ten characters for the parser.

## Phase 1: Build [IN PROGRESS]

- [ ] 1.1 Short title #implementation ← CURRENT
  1. First. [RED]
  2. Second. [RED]
  3. Third. [REFACTOR]
  4. Fourth. Refactor scope. [REFACTOR]

## Notes

Notes.
`;

// [RED] 不在行末 — stray；parsePlanMarkdown 应直接失败。
const PLAN_IMPL_STRAY_MARKER = `---
status: in-progress
updated: 2026-04-21
---

## Goal

This goal has at least ten characters for the parser.

## Phase 1: Build [IN PROGRESS]

- [ ] 1.1 Short title #implementation ← CURRENT
  1. [RED] Bad placement
  2. Good line [GREEN]

## Notes

Notes.
`;

describe("正例", () => {
  it("任务行无 #tag 时 parsePlanMarkdown 仍通过", () => {
    const result = parsePlanMarkdown(PLAN_UNTAGGED_TASK_OK);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phases[0].tasks[0].id).toBe("1.1");
      expect(result.data.phases[0].tasks[0].tag).toBeUndefined();
      expect(result.warnings.length).toBe(0);
    }
  });

  it("plan-template.md 通过 parsePlanMarkdown", () => {
    const md = readFileSync(
      join(import.meta.dir, "../../skills/plan-protocol/plan-template.md"),
      "utf8",
    );
    const result = parsePlanMarkdown(md);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.frontmatter.status).toBe("in-progress");
      expect(result.data.frontmatter.updated).toBe("2026-04-21");
      expect(result.data.goal).toContain("login");
      expect(result.data.phases.length).toBe(3);
      expect(result.data.phases[1].tasks[0].id).toBe("2.1");
      expect(result.data.phases[1].tasks[0].tag).toBe("implementation");
      expect(result.data.phases[1].tasks[0].isCurrent).toBe(true);
      expect(result.data.phases[1].tasks[0].steps?.length).toBe(6);
      expect(result.warnings.length).toBe(0);
    }
  });

  it("#implementation 仅需步骤中含 RED 与 GREEN（可无 REFACTOR）", () => {
    const result = parsePlanMarkdown(PLAN_IMPL_RED_GREEN_ONLY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBe(0);
    }
  });

  it("#implementation 含可选 [REFACTOR] 步骤时仍无 warning", () => {
    const result = parsePlanMarkdown(PLAN_IMPL_WITH_OPTIONAL_REFACTOR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBe(0);
    }
  });

  it("parseTaskLine：#tag 可为任意非空标签（如含连字符）", () => {
    const parsed = parseTaskLine("- [ ] 2.3 Do thing #my-custom-tag");
    expect(parsed?.tag).toBe("my-custom-tag");
    expect(parsed?.content).toBe("Do thing");
  });

  it("parseNumberedTaskSteps：行末 [RED]/[GREEN] 与 steps 数组", () => {
    const steps = parseNumberedTaskSteps([
      "  1. First. [RED]",
      "  2. Second [GREEN]",
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.n).toBe(1);
    expect(steps[0]?.tddMarker).toBe("RED");
    expect(steps[1]?.tddMarker).toBe("GREEN");
    expect(steps[0]?.strayTddMarker).toBe(false);
  });

  it("plan-template：implementation 任务解析出 6 条编号步骤", () => {
    const md = readFileSync(
      join(import.meta.dir, "../../skills/plan-protocol/plan-template.md"),
      "utf8",
    );
    const result = extractMarkdownParts(md);
    const steps = result.phases[1]?.tasks[0]?.steps;
    expect(steps?.length).toBe(6);
    expect(steps?.filter((s) => s.tddMarker === "RED").length).toBeGreaterThan(0);
    expect(steps?.filter((s) => s.tddMarker === "GREEN").length).toBeGreaterThan(0);
  });

  it("任务行对 ID 两侧加粗 **1.1**：仍可解析任务", () => {
    const result = extractMarkdownParts(PLAN_TASK_BOLD_AROUND_ID);

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].tasks).toHaveLength(1);
    expect(result.phases[0].tasks[0]).toMatchObject({
      id: "1.1",
      tag: "implementation",
      content: "Task title with bold id",
    });
  });
});

describe("反例", () => {
  it("全文 CRLF：与 LF 解析结果一致（非规范换行输入）", () => {
    const result = extractMarkdownParts(PLAN_CRLF);

    expect(result.frontmatter).toEqual({
      status: "in-progress",
      updated: "2026-04-21",
    });
    expect(result.goal).toBe("Ship the feature with tests.");
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      name: "First",
      status: "PENDING",
    });
    expect(result.phases[0].tasks[0]).toMatchObject({
      id: "1.1",
      tag: "search",
      checked: false,
      content: "Find references",
      isCurrent: false,
    });
  });

  it("仅 CR 换行：规范 lone CR 后与 LF 一致", () => {
    const result = extractMarkdownParts(PLAN_LONE_CR);

    expect(result.frontmatter?.status).toBe("complete");
    expect(result.goal).toBe("Only goal here.");
  });

  it("不得仅用 frontmatter 的 goal：无 ## Goal 正文时 goal 为 null", () => {
    const result = extractMarkdownParts(PLAN_ANTI_GOAL_YAML_ONLY);

    expect(result.goal).toBeNull();
    expect(result.frontmatter?.goal).toBe("From YAML only");
  });

  it("## Goal 下无正文行：goal 为 null", () => {
    const result = extractMarkdownParts(PLAN_ANTI_EMPTY_GOAL_SECTION);

    expect(result.goal).toBeNull();
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].tasks).toHaveLength(1);
    expect(result.phases[0].tasks[0].id).toBe("1.1");
  });

  it("正文与 YAML 同时有 goal：只采用 ## Goal 正文", () => {
    const result = extractMarkdownParts(PLAN_GOAL_MARKDOWN_OVERRIDES_YAML);

    expect(result.goal).toBe("Markdown goal wins because it is longer.");
  });

  it("非模板片段：任务行 #tag、CURRENT（非全文正例）", () => {
    const result = extractMarkdownParts(PLAN_FRAGMENT_TASKS_CURRENT);

    expect(result.phases).toHaveLength(1);
    const tasks = result.phases[0].tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "1.1",
      tag: "implementation",
      checked: true,
      content: "Write tests for extraction",
      isCurrent: false,
    });
    expect(tasks[1]).toMatchObject({
      id: "1.2",
      tag: "implementation",
      checked: false,
      content: "Implement feature",
      isCurrent: true,
    });
  });

  it("Notes 在全部 Phase 之后：phase 正文在 Notes 处截断", () => {
    expect(notesSectionIsValid(PLAN_NOTES_LAST_STOPS_PHASE)).toBe(true);

    const result = extractMarkdownParts(PLAN_NOTES_LAST_STOPS_PHASE);

    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].tasks[0].content).toBe("Task A");
    expect(result.phases[1].tasks[0].content).toBe("Task B");
  });

  it("无 frontmatter/phase 结构：均为空", () => {
    const result = extractMarkdownParts(PLAIN_NO_STRUCTURE);

    expect(result.frontmatter).toBeNull();
    expect(result.goal).toBeNull();
    expect(result.phases).toEqual([]);
  });

  it("任务行末尾无 #tag：仍解析为任务且 tag 缺省", () => {
    const parsed = parseTaskLine("- [ ] 1.1 Title without trailing tag");
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("1.1");
    expect(parsed?.tag).toBeUndefined();
    expect(parsed?.content).toBe("Title without trailing tag");
  });

  it("## Notes 后仍出现 ## Phase：notesSectionIsValid 为 false", () => {
    expect(notesSectionIsValid(PLAN_ANTI_NOTES_NOT_LAST)).toBe(false);
  });

  it("非法 PhaseStatus（如 [DONE]）：parsePlanMarkdown 失败并提示合法取值", () => {
    const result = parsePlanMarkdown(PLAN_ANTI_INVALID_PHASE_STATUS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("[phases.0.status]");
      expect(result.error).toContain("PENDING");
      expect(result.error).toContain("IN PROGRESS");
      expect(result.error).toContain("Phase [STATUS]");
    }
  });

  it("无 ## Goal 正文：parsePlanMarkdown 返回 ok: false", () => {
    const result = parsePlanMarkdown(PLAN_ANTI_GOAL_YAML_ONLY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("[goal]");
    }
  });

  it("无 ## Phase：parsePlanMarkdown 返回 ok: false", () => {
    const result = parsePlanMarkdown(PLAN_ANTI_PARSE_NO_PHASE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("[phases]");
    }
  });

  it("极简片段中 #implementation 无步骤：parsePlanMarkdown 返回 ok: false", () => {
    const result = parsePlanMarkdown(PLAN_FRAGMENT_TASKS_CURRENT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("#implementation");
      expect(result.error).toContain("[RED]");
    }
  });

  it("#implementation 缺 GREEN：parsePlanMarkdown 返回 ok: false", () => {
    const result = parsePlanMarkdown(PLAN_IMPL_MISSING_GREEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("1.1");
      expect(result.error).toContain("[GREEN]");
    }
  });

  it("#implementation：TDD 标记不在行末时 parsePlanMarkdown 失败", () => {
    const result = parsePlanMarkdown(PLAN_IMPL_STRAY_MARKER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("only at the end");
      expect(result.error).toContain("step 1");
    }
  });
});
