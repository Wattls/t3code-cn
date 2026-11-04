import * as Schema from "effect/Schema";

const Id = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,80}$/));
const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16000));
export const CompanyStage = Id;
const safeRelativePath = (path: string) =>
  !/[\\\x00-\x1f]/.test(path) &&
  path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
const SkillPath = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.makeFilter(
    (path) =>
      path.startsWith("shared-skills/") && path.endsWith("/SKILL.md") && safeRelativePath(path),
  ),
);
export const CompanyEmployee = Schema.Struct({
  provider: Schema.Literal("codex"),
  model: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/)),
  effort: Schema.Literals(["low", "medium", "high", "xhigh", "max", "ultra"]),
  skills: Schema.Array(SkillPath).check(Schema.isMaxLength(12)),
});
export type CompanyEmployee = typeof CompanyEmployee.Type;
const WorkflowStep = Schema.Struct({
  id: Id,
  name: Text,
  employeeId: Id,
  kind: Schema.Literals(["produce", "review"]),
  instructions: Text,
  acceptance: Text,
  outputFiles: Schema.Array(
    Schema.String.check(
      Schema.makeFilter((path) => path.startsWith("outputs/") && safeRelativePath(path)),
      Schema.isMaxLength(240),
    ),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
});
export const CompanyBusinessWorkflow = Schema.Struct({
  id: Id,
  name: Text,
  departmentId: Id,
  enabled: Schema.Boolean,
  steps: Schema.Array(WorkflowStep).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
});
export type CompanyBusinessWorkflow = typeof CompanyBusinessWorkflow.Type;
export const CompanyExecutionPlan = Schema.Struct({
  workflowId: Id,
  name: Text,
  departmentId: Id,
  departmentName: Text,
  steps: Schema.Array(
    Schema.Struct({
      ...WorkflowStep.fields,
      employeeName: Text,
      responsibility: Text,
      execution: CompanyEmployee,
    }),
  ),
});
export type CompanyExecutionPlan = typeof CompanyExecutionPlan.Type;
export type CompanyStage = typeof CompanyStage.Type;
export const CompanyChangeScope = Schema.Literals(["cover", "copy", "facts"]);
export type CompanyChangeScope = typeof CompanyChangeScope.Type;
export const CompanyUsage = Schema.Struct({
  input: Schema.NullOr(Schema.Number),
  cachedInput: Schema.NullOr(Schema.Number),
  output: Schema.NullOr(Schema.Number),
  images: Schema.NullOr(Schema.Number),
});
export const CompanyArtifact = Schema.Struct({
  id: Id,
  runId: Id,
  stage: CompanyStage,
  kind: Schema.Literals(["research", "copy", "cover", "page", "review", "file"]),
  name: Schema.String,
  path: Schema.String,
  sha256: Schema.String,
  bytes: Schema.Number,
  valid: Schema.Boolean,
});
export type CompanyArtifact = typeof CompanyArtifact.Type;
export const CompanyRun = Schema.Struct({
  id: Id,
  stage: CompanyStage,
  revision: Schema.Int,
  attempt: Schema.Int,
  state: Schema.Literals([
    "planned",
    "starting",
    "running",
    "blocked",
    "completed",
    "lost",
    "stopped",
  ]),
  employeeId: Schema.optionalKey(Id),
  execution: Schema.optionalKey(CompanyEmployee),
  terminalId: Schema.NullOr(Schema.String),
  terminalCreatedMs: Schema.NullOr(Schema.Number),
  pid: Schema.NullOr(Schema.Number),
  providerSessionId: Schema.NullOr(Schema.String),
  resumedFrom: Schema.optionalKey(Id),
  usageBaseline: Schema.optionalKey(CompanyUsage),
  inputDigest: Schema.String,
  workspace: Schema.String,
  reason: Schema.NullOr(Schema.String),
  usage: CompanyUsage,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
});
export type CompanyRun = typeof CompanyRun.Type;
export const CompanyApproval = Schema.Struct({
  id: Id,
  revision: Schema.Int,
  digest: Schema.String,
  at: Schema.String,
  valid: Schema.Boolean,
  scope: Schema.Literal("quality"),
});
export const CompanyMemory = Schema.Struct({
  id: Id,
  text: Schema.String,
  source: Schema.String,
  scope: Schema.Literals(["task", "company"]),
  confirmed: Schema.Boolean,
  supersedes: Schema.NullOr(Id),
});
export const CompanyTask = Schema.Struct({
  plan: Schema.optionalKey(CompanyExecutionPlan),
  assignments: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        stage: CompanyStage,
        employeeId: Id,
        employeeName: Text,
        responsibility: Text,
        execution: CompanyEmployee,
      }),
    ),
  ),
  id: Id,
  title: Schema.String,
  brief: Schema.String,
  references: Schema.Array(Schema.String),
  revision: Schema.Int,
  expectedImages: Schema.Int,
  scope: CompanyChangeScope,
  state: Schema.Literals([
    "queued",
    "running",
    "blocked",
    "awaiting_review",
    "accepted",
    "stopped",
  ]),
  stage: CompanyStage,
  reason: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  feedback: Schema.Array(
    Schema.Struct({ revision: Schema.Int, scope: CompanyChangeScope, text: Schema.String }),
  ),
  runs: Schema.Array(CompanyRun),
  artifacts: Schema.Array(CompanyArtifact),
  approvals: Schema.Array(CompanyApproval),
  memories: Schema.Array(CompanyMemory),
  events: Schema.Array(
    Schema.Struct({ at: Schema.String, kind: Schema.String, detail: Schema.String }),
  ),
  notBefore: Schema.NullOr(Schema.String),
  reworkCount: Schema.Int,
  networkRetries: Schema.Int,
  takeover: Schema.Boolean,
});
export type CompanyTask = typeof CompanyTask.Type;
export const CompanySettings = Schema.Struct({
  enabled: Schema.Boolean,
  rulesRoot: Schema.String,
  knowledgeRoot: Schema.String,
});
export type CompanySettings = typeof CompanySettings.Type;
export const COMPANY_WORKFLOW_PATH = "rules/ai-company/rednote.json";
const CompanyRole = Schema.Struct({
  responsibility: Text,
  acceptance: Text,
  skills: Schema.Array(Text),
});
export const CompanyWorkflow = Schema.Struct({
  version: Text,
  authorization: Schema.Array(Text),
  stages: Schema.Struct({
    research: CompanyRole,
    copy: CompanyRole,
    design: CompanyRole,
    review: CompanyRole,
  }),
});
export type CompanyWorkflow = typeof CompanyWorkflow.Type;
export const COMPANY_ORGANIZATION_PATH = "rules/ai-company/organization.json";
export const CompanyOrganizationNode = Schema.Struct({
  employee: Schema.optionalKey(Schema.NullOr(CompanyEmployee)),
  id: Id,
  parentId: Schema.NullOr(Id),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  kind: Schema.Literals(["owner", "coordinator", "department", "lead", "channel", "role"]),
  state: Schema.Literals(["confirmed", "reference", "planned"]),
  responsibility: Text,
  authority: Text,
  memory: Text,
  sources: Schema.Array(Text).check(Schema.isMaxLength(10)),
  workflow: Schema.NullOr(Schema.Literal("rednote")),
  stage: Schema.NullOr(Schema.Literals(["research", "copy", "design", "review"])),
});
export const CompanyOrganization = Schema.Struct({
  workflows: Schema.optionalKey(
    Schema.Array(CompanyBusinessWorkflow).check(Schema.isMaxLength(64)),
  ),
  lastCommand: Schema.optionalKey(Schema.Struct({ id: Id, fingerprint: Text })),
  version: Text,
  name: Text,
  nodes: Schema.Array(CompanyOrganizationNode).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
}).check(
  Schema.makeFilter((organization) => {
    const nodes = new Map(organization.nodes.map((node) => [node.id, node]));
    const roots = organization.nodes.filter((node) => node.parentId === null);
    if (
      nodes.size !== organization.nodes.length ||
      roots.length !== 1 ||
      roots[0]?.kind !== "owner"
    )
      return "组织需要唯一的本人根节点，节点标识不能重复。";
    const bindings = new Set<string>();
    const workflows = organization.workflows ?? [];
    if (new Set(workflows.map((flow) => flow.id)).size !== workflows.length)
      return "流程标识重复。";
    for (const flow of workflows) {
      if (flow.id === "rednote") return "小红书内置流程标识不可复用。";
      if (nodes.get(flow.departmentId)?.kind !== "department") return "流程必须归属于有效部门。";
      if (new Set(flow.steps.map((step) => step.id)).size !== flow.steps.length)
        return "流程阶段标识重复。";
      for (const [index, step] of flow.steps.entries()) {
        const employee = nodes.get(step.employeeId);
        if (!employee?.employee || !["role", "lead", "coordinator"].includes(employee.kind))
          return "流程负责人必须是已配置执行能力的员工。";
        if (
          new Set(step.outputFiles).size !== step.outputFiles.length ||
          step.outputFiles.some(
            (path) =>
              path.split("/").some((part) => !part || part === "." || part === "..") ||
              path === "outputs/report.md",
          )
        )
          return "成果文件路径无效、重复或占用系统报告。";
        if (
          step.kind === "review" &&
          (index === 0 ||
            index !== flow.steps.length - 1 ||
            flow.steps.slice(0, index).some((prior) => prior.employeeId === step.employeeId))
        )
          return "独立审核必须由另一位员工在最后执行。";
      }
    }
    for (const node of organization.nodes) {
      const seen = new Set<string>();
      let current: typeof node | undefined = node;
      while (current) {
        if (seen.has(current.id) || seen.size >= 8) return "组织存在循环或超过八层。";
        seen.add(current.id);
        if (current.parentId === null) break;
        current = nodes.get(current.parentId);
        if (!current) return "组织包含不存在的上级。";
      }
      if (node.employee && !["role", "lead", "coordinator"].includes(node.kind))
        return "只有员工或负责人可以配置模型。";
      if (node.kind === "owner" && node.parentId !== null) return "本人必须是根节点。";
      if (node.workflow !== null && node.kind !== "channel") return "工作流只能关联渠道节点。";
      if (node.stage !== null) {
        const parent = node.parentId ? nodes.get(node.parentId) : undefined;
        if (node.kind !== "role" || parent?.workflow !== "rednote")
          return "制作岗位必须归属已关联小红书工作流的渠道。";
      }
      const binding = node.workflow ?? node.stage;
      if (binding !== null) {
        if (node.state !== "confirmed" || bindings.has(binding))
          return "执行关联必须已确认且唯一。";
        bindings.add(binding);
      }
    }
    return true;
  }),
);
export type CompanyOrganization = typeof CompanyOrganization.Type;
export const CompanySnapshot = Schema.Struct({
  settings: CompanySettings,
  workflow: Schema.NullOr(CompanyWorkflow),
  organization: Schema.optionalKey(Schema.NullOr(CompanyOrganization)),
  organizationRevision: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tasks: Schema.Array(Schema.Struct({ ...CompanyTask.fields, digest: Schema.String })),
  connection: Schema.Literals(["disabled", "connecting", "online", "offline"]),
  serviceMode: Schema.String,
  workspaceRoot: Schema.String,
});
export type CompanySnapshot = typeof CompanySnapshot.Type;
export class CompanyError extends Schema.TaggedError<CompanyError>()("CompanyError", {
  message: Schema.String,
}) {}
const TaskCommand = { commandId: Id, taskId: Id, revision: Schema.Int };
export const CompanyCommand = Schema.Union([
  Schema.Struct({
    commandId: Id,
    type: Schema.Literal("create"),
    title: Text,
    brief: Text,
    departmentId: Schema.optionalKey(Id),
    workflowId: Schema.optionalKey(Id),
    expectedImages: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
    references: Schema.Array(Schema.String.check(Schema.isMaxLength(2048))).check(
      Schema.isMaxLength(15),
    ),
  }),
  Schema.Struct({
    ...TaskCommand,
    type: Schema.Literal("feedback"),
    fromStep: Schema.optionalKey(Id),
    text: Text,
    scope: CompanyChangeScope,
  }),
  Schema.Struct({ ...TaskCommand, type: Schema.Literals(["stop", "resume", "reconcile"]) }),
  Schema.Struct({ ...TaskCommand, type: Schema.Literal("approve"), digest: Text }),
  Schema.Struct({ ...TaskCommand, type: Schema.Literal("takeover"), enabled: Schema.Boolean }),
  Schema.Struct({
    ...TaskCommand,
    type: Schema.Literal("memory"),
    memoryId: Id,
    scope: Schema.Literals(["task", "company"]),
    confirmed: Schema.optionalKey(Schema.Boolean),
    supersedes: Schema.optionalKey(Id),
  }),
]);
export type CompanyCommand = typeof CompanyCommand.Type;
export const CompanyConfigureInput = Schema.Struct({ commandId: Id, ...CompanySettings.fields });
export type CompanyConfigureInput = typeof CompanyConfigureInput.Type;
export const CompanySaveOrganizationInput = Schema.Struct({
  commandId: Id,
  expectedRevision: Text,
  organization: CompanyOrganization,
});
export const CompanyCatalog = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({ id: Text, name: Text, efforts: Schema.Array(Schema.String) }),
  ),
  skills: Schema.Array(Schema.Struct({ path: SkillPath, name: Text })),
});
export type CompanyCatalog = typeof CompanyCatalog.Type;
export const CompanyTaskInput = Schema.Struct({ taskId: Id });
export const CompanyArtifactInput = Schema.Struct({ taskId: Id, artifactId: Id });
export const CompanyArtifactContent = Schema.Struct({
  mime: Schema.String,
  base64: Schema.String,
  name: Schema.String,
});
export const CompanyTerminalInput = Schema.Struct({ taskId: Id, runId: Id });
export const CompanyTerminalKeysInput = Schema.Struct({
  ...CompanyTerminalInput.fields,
  commandId: Id,
  keys: Schema.Array(Schema.String.check(Schema.isMaxLength(20))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(32),
  ),
});
export const CompanyTerminalOutput = Schema.Struct({
  text: Schema.String,
  complete: Schema.Boolean,
});

// Workers submit evidence; only the backend can turn it into accepted artifacts.
export const CompanyDelivery = Schema.Struct({
  runId: Id,
  revision: Schema.Int,
  stage: CompanyStage,
  inputDigest: Schema.String,
  result: Schema.Literals(["pass", "blocked", "changes_requested"]),
  reason: Schema.String,
  blockReason: Schema.optional(
    Schema.Literals(["input", "permission", "quota", "network", "quality", "unknown"]),
  ),
  retryAfterMs: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 604800000 })),
  ),
  returnTo: Schema.optional(CompanyStage),
  files: Schema.Array(Schema.Struct({ path: Schema.String, kind: CompanyArtifact.fields.kind })),
  reviewedHashes: Schema.Array(Schema.String),
  sources: Schema.Array(Schema.String),
  memoryCandidates: Schema.Array(Schema.String).check(Schema.isMaxLength(10)),
});
export type CompanyDelivery = typeof CompanyDelivery.Type;
