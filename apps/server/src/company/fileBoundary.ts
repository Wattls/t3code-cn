// @effect-diagnostics nodeBuiltinImport:off - filesystem evidence boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
export const hash = (value: string | Uint8Array) =>
  NodeCrypto.createHash("sha256").update(value).digest("hex");
export function inside(root: string, path: string): boolean {
  const rel = NodePath.relative(root, path);
  return (
    rel !== "" && !rel.startsWith(`..${NodePath.sep}`) && rel !== ".." && !NodePath.isAbsolute(rel)
  );
}
export async function evidenceFile(
  root: string,
  path: string,
  limit = 12 * 1024 * 1024,
): Promise<Buffer> {
  const target = NodePath.resolve(root, path);
  if (!inside(root, target)) throw new Error("outside workspace");
  const real = await NodeFSP.realpath(target);
  const stat = await NodeFSP.lstat(target);
  if (
    !inside(await NodeFSP.realpath(root), real) ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size === 0 ||
    stat.size > limit
  )
    throw new Error("invalid evidence");
  // Open the resolved target without following a replaced final symlink.
  const handle = await NodeFSP.open(
    real,
    NodeFSP.constants.O_RDONLY | NodeFSP.constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.size > limit) throw new Error("evidence changed");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
