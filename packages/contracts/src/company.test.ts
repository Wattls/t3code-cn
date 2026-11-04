import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { CompanyOrganization } from "./company.ts";

const decodeOrganization = Schema.decodeUnknownSync(CompanyOrganization);

it("rejects ambiguous reporting trees and duplicate or misplaced execution bindings", () => {
  const node = (
    id: string,
    parentId: string | null,
    kind: "owner" | "department" | "channel" | "role",
  ) => ({
    id,
    parentId,
    kind,
    name: id,
    state: "confirmed" as const,
    responsibility: "test",
    authority: "test",
    memory: "test",
    sources: [],
    workflow: null,
    stage: null,
  });
  const root = node("owner", null, "owner");
  const department = node("marketing", "owner", "department");
  const channel = { ...node("rednote", "marketing", "channel"), workflow: "rednote" as const };
  const role = { ...node("research", "rednote", "role"), stage: "research" as const };
  const decode = (nodes: unknown[]) => decodeOrganization({ version: "1", name: "test", nodes });
  expect(decode([root, department, channel, role]).nodes).toHaveLength(4);
  for (const nodes of [
    [root, root],
    [root, node("other-owner", null, "owner")],
    [root, { ...department, parentId: "missing" }],
    [root, { ...department, parentId: "rednote" }, channel],
    [root, department, channel, role, { ...role, id: "duplicate" }],
    [root, department, { ...channel, id: "second-channel" }, channel],
    [root, department, channel, { ...role, parentId: "marketing" }],
    [root, department, { ...channel, state: "planned" }],
  ])
    expect(() => decode(nodes)).toThrow();
});
