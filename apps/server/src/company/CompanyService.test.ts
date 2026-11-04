import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as Schema from "effect/Schema";
import {
  CompanyError,
  CompanyTask,
  type CompanyCommand,
  type CompanyOrganization,
} from "@t3tools/contracts";
import { ServerConfig } from "../config.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import { Scheduler } from "../scheduling/Scheduler.ts";
import { CompanyService, layer } from "./CompanyService.ts";
import { HerdrBridge, type HerdrTerminal } from "./HerdrBridge.ts";
import { CompanyFiles } from "./CompanyFiles.ts";

import { fixtureOrganization } from "./fixtures.test-support.ts";

const encodeTask = Schema.encodeEffect(Schema.fromJsonString(CompanyTask));
function harness(dbPath?: string, organization: CompanyOrganization = fixtureOrganization()) {
  const terminals: HerdrTerminal[] = [];
  let starts = 0;
  let deliver = false;
  let blockReason: "network" | "quota" | "permission" | null = null;
  let changed = false;
  const bridge = HerdrBridge.of({
    owner: "test",
    events: Stream.never,
    list: () => Effect.succeed(terminals.slice()),
    start: (run) =>
      Effect.sync(() => {
        starts++;
        const terminal = {
          address: `t${starts}`,
          name: null,
          labels: { "t3-company": "test", run: run.id },
          argv: ["codex"],
          cwd: run.workspace,
          state: "live",
          created_ms: starts,
          pid: starts,
        };
        terminals.push(terminal);
        return terminal;
      }),
    kill: (terminal) =>
      Effect.sync(() => {
        const index = terminals.findIndex((t) => t.address === terminal.address);
        if (index >= 0) terminals[index] = { ...terminal, state: "finished" };
      }),
    read: () => Effect.succeed({ text: "terminal", complete: true }),
    keys: () => Effect.void,
  });
  const files = CompanyFiles.of({
    root: "/test",
    configuration: () =>
      Effect.fail(new CompanyError({ message: "synthetic configuration unavailable" })),
    saveOrganization: () => Effect.void,
    catalog: () =>
      Effect.succeed({
        models: [{ id: "gpt-6-luna", name: "Luna", efforts: ["medium"] }],
        skills: [],
      }),
    organization: () => Effect.succeed(organization),
    workflow: () => Effect.fail(new CompanyError({ message: "synthetic rules unavailable" })),
    workspace: (task, run) => `/test/${task}/${run}`,
    prepare: () => Effect.succeed({ home: "/test/provider", resume: null }),
    collect: (_task, run) =>
      Effect.succeed(
        deliver
          ? {
              delivery: {
                runId: run.id,
                revision: run.revision,
                stage: run.stage,
                inputDigest: run.inputDigest,
                result: blockReason ? "blocked" : "pass",
                blockReason: blockReason ?? "unknown",
                retryAfterMs: 60_000,
                reason: "",
                files: [],
                reviewedHashes: [],
                sources: ["https://example.test"],
                memoryCandidates: [],
              },
              artifacts: [
                {
                  id: run.id,
                  runId: run.id,
                  stage: run.stage,
                  kind:
                    run.stage === "design"
                      ? "cover"
                      : run.stage === "research" || run.stage === "copy" || run.stage === "review"
                        ? run.stage
                        : "file",
                  name: run.stage,
                  path: run.workspace,
                  sha256: run.id,
                  bytes: 100,
                  valid: true,
                },
              ],
              providerSessionId: "session",
              usage: { input: 10, cachedInput: 0, output: 10, images: null },
            }
          : null,
      ),
    verify: () =>
      changed ? Effect.fail(new CompanyError({ message: "evidence changed" })) : Effect.void,
    read: () => Effect.succeed({ name: "test", mime: "text/plain", base64: "" }),
  });
  const services = layer.pipe(
    Layer.provide(Layer.succeed(HerdrBridge, bridge)),
    Layer.provide(Layer.succeed(CompanyFiles, files)),
    Layer.provide(Layer.mock(Scheduler)({ register: () => Effect.void })),
    Layer.provideMerge(dbPath ? Sqlite.layerFromPath(dbPath) : Sqlite.layerMemory),
    Layer.provide(ServerConfig.layerTest("/tmp", { prefix: "company-test-" })),
    Layer.provide(NodeServices.layer),
  );
  return {
    terminals,
    starts: () => starts,
    services,
    deliver: () => {
      deliver = true;
    },
    block: (reason: "network" | "quota" | "permission") => {
      deliver = true;
      blockReason = reason;
    },
    change: () => {
      changed = true;
    },
  };
}
const create: CompanyCommand = {
  commandId: "create1",
  type: "create",
  title: "内容测试",
  brief: "内部制作",
  expectedImages: 3,
  references: [],
};
const enable = (service: CompanyService["Service"]) =>
  service.configure({
    commandId: "enable1",
    enabled: true,
    rulesRoot: "/rules",
    knowledgeRoot: "/knowledge",
  });

it.effect("duplicate commands and repeated reconciliation launch a task only once", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command(create);
    yield* service.command(create);
    yield* service.drain();
    yield* service.drain();
    expect((yield* service.snapshot()).tasks).toHaveLength(1);
    expect(h.starts()).toBe(1);
  }).pipe(Effect.provide(h.services));
});
it.effect("limits concurrent tasks and keeps a manual stop stopped", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    for (let i = 0; i < 3; i++) yield* service.command({ ...create, commandId: `create${i}` });
    yield* service.drain();
    expect(h.starts()).toBe(2);
    const task = (yield* service.snapshot()).tasks.find((t) => t.state === "running")!;
    yield* service.command({
      type: "stop",
      commandId: "stop1",
      taskId: task.id,
      revision: task.revision,
    });
    yield* service.drain();
    yield* service.drain();
    expect((yield* service.snapshot()).tasks.find((t) => t.id === task.id)?.state).toBe("stopped");
    expect(h.terminals.find((t) => t.address === task.runs[0]?.terminalId)?.state).toBe("finished");
    expect(h.starts()).toBe(3);
  }).pipe(Effect.provide(h.services));
});
it.effect("reconciles a launch persisted before its response without duplicate dispatch", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    const sql = yield* SqlClient.SqlClient;
    yield* enable(service);
    yield* service.command(create);
    yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    const pending: CompanyTask = {
      ...task,
      runs: task.runs.map((r) => ({
        ...r,
        terminalId: null,
        terminalCreatedMs: null,
        pid: null,
        state: "starting",
      })),
    };
    const body = yield* encodeTask(pending);
    yield* sql`UPDATE company_tasks SET body=${body} WHERE id=${task.id}`;
    yield* service.drain();
    expect(h.starts()).toBe(1);
    expect((yield* service.snapshot()).tasks[0]?.runs[0]?.terminalId).toBe("t1");
  }).pipe(Effect.provide(h.services));
});
it.effect("a lost original process blocks instead of adopting a replacement shell", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command(create);
    yield* service.drain();
    h.terminals[0] = { ...h.terminals[0]!, argv: ["zsh"], pid: 99 };
    yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    expect(task.state).toBe("blocked");
    expect(task.runs[0]?.state).toBe("lost");
    expect(h.starts()).toBe(1);
  }).pipe(Effect.provide(h.services));
});

it.effect("approval binds to actual outputs and is revoked when evidence changes", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command(create);
    h.deliver();
    for (let i = 0; i < 5; i++) yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    expect(task.state).toBe("awaiting_review");
    yield* service.command({
      type: "approve",
      commandId: "accept1",
      taskId: task.id,
      revision: task.revision,
      digest: task.digest,
    });
    expect((yield* service.snapshot()).tasks[0]?.state).toBe("accepted");
    h.change();
    yield* service.drain();
    const revoked = (yield* service.snapshot()).tasks[0]!;
    expect(revoked.state).toBe("blocked");
    expect(revoked.approvals.every((a) => !a.valid)).toBe(true);
  }).pipe(Effect.provide(h.services));
});
it.effect("changed upstream evidence blocks the active stage without losing service health", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command(create);
    yield* service.drain();
    h.deliver();
    yield* service.drain();
    expect(h.starts()).toBe(2);
    h.change();
    yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    expect(task.state).toBe("blocked");
    expect(task.reason).toBe("evidence changed");
    expect(task.runs.at(-1)?.state).toBe("lost");
    expect(h.terminals.at(-1)?.state).toBe("finished");
    yield* service.drain();
    expect(h.starts()).toBe(2);
    expect((yield* service.snapshot()).connection).toBe("online");
  }).pipe(Effect.provide(h.services));
});
it.effect("Herdr done alone does not count as quality acceptance", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command(create);
    yield* service.drain();
    h.terminals[0] = { ...h.terminals[0]!, status: { state: "done" } };
    yield* service.drain();
    expect((yield* service.snapshot()).tasks[0]?.state).toBe("blocked");
  }).pipe(Effect.provide(h.services));
});

it.effect("respects retry-after and caps transient network retries at two", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    h.block("network");
    yield* service.command(create);
    yield* service.drain();
    yield* service.drain();
    expect(h.starts()).toBe(1);
    yield* TestClock.adjust("59 seconds");
    yield* service.drain();
    expect(h.starts()).toBe(1);
    yield* TestClock.adjust("1 second");
    yield* service.drain();
    yield* service.drain();
    expect(h.starts()).toBe(2);
    yield* TestClock.adjust("60 seconds");
    yield* service.drain();
    yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    expect(h.starts()).toBe(3);
    expect(task.networkRetries).toBe(2);
    expect(task.state).toBe("blocked");
    yield* TestClock.adjust("1 hour");
    yield* service.drain();
    expect(h.starts()).toBe(3);
  }).pipe(Effect.provide(h.services));
});
it.effect("quota and permission failures do not enter automatic retry", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    h.block("quota");
    yield* service.command(create);
    yield* service.drain();
    yield* service.drain();
    expect((yield* service.snapshot()).tasks[0]?.state).toBe("blocked");
    yield* TestClock.adjust("1 hour");
    yield* service.drain();
    expect(h.starts()).toBe(1);
  }).pipe(Effect.provide(h.services));
});

it.effect("memory replacement and withdrawal preserve provenance and reject cycles", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    const sql = yield* SqlClient.SqlClient;
    yield* enable(service);
    yield* service.command(create);
    yield* service.command({ ...create, commandId: "create2" });
    const tasks = (yield* service.snapshot()).tasks;
    const old = tasks[0]!;
    const next = tasks[1]!;
    for (const [task, id, confirmed] of [
      [old, "old", true],
      [next, "next", false],
    ] as const) {
      const body = yield* encodeTask({
        ...task,
        memories: [
          { id, text: id, source: "delivery.json", confirmed, scope: "company", supersedes: null },
        ],
      });
      yield* sql`UPDATE company_tasks SET body=${body} WHERE id=${task.id}`;
    }
    const replace: CompanyCommand = {
      type: "memory",
      commandId: "replace",
      taskId: next.id,
      revision: 1,
      memoryId: "next",
      scope: "company",
      supersedes: "old",
    };
    yield* service.command(replace);
    yield* service.command(replace);
    let memories = (yield* service.snapshot()).tasks.flatMap((t) => t.memories);
    expect(memories.find((m) => m.id === "old")?.confirmed).toBe(false);
    expect(memories.find((m) => m.id === "next")).toMatchObject({
      confirmed: true,
      supersedes: "old",
      source: "delivery.json",
    });
    const cycle = yield* service
      .command({
        type: "memory",
        commandId: "cycle",
        taskId: old.id,
        revision: 1,
        memoryId: "old",
        scope: "company",
        supersedes: "next",
      })
      .pipe(Effect.result);
    expect(cycle._tag).toBe("Failure");
    yield* service.command({ ...replace, commandId: "withdraw", confirmed: false });
    memories = (yield* service.snapshot()).tasks.flatMap((t) => t.memories);
    expect(memories.every((m) => !m.confirmed)).toBe(true);
    expect(memories.find((m) => m.id === "next")?.supersedes).toBe("old");
  }).pipe(Effect.provide(h.services));
});

it.effect("persists manual stops and duplicate receipts across service reconstruction", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped();
    const dbPath = path.join(directory, "company.sqlite");
    const first = harness(dbPath);
    yield* Effect.gen(function* () {
      const service = yield* CompanyService;
      yield* enable(service);
      yield* service.command(create);
      yield* service.drain();
      const task = (yield* service.snapshot()).tasks[0]!;
      yield* service.command({
        type: "stop",
        commandId: "persist-stop",
        taskId: task.id,
        revision: task.revision,
      });
    }).pipe(Effect.provide(first.services));
    const second = harness(dbPath);
    yield* Effect.gen(function* () {
      const service = yield* CompanyService;
      yield* service.command(create);
      yield* service.drain();
      const state = yield* service.snapshot();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0]?.state).toBe("stopped");
      expect(state.settings.enabled).toBe(true);
      expect(second.starts()).toBe(0);
    }).pipe(Effect.provide(second.services));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("routes a configured team and pins the selected employee model across handoff", () => {
  const h = harness();
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    yield* service.command({
      ...create,
      workflowId: "generic",
      departmentId: "department",
      expectedImages: 0,
    });
    yield* service.command({
      ...create,
      workflowId: "generic",
      departmentId: "department",
      expectedImages: 0,
    });
    yield* service.drain();
    const task = (yield* service.snapshot()).tasks[0]!;
    expect(task.stage).toBe("draft");
    expect(task.runs[0]?.execution?.model).toBe("gpt-6-luna");
    expect(task.runs[0]?.employeeId).toBe("writer");
    h.deliver();
    yield* service.drain();
    const handedOff = (yield* service.snapshot()).tasks[0]!;
    expect(handedOff.stage).toBe("check");
    expect(handedOff.runs.at(-1)?.employeeId).toBe("auditor");
    yield* service.drain();
    const finished = (yield* service.snapshot()).tasks[0]!;
    expect(finished.state).toBe("awaiting_review");
    expect(h.starts()).toBe(2);
    yield* service.command({
      type: "feedback",
      commandId: "revise-check",
      taskId: finished.id,
      revision: finished.revision,
      scope: "facts",
      text: "check again",
      fromStep: "check",
    });
    const revised = (yield* service.snapshot()).tasks[0]!;
    expect(revised.stage).toBe("check");
    expect(revised.artifacts.filter((a) => a.valid).map((a) => a.stage)).toEqual(["draft"]);
  }).pipe(Effect.provide(h.services));
});

it.effect("refuses unavailable model assignments before starting any process", () => {
  const org = fixtureOrganization();
  const h = harness(undefined, {
    ...org,
    nodes: org.nodes.map((node) =>
      node.employee ? { ...node, employee: { ...node.employee, model: "unavailable" } } : node,
    ),
  });
  return Effect.gen(function* () {
    const service = yield* CompanyService;
    yield* enable(service);
    const result = yield* service
      .command({ ...create, workflowId: "generic", expectedImages: 0 })
      .pipe(Effect.flip);
    expect(result.message).toContain("模型");
    expect((yield* service.snapshot()).tasks).toHaveLength(0);
    expect(h.starts()).toBe(0);
  }).pipe(Effect.provide(h.services));
});
