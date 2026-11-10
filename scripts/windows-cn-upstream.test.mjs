import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { prepareSource, resolveBaseline, syncCn } from "./windows-cn-upstream.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "t3-cn-workflow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = path.join(root, "upstream");
  mkdirSync(upstream);
  const git = (...args) => execFileSync("git", args, { cwd: upstream, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "cn");
  git("config", "user.name", "wwj");
  git("config", "user.email", "test@example.invalid");
  git("config", "core.autocrlf", "false");
  writeFileSync(path.join(upstream, "ui.txt"), "官方界面\n");
  git("add", ".");
  git("commit", "-m", "official");
  git("tag", "v1.2.3");
  writeFileSync(path.join(upstream, "ui.txt"), "上游中文界面\n");
  git("commit", "-am", "Chinese");
  const sha = git("rev-parse", "HEAD");
  git("tag", "v1.2.3-zh-test.1");
  const cwd = path.join(root, "build");
  execFileSync("git", ["-c", "core.autocrlf=false", "clone", "--quiet", upstream, cwd]);
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd });
  return { root, cwd, upstream, sha, git };
}

test("locks a Chinese tag to a commit containing its official version", (t) => {
  const f = fixture(t);
  assert.equal(resolveBaseline({ cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream, ref: "v1.2.3-zh-test.1", version: "1.2.3-zh-test.2" }), f.sha);
  f.git("tag", "-a", "v1.2.3-zh-test.2", "-m", "annotated Chinese release");
  assert.equal(resolveBaseline({ cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream, ref: "v1.2.3-zh-test.2", version: "1.2.3-zh-test.2" }), f.sha);
});

test("rejects invalid refs, mismatched versions and a missing official tag", (t) => {
  const f = fixture(t);
  for (const [ref, version] of [["--upload-pack=x", "1.2.3-zh-test.1"], ["cn", "1.2.3"], ["v1.2.3-zh-test.1", "1.2.4-zh-test.1"], ["cn", "9.9.9-zh-test.1"]]) {
    assert.throws(() => resolveBaseline({ cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream, ref, version }));
  }
});

test("refuses a Chinese branch that does not contain the official release", (t) => {
  const f = fixture(t);
  f.git("checkout", "--orphan", "unrelated");
  f.git("commit", "-am", "unrelated");
  f.git("branch", "-f", "cn", "HEAD");
  assert.throws(() => resolveBaseline({ cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream, ref: "cn", version: "1.2.3-zh-test.1" }), /official/);
});

test("refuses to label a newer cn baseline with an older Windows version", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.upstream, "release.txt"), "new official release\n");
  f.git("add", ".");
  f.git("commit", "-m", "next official release");
  f.git("tag", "v1.2.4");
  assert.throws(() => resolveBaseline({
    cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream,
    ref: "cn", version: "1.2.3-zh-test.2",
  }), /already contains official v1.2.4/);
  assert.equal(resolveBaseline({
    cwd: f.cwd, upstreamUrl: f.upstream, officialUrl: f.upstream,
    ref: "v1.2.3-zh-test.1", version: "1.2.3-zh-test.2",
  }), f.sha);
});

test("syncs cn with a fast-forward and refuses divergent downstream commits", (t) => {
  const f = fixture(t);
  const originUrl = path.join(f.root, "downstream.git");
  execFileSync("git", ["clone", "--bare", "--quiet", f.upstream, originUrl]);
  execFileSync("git", ["--git-dir", originUrl, "update-ref", "refs/heads/cn", f.git("rev-parse", "v1.2.3")]);
  assert.equal(syncCn({ cwd: f.cwd, originUrl, sha: f.sha }), f.sha);
  writeFileSync(path.join(f.upstream, "local.txt"), "downstream\n");
  f.git("add", ".");
  f.git("commit", "-m", "downstream");
  const downstream = f.git("rev-parse", "HEAD");
  f.git("push", originUrl, "HEAD:cn");
  assert.throws(() => syncCn({ cwd: f.cwd, originUrl, sha: f.sha }), /fast-forward/);
  assert.equal(execFileSync("git", ["--git-dir", originUrl, "rev-parse", "cn"], { encoding: "utf8" }).trim(), downstream);
});

function patchFixture(f) {
  const relative = "apps/desktop/src/boot.ts";
  const target = path.join(f.upstream, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "const identity = 'upstream';\n");
  f.git("add", ".");
  f.git("commit", "-m", "desktop");
  const sha = f.git("rev-parse", "HEAD");
  const patchPath = path.join(f.root, "windows.patch");
  writeFileSync(patchPath, "diff --git a/apps/desktop/src/boot.ts b/apps/desktop/src/boot.ts\n--- a/apps/desktop/src/boot.ts\n+++ b/apps/desktop/src/boot.ts\n@@ -1 +1 @@\n-const identity = 'upstream';\n+const identity = 'windows';\n");
  const verifierPath = path.join(f.root, "verify.ps1");
  writeFileSync(verifierPath, "# verifier\n");
  execFileSync("git", ["fetch", "--quiet", f.upstream, sha], { cwd: f.cwd });
  return { sha, patchPath, verifierPath };
}

test("prepares the exact baseline and changes only Windows adaptation paths", (t) => {
  const f = fixture(t);
  const input = patchFixture(f);
  prepareSource({ cwd: f.cwd, ...input });
  assert.equal(readFileSync(path.join(f.cwd, "ui.txt"), "utf8"), "上游中文界面\n");
  assert.match(readFileSync(path.join(f.cwd, "apps/desktop/src/boot.ts"), "utf8"), /windows/);
  assert.equal(readFileSync(path.join(f.cwd, "verify-windows-cn-isolation.ps1"), "utf8"), "# verifier\n");
});

test("rejects conflicts and patches that edit translations or other business code", (t) => {
  const f = fixture(t);
  const input = patchFixture(f);
  writeFileSync(input.patchPath, readFileSync(input.patchPath, "utf8").replace("'upstream'", "'missing'"));
  assert.throws(() => prepareSource({ cwd: f.cwd, ...input }));
  assert.match(readFileSync(path.join(f.cwd, "apps/desktop/src/boot.ts"), "utf8"), /upstream/);
  writeFileSync(input.patchPath, readFileSync(input.patchPath, "utf8").replaceAll("apps/desktop/src/boot.ts", "ui.txt"));
  assert.throws(() => prepareSource({ cwd: f.cwd, ...input }), /allowed/);
});

test("refuses to replace a dirty source checkout", (t) => {
  const f = fixture(t);
  const input = patchFixture(f);
  writeFileSync(path.join(f.cwd, "ui.txt"), "unsaved change\n");
  assert.throws(() => prepareSource({ cwd: f.cwd, ...input }), /tracked changes/);
  assert.equal(readFileSync(path.join(f.cwd, "ui.txt"), "utf8"), "unsaved change\n");
});
