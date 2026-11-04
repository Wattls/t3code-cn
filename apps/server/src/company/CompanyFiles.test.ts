import { evidenceFile, inside } from "./fileBoundary.ts";
// @effect-diagnostics nodeBuiltinImport:off - temporary files exercise the evidence boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ServerConfig } from "../config.ts";
import { CompanyFiles, layer } from "./CompanyFiles.ts";
import { fixtureOrganization, fixtureRun, fixtureTask } from "./fixtures.test-support.ts";
import { resolveWorkflow } from "./domain.ts";
import { imageMime, resumeCheckpoint, incrementalUsage } from "./CompanyFiles.ts";

it("rejects traversal, symlinks and empty outputs", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "company-evidence-"));
  try {
    const owned = NodePath.join(root, "workspace");
    await NodeFSP.mkdir(owned);
    await NodeFSP.writeFile(NodePath.join(root, "private.txt"), "private");
    await NodeFSP.symlink(NodePath.join(root, "private.txt"), NodePath.join(owned, "link.txt"));
    await NodeFSP.writeFile(NodePath.join(owned, "empty.txt"), "");
    expect(inside(owned, NodePath.join(root, "private.txt"))).toBe(false);
    await expect(evidenceFile(owned, "../private.txt")).rejects.toThrow();
    await expect(evidenceFile(owned, "link.txt")).rejects.toThrow();
    await expect(evidenceFile(owned, "empty.txt")).rejects.toThrow();
    await NodeFSP.writeFile(NodePath.join(owned, "report.md"), "valid evidence");
    expect((await evidenceFile(owned, "report.md")).toString()).toBe("valid evidence");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
it("does not accept an SVG or text placeholder as a completed page", () => {
  expect(
    imageMime(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>placeholder</text></svg>'),
    ),
  ).toBe(null);
  expect(imageMime(Buffer.from("image not generated"))).toBe(null);
});

it("resumes only the matching stage checkpoint and counts incremental usage", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "company-resume-"));
  try {
    const { fixtureRun, fixtureTask } = await import("./fixtures.test-support.ts");
    const prior = { ...fixtureRun(), state: "lost" as const };
    const run = { ...prior, id: "run2", state: "starting" as const };
    const task = { ...fixtureTask(), runs: [prior] };
    const sessions = NodePath.join(root, "providers", prior.id, "sessions");
    await NodeFSP.mkdir(sessions, { recursive: true });
    const baseline = { input: 100, cachedInput: 40, output: 20, images: null };
    await NodeFSP.writeFile(
      NodePath.join(sessions, "test.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: "synthetic-session", cwd: prior.workspace },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 },
            },
          },
        }),
      ].join("\n"),
    );
    const home = NodePath.join(root, "providers", run.id);
    expect(await resumeCheckpoint(root, task, { ...run, revision: 2 }, home)).toBe(null);
    expect(await resumeCheckpoint(root, task, { ...run, stage: "review" }, home)).toBe(null);
    expect(await resumeCheckpoint(root, task, { ...run, inputDigest: "changed" }, home)).toBe(null);
    expect(await resumeCheckpoint(root, task, run, home)).toEqual({
      runId: prior.id,
      sessionId: "synthetic-session",
      usage: baseline,
    });
    expect(await NodeFSP.readFile(NodePath.join(home, "sessions/test.jsonl"), "utf8")).toContain(
      "synthetic-session",
    );
    expect(
      incrementalUsage({ input: 130, cachedInput: 60, output: 25, images: null }, baseline),
    ).toEqual({ input: 30, cachedInput: 20, output: 5, images: null });
    expect(
      incrementalUsage({ input: 10, cachedInput: 0, output: 1, images: null }, baseline).input,
    ).toBe(null);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it.effect(
  "collects configured deliverables and blocks omissions, report substitution and stale reviews",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "company-collect-"))),
        (path) => Effect.promise(() => NodeFSP.rm(path, { recursive: true, force: true })),
      );
      yield* Effect.gen(function* () {
        const files = yield* CompanyFiles;
        const plan = resolveWorkflow(fixtureOrganization(), "generic");
        const task = { ...fixtureTask(), plan, artifacts: [] };
        const run = {
          ...fixtureRun(),
          stage: "draft",
          workspace: files.workspace(task.id, "draft"),
        };
        const write = (path: string, content: string) =>
          Effect.promise(() => NodeFSP.writeFile(NodePath.join(run.workspace, path), content));
        yield* Effect.promise(() =>
          NodeFSP.mkdir(NodePath.join(run.workspace, "outputs"), { recursive: true }),
        );
        const manifest = {
          runId: run.id,
          stage: run.stage,
          revision: run.revision,
          inputDigest: run.inputDigest,
          result: "pass",
          reason: "checked",
          files: [{ path: "outputs/result.md", kind: "file" }],
          reviewedHashes: [],
          sources: [],
          memoryCandidates: [],
        };
        yield* write("outputs/result.md", "synthetic completed output");
        yield* write("outputs/report.md", "Synthetic verification report.");
        yield* write("delivery.json", JSON.stringify({ ...manifest, files: [] }));
        expect((yield* files.collect(task, run).pipe(Effect.flip)).message).toContain("交付校验");
        yield* write(
          "delivery.json",
          JSON.stringify({ ...manifest, files: [{ path: "outputs/report.md", kind: "file" }] }),
        );
        expect((yield* files.collect(task, run).pipe(Effect.flip)).message).toContain("交付校验");
        yield* write("delivery.json", JSON.stringify(manifest));
        const evidence = yield* files.collect(task, run);
        expect(evidence?.artifacts).toHaveLength(1);
        const review = { ...run, id: "audit", stage: "check" };
        yield* write("outputs/audit.md", "Synthetic independent audit.");
        const audit = {
          ...manifest,
          runId: review.id,
          stage: review.stage,
          files: [{ path: "outputs/audit.md", kind: "file" }],
        };
        yield* write("delivery.json", JSON.stringify(audit));
        const withInput = { ...task, artifacts: evidence!.artifacts };
        expect((yield* files.collect(withInput, review).pipe(Effect.flip)).message).toContain(
          "交付校验",
        );
        yield* write(
          "delivery.json",
          JSON.stringify({ ...audit, reviewedHashes: evidence!.artifacts.map((a) => a.sha256) }),
        );
        expect((yield* files.collect(withInput, review))?.artifacts[0]?.name).toBe("audit.md");
      }).pipe(
        Effect.provide(
          layer.pipe(
            Layer.provide(ServerConfig.layerTest(root, root)),
            Layer.provide(NodeServices.layer),
          ),
        ),
      );
    }).pipe(Effect.scoped),
);
