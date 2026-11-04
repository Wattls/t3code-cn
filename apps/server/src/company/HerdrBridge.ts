// @effect-diagnostics nodeBuiltinImport:off - local process transport and owned runtime directories.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeFSP from "node:fs/promises";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { CompanyError, type CompanyRun } from "@t3tools/contracts";
import { ServerConfig } from "../config.ts";
import { ProcessRunner } from "../processRunner.ts";

const decodeEnvelope = Schema.decodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.Number,
      result: Schema.optional(Schema.Unknown),
      error: Schema.optional(Schema.Unknown),
    }),
  ),
);
const decodeEvent = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      method: Schema.optional(Schema.String),
      result: Schema.optional(Schema.Unknown),
      params: Schema.optional(
        Schema.Struct({
          seq: Schema.optional(Schema.Number),
          type: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const HerdrTerminal = Schema.Struct({
  address: Schema.String,
  name: Schema.NullOr(Schema.String),
  labels: Schema.Record(Schema.String, Schema.String),
  argv: Schema.Array(Schema.String),
  cwd: Schema.String,
  state: Schema.String,
  created_ms: Schema.Number,
  pid: Schema.optional(Schema.NullOr(Schema.Number)),
  reason: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.Struct({ state: Schema.String }))),
  foreground: Schema.optional(
    Schema.NullOr(Schema.Struct({ pid: Schema.Number, argv: Schema.Array(Schema.String) })),
  ),
});
export type HerdrTerminal = typeof HerdrTerminal.Type;
export class HerdrBridge extends Context.Service<
  HerdrBridge,
  {
    readonly owner: string;
    readonly list: () => Effect.Effect<readonly HerdrTerminal[], CompanyError>;
    readonly start: (
      run: CompanyRun,
      codexHome: string,
    ) => Effect.Effect<HerdrTerminal, CompanyError>;
    readonly kill: (terminal: HerdrTerminal) => Effect.Effect<void, CompanyError>;
    readonly keys: (
      terminal: HerdrTerminal,
      keys: readonly string[],
    ) => Effect.Effect<void, CompanyError>;
    readonly read: (
      terminal: HerdrTerminal,
    ) => Effect.Effect<{ text: string; complete: boolean }, CompanyError>;
    readonly events: Stream.Stream<"change" | "online" | "offline", CompanyError>;
  }
>()("t3/company/HerdrBridge") {}

export function matchesRun(terminal: HerdrTerminal, run: CompanyRun, owner: string): boolean {
  return (
    terminal.labels["t3-company"] === owner &&
    terminal.labels["run"] === run.id &&
    terminal.cwd === run.workspace &&
    (run.terminalId === null ||
      (terminal.address === run.terminalId && terminal.created_ms === run.terminalCreatedMs))
  );
}
export function hasOriginalProcess(terminal: HerdrTerminal, run: CompanyRun): boolean {
  return (
    terminal.state === "live" &&
    terminal.pid != null &&
    (run.pid === null || terminal.pid === run.pid) &&
    terminal.reason !== "stopped_by_restart" &&
    terminal.reason !== "holder_lost" &&
    terminal.argv.some((arg) => /(?:^|[/\\])codex$/.test(arg))
  );
}
const fail = () =>
  new CompanyError({ message: "Herdr 连接或响应异常；已保留任务，待核对运行状态。" });
const make = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const runner = yield* ProcessRunner;
  const owner = NodeCrypto.createHash("sha256").update(config.stateDir).digest("hex").slice(0, 16);
  const runtime = NodePath.join(config.stateDir, "company", "herdr");
  const env = {
    HC_SESSION: `t3-${owner}`,
    HC_SOCKET: NodePath.join(NodeOS.tmpdir(), `t3-hc-${owner}.sock`),
    XDG_CONFIG_HOME: NodePath.join(runtime, "config"),
    XDG_STATE_HOME: NodePath.join(runtime, "state"),
  };
  // Do not inherit a parent hc terminal: company work outlives the T3 transport.
  const executable = NodePath.join(NodeOS.homedir(), ".local", "bin", "hc");
  const prepare = Effect.tryPromise({
    try: async () => {
      await NodeFSP.mkdir(env.XDG_CONFIG_HOME, { recursive: true, mode: 0o700 });
      await NodeFSP.mkdir(env.XDG_STATE_HOME, { recursive: true, mode: 0o700 });
    },
    catch: fail,
  });
  const rpc = Effect.fn("CompanyHerdr.rpc")(function* <A>(
    method: string,
    params: object,
    schema: Schema.Codec<A, unknown, never, never>,
  ) {
    yield* prepare;
    const result = yield* runner
      .run({
        command: executable,
        args: ["connect"],
        env,
        stdin: encodeJson({ jsonrpc: "2.0", id: 1, method, params }) + "\n",
        timeout: "30 seconds",
        maxOutputBytes: 2 * 1024 * 1024,
      })
      .pipe(Effect.mapError(fail));
    if (result.code !== 0) return yield* fail();
    const envelope = yield* decodeEnvelope(result.stdout.trim()).pipe(Effect.mapError(fail));
    if (envelope.error !== undefined || envelope.result === undefined) return yield* fail();
    return yield* Schema.decodeEffect(schema)(envelope.result).pipe(Effect.mapError(fail));
  });
  const own = Effect.fn("CompanyHerdr.assertOwned")(function* (terminal: HerdrTerminal) {
    if (terminal.labels["t3-company"] !== owner)
      return yield* new CompanyError({ message: "无法操作本公司之外的 Herdr 终端。" });
    const current = yield* rpc("terminal.get", { terminal: terminal.address }, HerdrTerminal);
    if (
      current.created_ms !== terminal.created_ms ||
      current.labels["t3-company"] !== owner ||
      current.labels["run"] !== terminal.labels["run"]
    ) {
      return yield* new CompanyError({ message: "终端身份已改变，操作已取消。" });
    }
  });
  const events = Stream.callback<"change" | "online" | "offline", CompanyError>(
    (queue) =>
      Effect.gen(function* () {
        yield* prepare;
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const child = NodeChildProcess.spawn(executable, ["connect"], {
              env: { ...process.env, ...env },
              stdio: ["pipe", "pipe", "ignore"],
            });
            let buffered = "";
            let lastSequence = -1;
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk: string) => {
              buffered += chunk;
              if (buffered.length > 2 * 1024 * 1024) {
                child.kill();
                return;
              }
              let end: number;
              while ((end = buffered.indexOf("\n")) >= 0) {
                const line = buffered.slice(0, end);
                buffered = buffered.slice(end + 1);
                try {
                  const event = decodeEvent(line);
                  if (event.result !== undefined) Queue.offerUnsafe(queue, "online");
                  if (event.method === "missed") {
                    lastSequence = event.params?.seq ?? -1;
                    Queue.offerUnsafe(queue, "change");
                  }
                  if (event.method === "event" && (event.params?.seq ?? -1) > lastSequence) {
                    lastSequence = event.params?.seq ?? lastSequence;
                    if (!["size", "title", "doc"].includes(event.params?.type ?? ""))
                      Queue.offerUnsafe(queue, "change");
                  }
                } catch {
                  child.kill();
                }
              }
            });
            child.on("error", () => Queue.failCauseUnsafe(queue, Cause.fail(fail())));
            child.on("close", () => Queue.failCauseUnsafe(queue, Cause.fail(fail())));
            child.stdin.on("error", () => Queue.failCauseUnsafe(queue, Cause.fail(fail())));
            child.stdin.write(
              encodeJson({
                jsonrpc: "2.0",
                id: 1,
                method: "events.subscribe",
                params: { labels: { "t3-company": owner } },
              }) + "\n",
            );
            return child;
          }),
          (child) =>
            Effect.sync(() => {
              child.kill();
            }),
        );
      }),
    { bufferSize: 1, strategy: "sliding" },
  );
  return HerdrBridge.of({
    owner,
    list: Effect.fn("HerdrBridge.list")(() =>
      rpc(
        "terminal.list",
        { all: true, labels: { "t3-company": owner } },
        Schema.Struct({ terminals: Schema.Array(HerdrTerminal) }),
      ).pipe(Effect.map((r) => r.terminals)),
    ),
    start: Effect.fn("HerdrBridge.start")((run, codexHome) =>
      rpc(
        "terminal.run",
        {
          argv: [
            "codex",
            ...(run.resumedFrom && run.providerSessionId
              ? ["resume", run.providerSessionId, "--cd", run.workspace]
              : []),
            ...(run.execution
              ? [
                  "--model",
                  run.execution.model,
                  "-c",
                  `model_reasoning_effort=${JSON.stringify(run.execution.effort)}`,
                ]
              : []),
            "--no-daemon",
            "--no-alt-screen",
            "--sandbox",
            "workspace-write",
            "--ask-for-approval",
            "on-request",
            "--search",
            "-c",
            'model_provider="openai"',
            "-c",
            "sandbox_workspace_write.network_access=false",
            "请完整阅读当前目录的 TASK.md，以本轮版本、交付路径与当前工作区为准，在授权范围内完成当前阶段。恢复会话时不要写入旧工作区。",
          ],
          cwd: run.workspace,
          name: `co-${run.id.slice(0, 28)}`,
          no_parent: true,
          no_notify: true,
          keep: false,
          wait: false,
          labels: { "t3-company": owner, run: run.id },
          env: {
            CODEX_HOME: codexHome,
            OPENAI_API_KEY: "",
            OPENAI_BASE_URL: "",
            CODEX_API_KEY: "",
            HC_TERMINAL_ID: "",
          },
        },
        HerdrTerminal,
      ),
    ),
    kill: Effect.fn("HerdrBridge.kill")((terminal) =>
      own(terminal).pipe(
        Effect.andThen(rpc("terminal.kill", { terminal: terminal.address }, HerdrTerminal)),
        Effect.asVoid,
      ),
    ),
    keys: Effect.fn("HerdrBridge.keys")((terminal, keys) =>
      own(terminal).pipe(
        Effect.andThen(rpc("terminal.keys", { terminal: terminal.address, keys }, Schema.Unknown)),
        Effect.asVoid,
      ),
    ),
    read: Effect.fn("HerdrBridge.read")((terminal) =>
      own(terminal).pipe(
        Effect.andThen(
          rpc(
            "terminal.read",
            { terminal: terminal.address, lines: 120 },
            Schema.Struct({ text: Schema.String, complete: Schema.Boolean }),
          ),
        ),
      ),
    ),
    events,
  });
});
export const layer = Layer.effect(HerdrBridge, make);
