import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM = "https://github.com/Dealyoung/t3code-cn.git";
const OFFICIAL = "https://github.com/pingdotgg/t3code.git";
const WINDOWS_PATHS = new Set([
  "apps/desktop/package.json",
  "apps/desktop/resources/installer.nsh",
  "apps/desktop/src/boot.ts",
  "apps/desktop/src/app/DesktopEnvironment.ts",
  "apps/desktop/src/window/DesktopApplicationMenu.test.ts",
  "scripts/build-desktop-artifact.ts",
]);

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function commit(cwd, value) {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("Expected a full commit SHA.");
  return git(cwd, "rev-parse", "--verify", `${value}^{commit}`);
}

function containsCommit(cwd, ancestor, descendant) {
  try {
    git(cwd, "merge-base", "--is-ancestor", ancestor, descendant);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function newerRelease(candidate, version) {
  const left = candidate.split(".").map(Number);
  const right = version.split(".").map(Number);
  const position = left.findIndex((value, index) => value !== right[index]);
  return position >= 0 && left[position] > right[position];
}

export function resolveBaseline({ cwd, upstreamUrl = UPSTREAM, officialUrl = OFFICIAL, ref, version }) {
  const versionMatch = /^(\d+\.\d+\.\d+)-zh-test\.\d+$/.exec(version);
  if (!versionMatch) throw new Error("Invalid Windows Chinese test version.");
  if (ref !== "cn" && !/^v\d+\.\d+\.\d+-zh-test\.\d+$/.test(ref)) {
    throw new Error("Only cn or a Chinese release tag is allowed.");
  }
  if (ref !== "cn" && !ref.startsWith(`v${versionMatch[1]}-zh-test.`)) {
    throw new Error("Windows version must match the Chinese upstream release.");
  }
  const remoteRef = ref === "cn" ? "refs/heads/cn" : `refs/tags/${ref}`;
  git(cwd, "fetch", "--no-tags", upstreamUrl, remoteRef);
  const sha = git(cwd, "rev-parse", "FETCH_HEAD^{commit}");
  git(cwd, "fetch", "--no-tags", officialUrl, `refs/tags/v${versionMatch[1]}`);
  const official = git(cwd, "rev-parse", "FETCH_HEAD^{commit}");
  if (!containsCommit(cwd, official, sha)) {
    throw new Error("Chinese upstream does not contain the requested official release.");
  }
  const officialTags = git(cwd, "ls-remote", "--tags", "--refs", officialUrl, "refs/tags/v*");
  for (const line of officialTags.split("\n")) {
    const match = /refs\/tags\/v(\d+\.\d+\.\d+)$/.exec(line);
    if (!match || !newerRelease(match[1], versionMatch[1])) continue;
    git(cwd, "fetch", "--no-tags", officialUrl, `refs/tags/v${match[1]}`);
    if (containsCommit(cwd, git(cwd, "rev-parse", "FETCH_HEAD^{commit}"), sha)) {
      throw new Error(`Chinese upstream already contains official v${match[1]}; update the Windows version.`);
    }
  }
  return sha;
}

export function syncCn({ cwd, originUrl, sha }) {
  commit(cwd, sha);
  git(cwd, "fetch", "--no-tags", originUrl, "refs/heads/cn");
  const current = git(cwd, "rev-parse", "FETCH_HEAD^{commit}");
  if (!containsCommit(cwd, current, sha)) {
    throw new Error("Downstream cn cannot fast-forward; refusing to overwrite its history.");
  }
  // A normal push also rejects concurrent divergence after the ancestor check.
  git(cwd, "push", originUrl, `${sha}:refs/heads/cn`);
  const remote = git(cwd, "ls-remote", originUrl, "refs/heads/cn").split(/\s+/)[0];
  if (remote !== sha) throw new Error("Remote cn did not match the locked upstream commit.");
  return remote;
}

export function prepareSource({ cwd, sha, patchPath, verifierPath }) {
  commit(cwd, sha);
  if (git(cwd, "status", "--porcelain", "--untracked-files=no")) {
    throw new Error("Source checkout contains tracked changes.");
  }
  const statistics = git(cwd, "apply", "--numstat", patchPath);
  const paths = statistics.split("\n").map((line) => line.split("\t")[2]);
  if (paths.length === 0 || paths.some((file) => !WINDOWS_PATHS.has(file))) {
    throw new Error("Patch contains paths outside the allowed Windows adaptation files.");
  }
  // The automation files disappear when checking out upstream; preserve only the overlay inputs.
  const saved = mkdtempSync(path.join(tmpdir(), "t3-windows-overlay-"));
  try {
    copyFileSync(patchPath, path.join(saved, "windows.patch"));
    copyFileSync(verifierPath, path.join(saved, "verify.ps1"));
    git(cwd, "-c", "checkout.workers=0", "checkout", "--detach", sha);
    git(cwd, "apply", "--check", path.join(saved, "windows.patch"));
    git(cwd, "apply", path.join(saved, "windows.patch"));
    const changed = git(cwd, "diff", "--name-only").split("\n");
    if (changed.some((file) => !WINDOWS_PATHS.has(file))) {
      throw new Error("Prepared source changed a file outside the Windows adaptation boundary.");
    }
    copyFileSync(path.join(saved, "verify.ps1"), path.join(cwd, "verify-windows-cn-isolation.ps1"));
  } finally {
    rmSync(saved, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, first, second] = process.argv.slice(2);
  const cwd = process.cwd();
  try {
    if (operation === "resolve") {
      const sha = resolveBaseline({ cwd, ref: first, version: second });
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
      console.log(`Locked Chinese upstream ${first}: ${sha}`);
    } else if (operation === "sync") {
      syncCn({ cwd, sha: first, originUrl: "origin" });
      console.log(`Synced cn to ${first}`);
    } else if (operation === "prepare") {
      if (process.env.GITHUB_ACTIONS !== "true") throw new Error("CLI prepare is restricted to disposable GitHub Actions runners.");
      prepareSource({
        cwd, sha: first, patchPath: path.resolve("packaging/windows-cn.patch"),
        verifierPath: path.resolve("verify-windows-cn-isolation.ps1"),
      });
      console.log(`Prepared Chinese upstream ${first} with Windows overlay.`);
    } else {
      throw new Error("Expected resolve <cn|tag> <version>, sync <sha>, or prepare <sha>.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error?.stderr) console.error(String(error.stderr));
    process.exitCode = 1;
  }
}
