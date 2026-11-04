import { describe, expect, it } from "vite-plus/test";
import { revise, artifactDigest, finishStage, resolveWorkflow, reworkStages } from "./domain.ts";
import { hasOriginalProcess, matchesRun, type HerdrTerminal } from "./HerdrBridge.ts";
import { fixtureTask, fixtureRun, fixtureOrganization } from "./fixtures.test-support.ts";

describe("company task boundaries", () => {
  it("a cover change preserves research, copy and inner pages, and revokes old acceptance", () => {
    const task = fixtureTask();
    const revised = revise(task, "cover", "只改封面标题", "later");
    expect(revised.revision).toBe(2);
    expect(revised.stage).toBe("design");
    expect(revised.artifacts.filter((a) => a.valid).map((a) => a.kind)).toEqual([
      "research",
      "copy",
      "page",
    ]);
    expect(revised.approvals[0]?.valid).toBe(false);
    expect(artifactDigest(revised.artifacts)).not.toBe(artifactDigest(task.artifacts));
  });
  it("fact changes invalidate every dependent artifact", () => {
    expect(
      revise(fixtureTask(), "facts", "关键事实改变", "later").artifacts.every((a) => !a.valid),
    ).toBe(true);
  });
  it("a completion cannot resurrect a stopped task", () => {
    const task = { ...fixtureTask(), state: "stopped" as const, runs: [fixtureRun()] };
    expect(finishStage(task, [], "later")).toBe(task);
  });
  it("refuses to revise while a stage has an active writer", () => {
    expect(() =>
      revise({ ...fixtureTask(), runs: [fixtureRun()] }, "cover", "change", "later"),
    ).toThrow();
  });
  it("does not treat a restarted shell or recycled terminal id as the old agent", () => {
    const run = fixtureRun();
    const terminal: HerdrTerminal = {
      address: "t1",
      name: null,
      created_ms: 1,
      pid: 11,
      state: "live",
      argv: ["codex"],
      cwd: run.workspace,
      labels: { "t3-company": "owned", run: run.id },
    };
    expect(matchesRun(terminal, run, "owned")).toBe(true);
    expect(matchesRun({ ...terminal, created_ms: 2 }, run, "owned")).toBe(false);
    expect(matchesRun(terminal, run, "another")).toBe(false);
    expect(hasOriginalProcess({ ...terminal, argv: ["/bin/zsh"], pid: 12 }, run)).toBe(false);
    expect(hasOriginalProcess({ ...terminal, reason: "stopped_by_restart" }, run)).toBe(false);
  });
});

describe("configured workflows", () => {
  it("routes unambiguously and freezes employee configuration", () => {
    const org = fixtureOrganization();
    const plan = resolveWorkflow(org, undefined, "department");
    expect(plan.workflowId).toBe("generic");
    const other = {
      ...org,
      workflows: [...org.workflows!, { ...org.workflows![0]!, id: "other" }],
    };
    expect(() => resolveWorkflow(other, undefined, "department")).toThrow("多个");
    expect(() => resolveWorkflow(org, "generic", "missing")).toThrow();
    expect(() =>
      resolveWorkflow(
        { ...org, workflows: [{ ...org.workflows![0]!, enabled: false }] },
        "generic",
      ),
    ).toThrow();
    const changed = {
      ...org,
      nodes: org.nodes.map((node) =>
        node.employee ? { ...node, employee: { ...node.employee, model: "another" } } : node,
      ),
    };
    expect(resolveWorkflow(changed, "generic").steps[0]?.execution.model).toBe("another");
    expect(plan.steps[0]?.execution.model).toBe("gpt-6-luna");
    expect(plan.steps[0]?.execution).not.toBe(org.nodes[2]?.employee);
    expect(plan.steps[0]?.execution.skills).not.toBe(org.nodes[2]?.employee?.skills);
  });
  it("hands off sequentially and revises only the selected stage and descendants", () => {
    const plan = resolveWorkflow(fixtureOrganization(), "generic");
    const task = {
      ...fixtureTask(),
      plan,
      stage: "draft",
      state: "running" as const,
      artifacts: [],
      runs: [{ ...fixtureRun(), stage: "draft" }],
    };
    const draft = { ...fixtureTask().artifacts[0]!, stage: "draft", kind: "file" as const };
    const checking = finishStage(task, [draft], "later");
    expect(checking.stage).toBe("check");
    expect(checking.state).toBe("queued");
    const audit = { ...draft, id: "audit", stage: "check" };
    const finished = finishStage(
      {
        ...checking,
        runs: [...checking.runs, { ...fixtureRun(), id: "audit-run", stage: "check" }],
      },
      [audit],
      "later",
    );
    expect(finished.state).toBe("awaiting_review");
    const revised = revise(finished, "facts", "redo audit", "later", "check");
    expect(revised.stage).toBe("check");
    expect(revised.artifacts.filter((a) => a.valid)).toEqual([draft]);
    expect(revised.approvals.every((a) => !a.valid)).toBe(true);
    expect(() => revise(finished, "facts", "invalid", "later", "missing")).toThrow();
    expect(reworkStages(finished, "draft")).toEqual(["draft", "check"]);
    expect(reworkStages(finished, "check")).toBe(null);
    expect(reworkStages(task, "draft")).toBe(null);
  });
});
