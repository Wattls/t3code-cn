// @effect-diagnostics nodeBuiltinImport:off - isolated rule-source fixtures.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { expect, it } from "vite-plus/test";
import { lock } from "proper-lockfile";
import * as Schema from "effect/Schema";
import { CompanyOrganization } from "@t3tools/contracts";
import { readOrganization, saveOrganization, readCatalog } from "./organizationStore.ts";
import { fixtureOrganization } from "./fixtures.test-support.ts";
const validate = Schema.decodeUnknownSync(CompanyOrganization);

it("validates assignments, independent review and safe output paths", () => {
  const org = fixtureOrganization();
  expect(validate(org).workflows).toHaveLength(1);
  const flow = org.workflows![0]!;
  for (const change of [
    { departmentId: "missing" },
    { steps: flow.steps.map((s) => ({ ...s, employeeId: "writer" })) },
    { steps: flow.steps.toReversed() },
    { steps: [{ ...flow.steps[0]!, employeeId: "missing" }] },
    ...[
      "outputs/../secret",
      "outputs//empty",
      "outputs/./same",
      "outputs/report.md",
      "outputs/back\\slash",
      "/tmp/file",
    ].map((path) => ({ steps: [{ ...flow.steps[0]!, outputFiles: [path] }] })),
  ])
    expect(() => validate({ ...org, workflows: [{ ...flow, ...change }] })).toThrow();
  expect(
    validate({
      ...org,
      workflows: [
        { ...flow, steps: [{ ...flow.steps[0]!, outputFiles: ["outputs/方案 初稿.md"] }] },
      ],
    }).workflows,
  ).toHaveLength(1);
  expect(() =>
    validate({
      ...org,
      nodes: org.nodes.map((node) =>
        node.employee
          ? {
              ...node,
              employee: { ...node.employee, skills: ["shared-skills/../private/SKILL.md"] },
            }
          : node,
      ),
    }),
  ).toThrow();
});

it("saves atomically, rejects competing drafts, deduplicates and recovers an abandoned lock", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "company-org-"));
  const directory = NodePath.join(root, "rules/ai-company");
  const target = NodePath.join(directory, "organization.json");
  try {
    await NodeFSP.mkdir(directory, { recursive: true });
    await NodeFSP.writeFile(target, JSON.stringify(fixtureOrganization()));
    const before = await readOrganization(root);
    const input = {
      commandId: "save1",
      expectedRevision: before.revision,
      organization: { ...before.organization, name: "Updated" },
    };
    const release = await lock(target);
    await expect(saveOrganization(root, input)).rejects.toThrow();
    await release();
    await saveOrganization(root, input);
    const after = await readOrganization(root);
    expect(after.organization.name).toBe("Updated");
    expect(after.revision).not.toBe(before.revision);
    await saveOrganization(root, input);
    expect((await readOrganization(root)).revision).toBe(after.revision);
    await expect(saveOrganization(root, { ...input, commandId: "competing" })).rejects.toThrow(
      "changed",
    );
    await expect(
      saveOrganization(root, {
        ...input,
        organization: { ...input.organization, name: "collision" },
      }),
    ).rejects.toThrow("collision");
    await NodeFSP.mkdir(`${target}.lock`);
    const old = 1_700_000_000;
    await NodeFSP.utimes(`${target}.lock`, old, old);
    await saveOrganization(root, {
      ...input,
      commandId: "after-crash",
      expectedRevision: after.revision,
    });
    expect((await readOrganization(root)).organization.lastCommand?.id).toBe("after-crash");
    expect(await NodeFSP.readdir(directory)).toEqual(["organization.json"]);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("discovers selected skill sources without following external symlink directories", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "company-catalog-"));
  try {
    await NodeFSP.mkdir(NodePath.join(root, "shared-skills/中文 示例"), { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(root, "shared-skills/中文 示例/SKILL.md"),
      "Synthetic skill.",
    );
    await NodeFSP.symlink(NodeOS.tmpdir(), NodePath.join(root, "shared-skills/escape"));
    expect((await readCatalog(root)).skills).toEqual([
      { path: "shared-skills/中文 示例/SKILL.md", name: "中文 示例" },
    ]);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
