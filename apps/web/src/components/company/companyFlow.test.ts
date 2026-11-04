import { expect, it } from "vite-plus/test";
import type { CompanyArtifact, CompanyRun } from "@t3tools/contracts";
import { getCompanyFlowNodeState, companyFlowImpact, type CompanyFlowTask } from "./companyFlow";

const task = (changes: Partial<CompanyFlowTask> = {}): CompanyFlowTask => ({
  state: "running",
  stage: "design",
  revision: 2,
  expectedImages: 2,
  takeover: false,
  artifacts: [],
  approvals: [],
  runs: [],
  digest: "current",
  ...changes,
});
const artifact = (kind: CompanyArtifact["kind"], valid = true): CompanyArtifact => ({
  id: kind,
  runId: "run1",
  kind,
  stage: kind === "cover" || kind === "page" ? "design" : kind,
  valid,
  name: kind,
  path: "/synthetic/" + kind,
  sha256: "hash",
  bytes: 1,
});

it("distinguishes the workflow explanation from a real task and never treats a completed process as an accepted artifact", () => {
  expect(getCompanyFlowNodeState(null, "research")).toBe("template");
  const sample = task({
    runs: [{ id: "run1", revision: 1, stage: "research", state: "completed" } as CompanyRun],
  });
  expect(getCompanyFlowNodeState(sample, "research")).toBe("pending");
  expect(getCompanyFlowNodeState(sample, "design")).toBe("running");
  expect(getCompanyFlowNodeState(task({ state: "blocked" }), "design")).toBe("blocked");
  expect(getCompanyFlowNodeState(task({ state: "stopped" }), "design")).toBe("stopped");
  expect(getCompanyFlowNodeState(task({ takeover: true }), "design")).toBe("takeover");
});

it("keeps reused research and copy visible during a cover revision but invalidates review and approval", () => {
  const sample = task({
    state: "queued",
    artifacts: [
      artifact("research"),
      artifact("copy"),
      artifact("page"),
      artifact("cover", false),
      artifact("review", false),
    ],
    runs: [{ id: "run1", revision: 1 } as CompanyRun],
    approvals: [
      { id: "old", revision: 1, digest: "old", valid: true, scope: "quality", at: "now" },
    ],
  });
  expect(getCompanyFlowNodeState(sample, "research")).toBe("reused");
  expect(getCompanyFlowNodeState(sample, "copy")).toBe("reused");
  expect(getCompanyFlowNodeState(sample, "design")).toBe("queued");
  expect(getCompanyFlowNodeState(sample, "review")).toBe("pending");
  expect(getCompanyFlowNodeState(sample, "approval")).toBe("pending");
  expect(companyFlowImpact.cover).toEqual(["design", "review", "approval"]);
  expect(companyFlowImpact.copy).toEqual(["copy", "design", "review", "approval"]);
  expect(companyFlowImpact.facts).toEqual(["research", "copy", "design", "review", "approval"]);
});

it("requires a complete image set and a current approval fingerprint for green completion", () => {
  expect(
    getCompanyFlowNodeState(task({ stage: "review", artifacts: [artifact("page")] }), "design"),
  ).toBe("pending");
  expect(
    getCompanyFlowNodeState(
      task({ stage: "review", artifacts: [artifact("page"), artifact("cover")] }),
      "design",
    ),
  ).toBe("done");
  expect(getCompanyFlowNodeState(task({ state: "awaiting_review" }), "approval")).toBe(
    "awaiting_review",
  );
  const accepted = task({
    state: "accepted",
    approvals: [
      { id: "a", revision: 2, digest: "current", valid: true, scope: "quality", at: "now" },
    ],
  });
  expect(getCompanyFlowNodeState(accepted, "approval")).toBe("done");
  expect(getCompanyFlowNodeState({ ...accepted, digest: "changed" }, "approval")).toBe("pending");
});
