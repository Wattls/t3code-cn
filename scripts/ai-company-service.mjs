import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeNet from "node:net";
import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";

// This feature uses its own launchd label and data directory; never replace t3's standard service.
const label = "com.t3code-cn.ai-company";
const root = NodePath.resolve(import.meta.dirname, "..");
const home = NodePath.join(NodeOS.homedir(), ".t3-company-cn");
const plist = NodePath.join(NodeOS.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const build = NodePath.join(root, "apps", "server", "dist");
const app = NodePath.join(home, "app");
const entry = NodePath.join(app, "bin.mjs");
const node = NodePath.join(home, "runtime", "node");
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
const port = 3775;
const action = process.argv[2] ?? "plan";
// oxlint-disable-next-line t3code/no-global-process-runtime -- This standalone installer inspects its actual host before starting any Effect runtime.
if (process.platform !== "darwin")
  throw new Error("此安装器仅支持 macOS；其他平台可用 t3 serve 指定独立数据目录运行。");
const launchctl = (args) =>
  NodeChildProcess.spawnSync("/bin/launchctl", args, { encoding: "utf8" });
const state = () => launchctl(["print", target]);
const xml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const log = NodePath.join(home, "service.log");
const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[node, entry, "serve", "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser"].map((s) => `<string>${xml(s)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(home)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml([NodePath.dirname(node), NodePath.join(NodeOS.homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":"))}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>`;
async function stageRuntime() {
  const packageJson = JSON.parse(
    await NodeFSP.readFile(NodePath.join(root, "package.json"), "utf8"),
  );
  let sourceNode = node;
  try {
    await NodeFSP.access(sourceNode);
  } catch {
    sourceNode = process.execPath;
  }
  const version = NodeChildProcess.spawnSync(sourceNode, ["--version"], {
    encoding: "utf8",
  }).stdout?.trim();
  if (version !== `v${packageJson.engines.node}`)
    throw new Error(`请用 Node ${packageJson.engines.node} 执行安装，或将该版本放在 ${node}。`);
  await NodeFSP.mkdir(NodePath.dirname(node), { recursive: true, mode: 0o700 });
  if (sourceNode !== node) {
    await NodeFSP.copyFile(sourceNode, node);
    await NodeFSP.chmod(node, 0o700);
  }
  await NodeFSP.access(NodePath.join(build, "bin.mjs"));
  await NodeFSP.mkdir(app, { recursive: true, mode: 0o700 });
  await NodeFSP.cp(build, app, { recursive: true, filter: (path) => !path.endsWith(".map") });
  const dependencies = JSON.parse(
    await NodeFSP.readFile(NodePath.join(root, "apps/server/package.json"), "utf8"),
  ).dependencies;
  const store = NodePath.join(root, "node_modules", ".pnpm");
  const destination = NodePath.join(app, "node_modules");
  const pending = [];
  const copied = new Set();
  const enqueue = async (path) => {
    const target = await NodeFSP.realpath(path);
    const rel = NodePath.relative(store, target);
    if (rel.startsWith("..") || NodePath.isAbsolute(rel))
      throw new Error("运行依赖不在本工作副本的 pnpm store 内。");
    pending.push(rel.split(NodePath.sep)[0]);
    return rel;
  };
  for (const name of Object.keys(selectCliRuntimeExternalDependencies(dependencies))) {
    const rel = await enqueue(NodePath.join(root, "apps/server/node_modules", name));
    const link = NodePath.join(destination, name);
    await NodeFSP.mkdir(NodePath.dirname(link), { recursive: true });
    try {
      await NodeFSP.unlink(link);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await NodeFSP.symlink(
      NodePath.relative(NodePath.dirname(link), NodePath.join(destination, ".pnpm", rel)),
      link,
    );
  }
  while (pending.length) {
    const name = pending.pop();
    if (copied.has(name)) continue;
    copied.add(name);
    const source = NodePath.join(store, name);
    await NodeFSP.cp(source, NodePath.join(destination, ".pnpm", name), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
    const inspect = async (directory) => {
      for (const item of await NodeFSP.readdir(directory, { withFileTypes: true })) {
        if (item.name === ".bin") continue;
        const path = NodePath.join(directory, item.name);
        if (item.isSymbolicLink()) await enqueue(path);
        else if (item.isDirectory() && item.name.startsWith("@")) await inspect(path);
      }
    };
    await inspect(NodePath.join(source, "node_modules"));
  }
}
if (action === "plan") {
  console.log(
    `服务：${label}\n后台：${entry}\n数据：${home}\n地址：http://127.0.0.1:${port}/company\n启用后不随 T3 窗口关闭退出。公司派工初始为关闭。`,
  );
} else if (action === "install") {
  if (state().status === 0)
    throw new Error("公司服务已安装；构建新版本后使用 update 更新运行副本。");
  await new Promise((resolve, reject) => {
    const probe = NodeNet.createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  await NodeFSP.mkdir(home, { recursive: true, mode: 0o700 });
  await stageRuntime();
  await NodeFSP.mkdir(NodePath.dirname(plist), { recursive: true });
  await NodeFSP.writeFile(plist, content, { mode: 0o600 });
  const result = launchctl(["bootstrap", domain, plist]);
  if (result.status !== 0)
    throw new Error(`公司服务启动失败（${result.status}），请检查 launchd。`);
  console.log(`公司后台已安装。地址：http://127.0.0.1:${port}/company；使用 status 核对。`);
} else if (action === "update") {
  // Updating binaries must preserve the installed launchd configuration byte for byte.
  await NodeFSP.access(plist);
  if (state().status === 0 && launchctl(["bootout", target]).status !== 0)
    throw new Error("停止公司后台失败。");
  await stageRuntime();
  if (launchctl(["bootstrap", domain, plist]).status !== 0)
    throw new Error("公司后台更新后启动失败。");
  console.log("公司后台已更新，任务将从持久记录核对。");
} else if (action === "status") {
  const result = state();
  console.log(
    result.status === 0
      ? `公司后台已加载；${result.stdout.match(/state = (.*)/)?.[1] ?? "状态未知"}；http://127.0.0.1:${port}/company`
      : "公司后台尚未加载。",
  );
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (action === "restart") {
  if (state().status !== 0) throw new Error("公司后台未安装。");
  const result = launchctl(["kickstart", "-k", target]);
  if (result.status !== 0) throw new Error("公司后台重启失败。");
  console.log("公司后台已重启；Herdr 原任务将由持久记录核对。");
} else if (action === "uninstall") {
  if (state().status === 0 && launchctl(["bootout", target]).status !== 0)
    throw new Error("停止公司后台失败，未删除配置。");
  await NodeFSP.rm(plist, { force: true });
  console.log("公司后台已移除；公司数据和 Herdr 终端保留。停止任务请先在面板中操作。");
} else {
  throw new Error(
    "用法：node scripts/ai-company-service.mjs plan|install|status|restart|update|uninstall",
  );
}
