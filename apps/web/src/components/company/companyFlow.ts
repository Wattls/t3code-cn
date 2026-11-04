import type { CompanySnapshot, CompanyChangeScope } from "@t3tools/contracts";

export const companyFlowStages = ["research", "copy", "design", "review"] as const;
export type CompanyFlowNode = "brief" | (typeof companyFlowStages)[number] | "approval";
export type CompanyFlowTask = Pick<
  CompanySnapshot["tasks"][number],
  | "state"
  | "stage"
  | "revision"
  | "expectedImages"
  | "takeover"
  | "artifacts"
  | "approvals"
  | "runs"
  | "digest"
>;
export type CompanyFlowState =
  | "template"
  | "pending"
  | "done"
  | "reused"
  | "running"
  | "queued"
  | "blocked"
  | "stopped"
  | "takeover"
  | "awaiting_review";

export const companyFlowImpact: Record<CompanyChangeScope, readonly CompanyFlowNode[]> = {
  cover: ["design", "review", "approval"],
  copy: ["copy", "design", "review", "approval"],
  facts: ["research", "copy", "design", "review", "approval"],
};

export function getCompanyFlowNodeState(
  task: CompanyFlowTask | null,
  node: CompanyFlowNode,
): CompanyFlowState {
  if (!task) return "template";
  if (node === "brief") return "done";
  if (node === "approval") {
    if (
      task.state === "accepted" &&
      task.approvals.some(
        (approval) =>
          approval.valid && approval.revision === task.revision && approval.digest === task.digest,
      )
    )
      return "done";
    return task.state === "awaiting_review" ? "awaiting_review" : "pending";
  }
  if (node === task.stage && task.state !== "accepted" && task.state !== "awaiting_review") {
    if (task.takeover) return "takeover";
    return task.state;
  }
  // A finished terminal is not evidence of a usable deliverable.
  const artifacts = task.artifacts.filter((artifact) => artifact.stage === node && artifact.valid);
  const complete =
    node === "design"
      ? artifacts.some((artifact) => artifact.kind === "cover") &&
        artifacts.filter((artifact) => artifact.kind === "cover" || artifact.kind === "page")
          .length === task.expectedImages
      : artifacts.some((artifact) => artifact.kind === node);
  if (!complete) return "pending";
  const fromEarlierRevision = artifacts.every((artifact) =>
    task.runs.some((run) => run.id === artifact.runId && run.revision < task.revision),
  );
  return fromEarlierRevision ? "reused" : "done";
}
