// @effect-diagnostics nodeBuiltinImport:off - stable run IDs and host-local default knowledge paths.
import * as NodeCrypto from "node:crypto";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import {
  CompanyTask,
  CompanySettings,
  CompanyError,
  type CompanySnapshot,
  type CompanyCatalog,
  type CompanySaveOrganizationInput,
  type CompanyCommand,
  type CompanyConfigureInput,
  type CompanyTerminalInput,
  type CompanyTerminalKeysInput,
  type CompanyArtifactInput,
  type CompanyRun,
} from "@t3tools/contracts";
import { forkParked } from "../serverActivation.ts";
import { ServerConfig } from "../config.ts";
import { Scheduler } from "../scheduling/Scheduler.ts";
import { HerdrBridge, matchesRun, hasOriginalProcess, type HerdrTerminal } from "./HerdrBridge.ts";
import { hash } from "./fileBoundary.ts";
import { CompanyFiles } from "./CompanyFiles.ts";
import {
  resolveWorkflow,
  reworkStages,
  artifactDigest,
  currentRun,
  finishStage,
  invalidateApproval,
  liveRun,
  revise,
  unknownUsage,
} from "./domain.ts";

const isCompanyError = Schema.is(CompanyError);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export class CompanyService extends Context.Service<
  CompanyService,
  {
    readonly snapshot: () => Effect.Effect<CompanySnapshot, CompanyError>;
    readonly subscribe: () => Stream.Stream<CompanySnapshot, CompanyError>;
    readonly command: (input: CompanyCommand) => Effect.Effect<void, CompanyError>;
    readonly catalog: () => Effect.Effect<CompanyCatalog, CompanyError>;
    readonly saveOrganization: (
      input: typeof CompanySaveOrganizationInput.Type,
    ) => Effect.Effect<void, CompanyError>;
    readonly configure: (input: CompanyConfigureInput) => Effect.Effect<void, CompanyError>;
    readonly terminal: (
      input: typeof CompanyTerminalInput.Type,
    ) => Effect.Effect<{ text: string; complete: boolean }, CompanyError>;
    readonly keys: (
      input: typeof CompanyTerminalKeysInput.Type,
    ) => Effect.Effect<void, CompanyError>;
    readonly artifact: (
      input: typeof CompanyArtifactInput.Type,
    ) => Effect.Effect<{ name: string; mime: string; base64: string }, CompanyError>;
    readonly drain: () => Effect.Effect<void, CompanyError>;
  }
>()("t3/company/CompanyService") {}
const error = (message: string) => new CompanyError({ message });
const decodeTask = Schema.decodeEffect(Schema.fromJsonString(CompanyTask));
const decodeSettings = Schema.decodeEffect(Schema.fromJsonString(CompanySettings));
const date = DateTime.now.pipe(Effect.map(DateTime.formatIso));
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const bridge = yield* HerdrBridge;
  const files = yield* CompanyFiles;
  const config = yield* ServerConfig;
  const scheduler = yield* Scheduler;
  const changes = yield* PubSub.sliding<void>(1);
  const pulses = yield* Queue.sliding<void>(1);
  const gate = yield* Semaphore.make(1);
  const pumping = yield* Semaphore.make(1);
  const connection = yield* Ref.make<CompanySnapshot["connection"]>("disabled");
  const defaults: CompanySettings = {
    enabled: false,
    rulesRoot: NodePath.join(NodeOS.homedir(), "Documents", "Obsidian", "AI-Agent-System"),
    knowledgeRoot: NodePath.join(NodeOS.homedir(), "Documents", "Obsidian", "LLM-Wiki"),
  };
  const safe = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, CompanyError, R> =>
    effect.pipe(
      Effect.mapError((cause) =>
        isCompanyError(cause) ? cause : error("公司数据操作失败，状态已保留。"),
      ),
    );
  const settings = () =>
    safe(
      Effect.gen(function* () {
        const rows = yield* sql<{
          body: string;
        }>`SELECT body FROM company_settings WHERE singleton = 1`;
        return rows[0] ? yield* decodeSettings(rows[0].body) : defaults;
      }),
    );
  const list = () =>
    safe(
      Effect.gen(function* () {
        const rows = yield* sql<{
          body: string;
        }>`SELECT body FROM company_tasks ORDER BY updated_at DESC`;
        return yield* Effect.forEach(rows, (r) => decodeTask(r.body));
      }),
    );
  const get = (id: string) =>
    safe(
      Effect.gen(function* () {
        const rows = yield* sql<{ body: string }>`SELECT body FROM company_tasks WHERE id = ${id}`;
        if (!rows[0]) return yield* error("任务不存在。");
        return yield* decodeTask(rows[0].body);
      }),
    );
  const put = (task: CompanyTask) =>
    sql`INSERT INTO company_tasks(id,body,updated_at) VALUES(${task.id},${encodeJson(task)},${task.updatedAt})
    ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`.pipe(
      Effect.asVoid,
    );
  const notify = Effect.all([PubSub.publish(changes, undefined), Queue.offer(pulses, undefined)], {
    discard: true,
  });
  const update = (taskId: string, change: (task: CompanyTask) => CompanyTask) =>
    safe(
      sql
        .withTransaction(
          Effect.gen(function* () {
            const task = yield* get(taskId);
            yield* put(change(task));
          }),
        )
        .pipe(
          gate.withPermits(1),
          Effect.andThen(PubSub.publish(changes, undefined)),
          Effect.asVoid,
        ),
    );
  const receipt = <E>(id: string, body: object, work: Effect.Effect<void, E>) =>
    safe(
      sql
        .withTransaction(
          Effect.gen(function* () {
            const fingerprint = hash(encodeJson(body));
            const existing = yield* sql<{
              fingerprint: string;
            }>`SELECT fingerprint FROM company_receipts WHERE id = ${id}`;
            if (existing[0]) {
              if (existing[0].fingerprint !== fingerprint)
                return yield* error("命令标识已被用于另一项操作。");
              return;
            }
            yield* work;
            yield* sql`INSERT INTO company_receipts(id,fingerprint,created_at) VALUES(${id},${fingerprint},${yield* date})`;
          }),
        )
        .pipe(gate.withPermits(1), Effect.andThen(notify)),
    );
  const snapshot = Effect.fn("Company.snapshot")(function* () {
    const currentSettings = yield* settings();
    const configuration = yield* files
      .configuration(currentSettings)
      .pipe(Effect.orElseSucceed(() => null));
    return {
      settings: currentSettings,
      organization: configuration?.organization ?? null,
      organizationRevision: configuration?.revision ?? null,
      workflow: yield* files.workflow(currentSettings).pipe(Effect.orElseSucceed(() => null)),
      tasks: (yield* list()).map((task) => ({
        ...task,
        digest: hash(artifactDigest(task.artifacts)),
      })),
      connection: yield* Ref.get(connection),
      serviceMode: config.mode,
      workspaceRoot: files.root,
    };
  });
  const subscribe = () =>
    Stream.unwrap(
      Effect.gen(function* () {
        const sub = yield* PubSub.subscribe(changes);
        return Stream.concat(
          Stream.fromEffect(snapshot()),
          Stream.fromSubscription(sub).pipe(Stream.mapEffect(snapshot)),
        );
      }),
    );
  const command = Effect.fn("Company.command")(function* (input: CompanyCommand) {
    // Re-read artifact hashes before acceptance; never rely on an old UI snapshot.
    if (input.type === "approve") yield* files.verify((yield* get(input.taskId)).artifacts);
    yield* receipt(
      input.commandId,
      input,
      Effect.gen(function* () {
        const at = yield* date;
        if (input.type === "create") {
          if (!(yield* settings()).enabled) return yield* error("请先启用 AI 公司。");
          const organization = yield* files.organization(yield* settings());
          const assignments = organization?.nodes
            .filter((node) => node.stage && node.employee)
            .map((node) => ({
              stage: node.stage!,
              employeeId: node.id,
              employeeName: node.name,
              responsibility: node.responsibility,
              execution: node.employee!,
            }));
          const plan =
            (input.workflowId && input.workflowId !== "rednote") || input.departmentId
              ? resolveWorkflow(organization, input.workflowId, input.departmentId)
              : undefined;
          if (!plan && input.expectedImages < 1)
            return yield* error("小红书流程至少需要一张图片。");
          if (plan || assignments?.length) {
            const catalog = yield* files.catalog(yield* settings());
            for (const step of plan?.steps ?? assignments ?? []) {
              if (
                !catalog.models.some(
                  (model) =>
                    model.id === step.execution.model &&
                    model.efforts.includes(step.execution.effort),
                )
              )
                return yield* error("员工模型或推理强度不在当前 Codex 目录中，请刷新模型配置。");
              if (
                !step.execution.skills.every((path) =>
                  catalog.skills.some((skill) => skill.path === path),
                )
              )
                return yield* error("员工关联的 skill 不存在或超出规则源范围。");
            }
          }
          const task: CompanyTask = {
            ...(plan ? { plan } : assignments?.length ? { assignments } : {}),
            id: NodeCrypto.randomUUID(),
            title: input.title,
            brief: input.brief,
            references: input.references,
            revision: 1,
            expectedImages: input.expectedImages,
            scope: "facts",
            state: "queued",
            stage: plan?.steps[0]?.id ?? "research",
            reason: null,
            createdAt: at,
            updatedAt: at,
            feedback: [],
            runs: [],
            artifacts: [],
            approvals: [],
            memories: [],
            events: [
              {
                at,
                kind: "created",
                detail: plan
                  ? `${plan.departmentName} / ${plan.name}；按保存的流程配置执行内部任务，最终验收不包含发布授权。`
                  : "内部研究、制作、独立审核已授权；最终总审不包含发布授权。",
              },
            ],
            notBefore: null,
            reworkCount: 0,
            networkRetries: 0,
            takeover: false,
          };
          yield* put(task);
          return;
        }
        let task = yield* get(input.taskId);
        if (task.revision !== input.revision) return yield* error("任务版本已变化，请刷新后操作。");
        switch (input.type) {
          case "stop":
            task = { ...task, state: "stopped", reason: "人工停止", takeover: false };
            break;
          case "feedback":
            task = revise(task, input.scope, input.text, at, input.fromStep);
            break;
          case "approve": {
            if (
              task.state !== "awaiting_review" ||
              task.takeover ||
              input.digest !== hash(artifactDigest(task.artifacts))
            )
              return yield* error("当前成果不满足总审条件或版本已变化。");
            task = {
              ...task,
              state: "accepted",
              approvals: [
                ...task.approvals,
                {
                  id: NodeCrypto.randomUUID(),
                  revision: task.revision,
                  digest: input.digest,
                  at,
                  valid: true,
                  scope: "quality",
                },
              ],
            };
            break;
          }
          case "resume": {
            const run = currentRun(task);
            if (!["blocked", "stopped"].includes(task.state) || task.takeover)
              return yield* error("当前任务无需恢复，或仍由人工接管。");
            if (run && liveRun(run))
              return yield* error("现有进程或启动结果尚未核实，请先核对或停止该执行。");
            task = { ...task, state: "queued", reason: null };
            break;
          }
          case "takeover": {
            if (!currentRun(task)?.terminalId) return yield* error("没有可接管的终端。");
            task = { ...task, takeover: input.enabled };
            break;
          }
          case "memory": {
            if (!task.memories.some((m) => m.id === input.memoryId))
              return yield* error("记忆候选不存在。");
            const confirmed = input.confirmed ?? true;
            if (confirmed) {
              const all = yield* list();
              const memories = all.flatMap((t) => t.memories);
              if (memories.some((m) => m.confirmed && m.supersedes === input.memoryId))
                return yield* error("这条记忆已被有效的新记忆替代，请先撤回新记忆。");
              if (input.supersedes) {
                const owner = all.find((t) => t.memories.some((m) => m.id === input.supersedes));
                const prior = owner?.memories.find((m) => m.id === input.supersedes);
                if (
                  !owner ||
                  !prior?.confirmed ||
                  (owner.id !== task.id && prior.scope !== "company") ||
                  (prior.scope === "company" && input.scope !== "company")
                )
                  return yield* error(
                    "只能替代当前任务或公司范围内的有效记忆，且不能缩小公司记忆的范围。",
                  );
                let ancestor: string | null = prior.id;
                const seen = new Set<string>();
                while (ancestor) {
                  if (ancestor === input.memoryId || seen.has(ancestor))
                    return yield* error("记忆替代关系不能形成循环。");
                  seen.add(ancestor);
                  ancestor = memories.find((m) => m.id === ancestor)?.supersedes ?? null;
                }
                const replace = (t: CompanyTask) => ({
                  ...t,
                  memories: t.memories.map((m) =>
                    m.id === prior.id ? { ...m, confirmed: false } : m,
                  ),
                  updatedAt: at,
                  events: [
                    ...t.events,
                    { at, kind: "memory_superseded", detail: `${prior.id} -> ${input.memoryId}` },
                  ],
                });
                if (owner.id === task.id) task = replace(task);
                else yield* put(replace(owner));
              }
            }
            task = {
              ...task,
              memories: task.memories.map((m) =>
                m.id === input.memoryId
                  ? {
                      ...m,
                      confirmed,
                      scope: input.scope,
                      supersedes: confirmed ? (input.supersedes ?? m.supersedes) : m.supersedes,
                    }
                  : m,
              ),
            };
            break;
          }
          case "reconcile":
            break;
        }
        yield* put({
          ...task,
          updatedAt: at,
          events: [
            ...task.events,
            {
              at,
              kind: input.type,
              detail:
                input.type === "approve"
                  ? "总审通过；未授予发布或外发权限。"
                  : input.type === "memory"
                    ? `${input.confirmed === false ? "撤回" : "确认"}记忆 ${input.memoryId}`
                    : input.type,
            },
          ],
        });
      }),
    );
  });
  const catalog = Effect.fn("Company.catalog")(function* () {
    return yield* files.catalog(yield* settings());
  });
  const saveOrganization = Effect.fn("Company.saveOrganization")(function* (
    input: typeof CompanySaveOrganizationInput.Type,
  ) {
    yield* files.saveOrganization(yield* settings(), input);
    yield* PubSub.publish(changes, undefined);
  }, gate.withPermits(1));
  const configure = (input: CompanyConfigureInput) =>
    receipt(
      input.commandId,
      input,
      Effect.gen(function* () {
        if (!input.rulesRoot.startsWith("/") || !input.knowledgeRoot.startsWith("/"))
          return yield* error("知识库与规则目录需使用本机绝对路径。");
        const body: CompanySettings = {
          enabled: input.enabled,
          rulesRoot: input.rulesRoot,
          knowledgeRoot: input.knowledgeRoot,
        };
        yield* sql`INSERT INTO company_settings(singleton,body) VALUES(1,${encodeJson(body)}) ON CONFLICT(singleton) DO UPDATE SET body=excluded.body`;
      }),
    );
  const ownedTerminal = Effect.fn("Company.ownedTerminal")(function* (
    input: typeof CompanyTerminalInput.Type,
  ) {
    const task = yield* get(input.taskId);
    const run = task.runs.find((r) => r.id === input.runId);
    if (!run) return yield* error("执行轮次不存在。");
    const terminal = (yield* bridge.list()).find((t) => matchesRun(t, run, bridge.owner));
    if (!terminal) return yield* error("原终端已丢失，请核对任务状态。");
    return { task, run, terminal };
  });
  const terminal = (input: typeof CompanyTerminalInput.Type) =>
    ownedTerminal(input).pipe(Effect.flatMap((r) => bridge.read(r.terminal)));
  const keys = Effect.fn("Company.keys")(function* (input: typeof CompanyTerminalKeysInput.Type) {
    const allowed = new Set([
      "enter",
      "esc",
      "tab",
      "shift+tab",
      "up",
      "down",
      "left",
      "right",
      "ctrl+c",
      "y",
      "n",
      "1",
      "2",
      "3",
      "4",
    ]);
    if (!input.keys.every((key) => allowed.has(key))) return yield* error("不支持该接管按键。");
    const { task, terminal } = yield* ownedTerminal(input);
    if (!task.takeover || task.state === "stopped") return yield* error("请先主动接管终端。");
    // A lost response is not replayed: a repeated Enter could approve a different dialog.
    let fresh = false;
    yield* receipt(
      input.commandId,
      input,
      Effect.sync(() => {
        fresh = true;
      }),
    );
    if (fresh) yield* bridge.keys(terminal, input.keys);
  });
  const artifact = Effect.fn("Company.artifact")(function* (
    input: typeof CompanyArtifactInput.Type,
  ) {
    const task = yield* get(input.taskId);
    const found = task.artifacts.find((a) => a.id === input.artifactId);
    if (!found) return yield* error("成果不存在。");
    return yield* files.read(found);
  });
  const block = (
    taskId: string,
    runId: string,
    reason: string,
    state: CompanyRun["state"] = "blocked",
  ) =>
    update(taskId, (task) => {
      if (task.state === "stopped" || currentRun(task)?.id !== runId) return task;
      return {
        ...task,
        state: "blocked",
        reason,
        runs: task.runs.map((r) => (r.id === runId ? { ...r, state, reason } : r)),
      };
    });
  const reconcile = Effect.fn("Company.reconcile")(function* (
    initial: CompanyTask,
    terminals: readonly HerdrTerminal[],
  ) {
    let task = yield* get(initial.id);
    // Clean only our own finished/stopped work, including a launch that raced a Stop command.
    for (const run of task.runs) {
      const found = terminals.find((t) => matchesRun(t, run, bridge.owner));
      if (
        found?.state === "live" &&
        (task.state === "stopped" || run.state === "completed" || run.state === "stopped")
      ) {
        yield* bridge.kill(found);
      }
      if (task.state === "stopped" && found?.state !== "live" && run.state !== "completed") {
        yield* update(task.id, (t) => ({
          ...t,
          runs: t.runs.map((r) => (r.id === run.id ? { ...r, state: "stopped" } : r)),
        }));
      }
    }
    if (task.state === "stopped" || task.takeover) return;
    const run = currentRun(task);
    if (task.state === "accepted" || task.state === "awaiting_review") {
      yield* files
        .verify(task.artifacts)
        .pipe(
          Effect.catch((e) =>
            date.pipe(
              Effect.flatMap((at) => update(task.id, (t) => invalidateApproval(t, e.message, at))),
            ),
          ),
        );
      return;
    }
    if (!run || !liveRun(run)) return;
    const found = terminals.find((t) => matchesRun(t, run, bridge.owner));
    if (!found) {
      if (run.terminalId !== null)
        yield* block(
          task.id,
          run.id,
          "原进程已丢失；成果与检查点已保留，恢复将从当前阶段续做。",
          "lost",
        );
      else
        yield* block(
          task.id,
          run.id,
          "启动结果未确定，暂停派工。请核对 Herdr，避免重复执行。",
          "starting",
        );
      return;
    }
    if (run.terminalId === null) {
      yield* update(task.id, (t) => ({
        ...t,
        runs: t.runs.map((r) =>
          r.id === run.id
            ? {
                ...r,
                terminalId: found.address,
                terminalCreatedMs: found.created_ms,
                pid: found.pid ?? null,
                state: "running",
              }
            : r,
        ),
      }));
      task = yield* get(task.id);
    }
    const evidence = yield* files
      .collect(task, currentRun(task)!)
      .pipe(Effect.catch((e) => block(task.id, run.id, e.message).pipe(Effect.as(null))));
    if (evidence) {
      const at = yield* date;
      const nowMs = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      // Stop the writer before accepting files, then verify the durable copies and upstream inputs.
      if (found.state === "live") yield* bridge.kill(found);
      const intact = yield* files.verify([...task.artifacts, ...evidence.artifacts]).pipe(
        Effect.as(true),
        Effect.catch((e) =>
          update(task.id, (t) => {
            if (t.state === "stopped" || currentRun(t)?.id !== run.id) return t;
            return {
              ...invalidateApproval(t, e.message, at),
              runs: t.runs.map((r) =>
                r.id === run.id ? { ...r, state: "lost", reason: e.message, finishedAt: at } : r,
              ),
            };
          }).pipe(Effect.as(false)),
        ),
      );
      if (!intact) return;
      yield* update(task.id, (t) => {
        if (
          t.state === "stopped" ||
          t.takeover ||
          t.revision !== run.revision ||
          currentRun(t)?.id !== run.id
        )
          return t;
        const updated = {
          ...t,
          runs: t.runs.map((r) =>
            r.id === run.id
              ? { ...r, providerSessionId: evidence.providerSessionId, usage: evidence.usage }
              : r,
          ),
        };
        if (evidence.delivery.result === "pass") {
          const finished = finishStage(updated, evidence.artifacts, at);
          return {
            ...finished,
            memories: [
              ...finished.memories,
              ...evidence.delivery.memoryCandidates.map((text) => ({
                id: NodeCrypto.randomUUID(),
                text,
                source: `${run.id}/delivery.json`,
                scope: "task" as const,
                confirmed: false,
                supersedes: null,
              })),
            ],
          };
        }
        if (
          evidence.delivery.result === "blocked" &&
          evidence.delivery.blockReason === "network" &&
          t.networkRetries < 2
        ) {
          const waitMs = Math.max(
            evidence.delivery.retryAfterMs ?? 0,
            5000 * 2 ** t.networkRetries,
          );
          const notBefore = DateTime.formatIso(DateTime.makeUnsafe(nowMs + waitMs));
          return {
            ...updated,
            state: "queued",
            notBefore,
            networkRetries: t.networkRetries + 1,
            reason: `临时网络故障；等待至 ${notBefore} 后在原授权范围内重试。`,
            runs: updated.runs.map((r) =>
              r.id === run.id ? { ...r, state: "completed", finishedAt: at } : r,
            ),
            events: [...t.events, { at, kind: "network_retry", detail: notBefore }],
          };
        }
        const target = evidence.delivery.returnTo;
        const affected = reworkStages(t, target);
        const canRework =
          evidence.delivery.result === "changes_requested" &&
          affected !== null &&
          target !== undefined &&
          t.reworkCount < 3;
        return {
          ...updated,
          state: canRework ? "queued" : "blocked",
          stage: canRework ? target : t.stage,
          reworkCount: t.reworkCount + (canRework ? 1 : 0),
          reason: evidence.delivery.reason || "需要补充资料或工具权限。",
          scope: target === "research" ? "facts" : target === "copy" ? "copy" : t.scope,
          artifacts: t.artifacts.map((a) =>
            canRework && affected!.includes(a.stage) ? { ...a, valid: false } : a,
          ),
          runs: updated.runs.map((r) =>
            r.id === run.id ? { ...r, state: "completed", finishedAt: at } : r,
          ),
          feedback: [
            ...t.feedback,
            { revision: t.revision, scope: t.scope, text: evidence.delivery.reason },
          ],
          events: [...t.events, { at, kind: "stage_blocked", detail: evidence.delivery.reason }],
        };
      });
      return;
    }
    if (!hasOriginalProcess(found, currentRun(task)!)) {
      if (found.state === "live") yield* bridge.kill(found);
      yield* block(
        task.id,
        run.id,
        "原 Agent 进程已结束或被新 shell 替代；需要检查点恢复。",
        "lost",
      );
    } else if (found.status?.state === "blocked" || found.status?.state === "error") {
      yield* block(
        task.id,
        run.id,
        "执行者报告受阻。请查看终端；额度或权限不足时保留现场，不切换付费服务。",
      );
    } else if (found.status?.state === "done") {
      yield* block(task.id, run.id, "Herdr 报告结束，但尚无合格交付；请核对成果。");
    }
  });
  const drain = () =>
    safe(
      Effect.gen(function* () {
        const s = yield* settings();
        const tasks = yield* list();
        if (!s.enabled && !tasks.some((t) => t.runs.some(liveRun))) {
          yield* Ref.set(connection, "disabled");
          return;
        }
        const terminals = yield* bridge.list();
        yield* Ref.set(connection, "online");
        for (const task of tasks) yield* reconcile(task, terminals);
        if (!s.enabled) return;
        const fresh = yield* list();
        const now = yield* date;
        let capacity = 2 - fresh.filter((t) => t.runs.some(liveRun)).length;
        for (const task of fresh.filter(
          (t) =>
            t.state === "queued" &&
            !t.takeover &&
            !t.runs.some(liveRun) &&
            (t.notBefore === null || t.notBefore <= now),
        )) {
          if (capacity-- <= 0) break;
          const id = NodeCrypto.randomUUID();
          const at = yield* date;
          const assigned =
            task.plan?.steps.find((step) => step.id === task.stage) ??
            task.assignments?.find((item) => item.stage === task.stage);
          const run: CompanyRun = {
            id,
            stage: task.stage,
            ...(assigned ? { execution: assigned.execution, employeeId: assigned.employeeId } : {}),
            revision: task.revision,
            attempt:
              task.runs.filter((r) => r.stage === task.stage && r.revision === task.revision)
                .length + 1,
            state: "starting",
            terminalId: null,
            terminalCreatedMs: null,
            pid: null,
            providerSessionId: null,
            inputDigest: hash(artifactDigest(task.artifacts)),
            workspace: files.workspace(task.id, id),
            reason: null,
            usage: unknownUsage,
            startedAt: at,
            finishedAt: null,
          };
          yield* update(task.id, (t) =>
            t.state !== "queued" || t.revision !== run.revision
              ? t
              : { ...t, state: "running", reason: null, runs: [...t.runs, run], updatedAt: at },
          );
          if (currentRun(yield* get(task.id))?.id !== run.id) continue;
          const memories = fresh.flatMap((t) =>
            t.memories
              .filter((m) => m.confirmed && (m.scope === "company" || t.id === task.id))
              .map((m) => m.text),
          );
          const prepared = yield* files
            .prepare(task, run, s, memories)
            .pipe(
              Effect.catch((e) => block(task.id, run.id, e.message, "lost").pipe(Effect.as(null))),
            );
          if (prepared === null || (yield* get(task.id)).state === "stopped") continue;
          const preparedRun: CompanyRun = prepared.resume
            ? {
                ...run,
                providerSessionId: prepared.resume.sessionId,
                resumedFrom: prepared.resume.runId,
                usageBaseline: prepared.resume.usage,
              }
            : run;
          yield* update(task.id, (t) => ({
            ...t,
            runs: t.runs.map((r) => (r.id === run.id ? preparedRun : r)),
            events: [
              ...t.events,
              {
                at,
                kind: prepared.resume ? "provider_resume" : "minimal_handoff",
                detail: prepared.resume?.runId ?? run.id,
              },
            ],
          }));
          if ((yield* get(task.id)).state === "stopped") continue;
          const started = yield* bridge
            .start(preparedRun, prepared.home)
            .pipe(
              Effect.catch((e) =>
                block(task.id, run.id, e.message, "starting").pipe(Effect.as(null)),
              ),
            );
          if (!started) continue;
          yield* update(task.id, (t) => ({
            ...t,
            runs: t.runs.map((r) =>
              r.id === run.id
                ? {
                    ...r,
                    state: "running",
                    terminalId: started.address,
                    terminalCreatedMs: started.created_ms,
                    pid: started.pid ?? null,
                  }
                : r,
            ),
          }));
          if ((yield* get(task.id)).state === "stopped") yield* bridge.kill(started);
        }
        yield* PubSub.publish(changes, undefined);
      }).pipe(pumping.withPermits(1)),
    );
  const tick = drain().pipe(
    Effect.catch(() =>
      Ref.set(connection, "offline").pipe(
        Effect.andThen(PubSub.publish(changes, undefined)),
        Effect.asVoid,
      ),
    ),
  );
  yield* scheduler.register("ai-company", tick);
  yield* Stream.fromQueue(pulses).pipe(
    Stream.runForEach(() => tick),
    forkParked,
  );
  // Events drive immediate reconciliation; the scheduler is a program-only recovery backstop.
  yield* Effect.gen(function* () {
    const s = yield* settings();
    if (s.enabled || (yield* list()).some((t) => t.runs.some(liveRun))) {
      yield* bridge.events.pipe(
        Stream.runForEach(() => Queue.offer(pulses, undefined)),
        Effect.catch(() => Ref.set(connection, "offline")),
      );
    }
    yield* Effect.sleep("5 seconds");
  }).pipe(Effect.forever, forkParked);
  return CompanyService.of({
    snapshot,
    subscribe,
    command,
    configure,
    catalog,
    saveOrganization,
    terminal,
    keys,
    artifact,
    drain,
  });
});
export const layer = Layer.effect(CompanyService, make);
