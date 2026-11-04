// @effect-diagnostics nodeBuiltinImport:off - bounded, atomic configuration persistence at the rules-source boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import { lock } from "proper-lockfile";
import {
  COMPANY_ORGANIZATION_PATH,
  CompanyOrganization,
  CompanyCatalog,
  type CompanySaveOrganizationInput,
} from "@t3tools/contracts";
import { evidenceFile, hash, inside } from "./fileBoundary.ts";

const decode = Schema.decodeSync(Schema.fromJsonString(CompanyOrganization));
const validate = Schema.decodeUnknownSync(CompanyOrganization);
const validateCatalog = Schema.decodeUnknownSync(CompanyCatalog);
const models = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      models: Schema.Array(
        Schema.Struct({
          slug: Schema.String,
          display_name: Schema.String,
          visibility: Schema.String,
          supported_reasoning_levels: Schema.Array(Schema.Struct({ effort: Schema.String })),
        }),
      ),
    }),
  ),
);
export async function readOrganization(root: string) {
  const bytes = await evidenceFile(root, COMPANY_ORGANIZATION_PATH, 512 * 1024);
  return { organization: decode(bytes.toString("utf8")), revision: hash(bytes) };
}
export async function saveOrganization(
  root: string,
  input: typeof CompanySaveOrganizationInput.Type,
) {
  const normalized = validate(input.organization);
  const body = { ...normalized, version: "", lastCommand: undefined };
  const fingerprint = hash(JSON.stringify(body));
  const canonicalRoot = await NodeFSP.realpath(root);
  const directory = await NodeFSP.realpath(NodePath.join(root, "rules/ai-company"));
  if (!inside(canonicalRoot, directory)) throw new Error("invalid configuration directory");
  let compromised = false;
  const release = await lock(NodePath.join(directory, "organization.json"), {
    stale: 120_000,
    update: 10_000,
    retries: 0,
    onCompromised: () => {
      compromised = true;
    },
  });
  const temporary = NodePath.join(directory, `.organization-${NodeCrypto.randomUUID()}.tmp`);
  try {
    const current = await readOrganization(root);
    if (current.organization.lastCommand?.id === input.commandId) {
      if (current.organization.lastCommand.fingerprint !== fingerprint)
        throw new Error("command collision");
      return;
    }
    if (current.revision !== input.expectedRevision) throw new Error("configuration changed");
    const next = {
      ...normalized,
      version: NodeCrypto.randomUUID(),
      lastCommand: { id: input.commandId, fingerprint },
    };
    const bytes = JSON.stringify(next, null, 2) + "\n";
    if (Buffer.byteLength(bytes) > 512 * 1024) throw new Error("configuration too large");
    const file = await NodeFSP.open(temporary, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    if (compromised || (await readOrganization(root)).revision !== current.revision)
      throw new Error("configuration changed");
    await NodeFSP.rename(temporary, NodePath.join(directory, "organization.json"));
  } finally {
    await NodeFSP.rm(temporary, { force: true });
    if (!compromised) await release();
  }
}
export async function readCatalog(root: string): Promise<CompanyCatalog> {
  let availableModels: CompanyCatalog["models"] = [];
  try {
    const home = process.env.CODEX_HOME ?? NodePath.join(NodeOS.homedir(), ".codex");
    const bytes = await evidenceFile(home, "models_cache.json", 4 * 1024 * 1024);
    availableModels = models(bytes.toString("utf8"))
      .models.filter((m) => m.visibility === "list")
      .map((m) => ({
        id: m.slug,
        name: m.display_name,
        efforts: m.supported_reasoning_levels.map((r) => r.effort),
      }));
  } catch {
    /* A missing local model catalogue must not imply provider availability. */
  }
  const skills: { path: string; name: string }[] = [];
  let visited = 0;
  const walk = async (relative: string, depth: number) => {
    if (depth > 8 || visited++ > 10000) throw new Error("skill catalogue exceeds limit");
    const entries = await NodeFSP.readdir(NodePath.join(root, relative), { withFileTypes: true });
    if (entries.some((entry) => entry.name === "SKILL.md" && entry.isFile())) {
      const path = `${relative}/SKILL.md`;
      await evidenceFile(root, path, 256 * 1024);
      skills.push({ path, name: relative.replace(/^shared-skills\//, "") });
    }
    for (const entry of entries)
      if (
        entry.isDirectory() &&
        (!entry.name.startsWith(".") || entry.name === ".system") &&
        entry.name !== "node_modules"
      )
        await walk(`${relative}/${entry.name}`, depth + 1);
  };
  await walk("shared-skills", 0);
  return validateCatalog({
    models: availableModels,
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  });
}
