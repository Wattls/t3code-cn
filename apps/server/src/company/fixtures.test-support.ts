import type {
  CompanyRun,
  CompanyTask,
  CompanyArtifact,
  CompanyOrganization,
} from "@t3tools/contracts";
import { unknownUsage } from "./domain.ts";
export const fixtureRun = (): CompanyRun => ({
  id: "run1",
  stage: "design",
  revision: 1,
  attempt: 1,
  state: "running",
  terminalId: "t1",
  terminalCreatedMs: 1,
  pid: 11,
  providerSessionId: null,
  inputDigest: "input",
  workspace: "/test/runs/run1",
  reason: null,
  usage: unknownUsage,
  startedAt: "now",
  finishedAt: null,
});
export const fixtureTask = (): CompanyTask => ({
  id: "task1",
  title: "内容",
  brief: "授权内容制作",
  references: [],
  revision: 1,
  expectedImages: 2,
  scope: "facts",
  state: "accepted",
  stage: "review",
  reason: null,
  createdAt: "now",
  updatedAt: "now",
  feedback: [],
  runs: [],
  artifacts: (["research", "copy", "cover", "page", "review"] as const).map(
    (kind, i): CompanyArtifact => ({
      id: `a${i}`,
      runId: `r${i}`,
      stage: kind === "cover" || kind === "page" ? "design" : kind,
      kind,
      name: kind,
      path: `/test/${kind}`,
      sha256: `hash${i}`,
      bytes: 100,
      valid: true,
    }),
  ),
  approvals: [
    { id: "approval1", revision: 1, digest: "original", at: "now", valid: true, scope: "quality" },
  ],
  memories: [],
  events: [],
  notBefore: null,
  reworkCount: 0,
  networkRetries: 0,
  takeover: false,
});

export const fixtureOrganization = (): CompanyOrganization => {
  const node = (
    id: string,
    kind: CompanyOrganization["nodes"][number]["kind"],
    parentId: string | null,
  ) => ({
    id,
    kind,
    parentId,
    name: id,
    state: "confirmed" as const,
    responsibility: "synthetic duty",
    authority: "internal only",
    memory: "task only",
    sources: [],
    workflow: null,
    stage: null,
  });
  const employee = {
    provider: "codex" as const,
    model: "gpt-6-luna",
    effort: "medium" as const,
    skills: [],
  };
  return {
    name: "Synthetic Company",
    version: "test",
    nodes: [
      node("owner", "owner", null),
      node("department", "department", "owner"),
      { ...node("writer", "role", "department"), employee },
      { ...node("auditor", "role", "department"), employee: { ...employee } },
    ],
    workflows: [
      {
        id: "generic",
        name: "Synthetic flow",
        departmentId: "department",
        enabled: true,
        steps: [
          {
            id: "draft",
            name: "Draft",
            employeeId: "writer",
            kind: "produce",
            instructions: "Write synthetic content.",
            acceptance: "Contains synthetic content.",
            outputFiles: ["outputs/result.md"],
          },
          {
            id: "check",
            name: "Check",
            employeeId: "auditor",
            kind: "review",
            instructions: "Check synthetic content.",
            acceptance: "Read and check all inputs.",
            outputFiles: ["outputs/audit.md"],
          },
        ],
      },
    ],
  };
};
