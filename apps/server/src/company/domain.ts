import type {
  CompanyArtifact,
  CompanyChangeScope,
  CompanyRun,
  CompanyStage,
  CompanyTask,
  CompanyOrganization,
  CompanyExecutionPlan,
} from "@t3tools/contracts";
import { CompanyError } from "@t3tools/contracts";

const stages: readonly CompanyStage[] = ["research", "copy", "design", "review"];
export const unknownUsage = { input: null, cachedInput: null, output: null, images: null };
export const currentRun = (task: CompanyTask) => task.runs.at(-1);
export const liveRun = (run: CompanyRun) => ["starting", "running", "blocked"].includes(run.state);
export function artifactDigest(artifacts: readonly CompanyArtifact[]): string {
  // Stable content identity, independent of display order or completion timestamps.
  return artifacts
    .filter((a) => a.valid)
    .map((a) => `${a.id}:${a.sha256}`)
    .sort()
    .join("|");
}
function changedArtifact(artifact: CompanyArtifact, scope: CompanyChangeScope): boolean {
  return (
    scope === "facts" ||
    artifact.stage === "review" ||
    (scope === "copy" && artifact.stage !== "research") ||
    (scope === "cover" && artifact.kind === "cover")
  );
}
export function revise(
  task: CompanyTask,
  scope: CompanyChangeScope,
  text: string,
  at: string,
  fromStep?: string,
): CompanyTask {
  const start = task.plan
    ? task.plan.steps.findIndex((step) => step.id === (fromStep ?? task.plan?.steps[0]?.id))
    : -1;
  if (task.plan && start < 0) throw new CompanyError({ message: "修改起始阶段不存在。" });
  const affected = task.plan?.steps.slice(start).map((step) => step.id);
  if (task.takeover || task.runs.some(liveRun))
    throw new CompanyError({ message: "请先停止当前执行或结束终端接管，再提交修改。" });
  return {
    ...task,
    revision: task.revision + 1,
    scope,
    stage: task.plan
      ? task.plan.steps[start]!.id
      : scope === "facts"
        ? "research"
        : scope === "copy"
          ? "copy"
          : "design",
    state: "queued",
    reason: null,
    notBefore: null,
    reworkCount: 0,
    networkRetries: 0,
    updatedAt: at,
    feedback: [...task.feedback, { revision: task.revision + 1, scope, text }],
    artifacts: task.artifacts.map((a) =>
      (affected ? affected.includes(a.stage) : changedArtifact(a, scope))
        ? { ...a, valid: false }
        : a,
    ),
    approvals: task.approvals.map((a) => ({ ...a, valid: false })),
    events: [...task.events, { at, kind: "feedback", detail: text }],
  };
}
export function finishStage(
  task: CompanyTask,
  artifacts: readonly CompanyArtifact[],
  at: string,
): CompanyTask {
  const run = currentRun(task);
  if (!run || task.state === "stopped" || task.takeover) return task;
  const sequence = task.plan?.steps.map((step) => step.id) ?? stages;
  const next = sequence[sequence.indexOf(task.stage) + 1];
  return {
    ...task,
    artifacts: [...task.artifacts, ...artifacts],
    runs: task.runs.map((r) =>
      r.id === run.id ? { ...r, state: "completed", finishedAt: at, reason: null } : r,
    ),
    stage: next ?? task.stage,
    state: next ? "queued" : "awaiting_review",
    reason: null,
    updatedAt: at,
    events: [...task.events, { at, kind: "stage_completed", detail: run.stage }],
  };
}
export function invalidateApproval(task: CompanyTask, reason: string, at: string): CompanyTask {
  return {
    ...task,
    state: "blocked",
    reason,
    updatedAt: at,
    approvals: task.approvals.map((a) => ({ ...a, valid: false })),
    events: [...task.events, { at, kind: "evidence_changed", detail: reason }],
  };
}

export function resolveWorkflow(
  organization: CompanyOrganization,
  workflowId?: string,
  departmentId?: string,
): CompanyExecutionPlan {
  const candidates = (organization.workflows ?? []).filter(
    (flow) =>
      flow.enabled &&
      (!workflowId || flow.id === workflowId) &&
      (!departmentId || flow.departmentId === departmentId),
  );
  if (candidates.length !== 1)
    throw new CompanyError({
      message: candidates.length
        ? "此部门有多个可用流程，请明确选择工作流程。"
        : "没有匹配的已启用流程，请检查部门和流程配置。",
    });
  const flow = candidates[0]!;
  const department = organization.nodes.find((node) => node.id === flow.departmentId);
  if (!department) throw new CompanyError({ message: "流程所属部门不存在。" });
  return {
    workflowId: flow.id,
    name: flow.name,
    departmentId: department.id,
    departmentName: department.name,
    steps: flow.steps.map((step) => {
      const employee = organization.nodes.find((node) => node.id === step.employeeId);
      if (!employee?.employee) throw new CompanyError({ message: "流程员工未配置执行能力。" });
      return {
        ...step,
        outputFiles: [...step.outputFiles],
        employeeName: employee.name,
        responsibility: employee.responsibility,
        execution: { ...employee.employee, skills: [...employee.employee.skills] },
      };
    }),
  };
}
export function reworkStages(task: CompanyTask, target?: string): readonly string[] | null {
  const sequence = task.plan?.steps.map((step) => step.id) ?? stages;
  const index = target ? sequence.indexOf(target) : -1;
  const reviewing = task.plan
    ? task.plan.steps.find((step) => step.id === task.stage)?.kind === "review"
    : task.stage === "review";
  return reviewing && index >= 0 && index < sequence.indexOf(task.stage)
    ? sequence.slice(index)
    : null;
}
