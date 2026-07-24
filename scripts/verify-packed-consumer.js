import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "utilia-consumer-"));
const packDirectory = path.join(temporaryRoot, "pack");
const consumerDirectory = path.join(temporaryRoot, "consumer");

try {
  await mkdir(packDirectory);
  await mkdir(consumerDirectory);
  const { stdout: packOutput } = await execFileAsync(
    "npm",
    ["pack", "--json", "--pack-destination", packDirectory],
    { cwd: root, maxBuffer: 20 * 1024 * 1024 },
  );
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = path.join(packDirectory, filename);

  await writeFile(
    path.join(temporaryRoot, "package.json"),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );
  await execFileAsync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      "--prefix",
      consumerDirectory,
      tarball,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );

  await execFileAsync(
    "npm",
    [
      "ls",
      "--all",
      "--prefix",
      consumerDirectory,
      "@hono/node-server",
      "@modelcontextprotocol/sdk",
      "@x402/mcp",
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  const { stdout: auditOutput } = await execFileAsync(
    "npm",
    [
      "audit",
      "--audit-level=moderate",
      "--json",
      "--prefix",
      consumerDirectory,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  const audit = JSON.parse(auditOutput);
  assert.equal(audit.metadata.vulnerabilities.total, 0);

  const cliPath = path.join(
    consumerDirectory,
    "node_modules",
    "utilia-solana-agent",
    "src",
    "cli.js",
  );
  const { stdout: versionOutput } = await execFileAsync(
    process.execPath,
    [cliPath, "--version"],
    { maxBuffer: 1024 * 1024 },
  );
  assert.equal(versionOutput.trim(), packageManifest.version);

  const sdkManifestPath = path.join(
    consumerDirectory,
    "node_modules",
    "utilia-solana-agent",
    "node_modules",
    "@modelcontextprotocol",
    "sdk",
    "package.json",
  );
  const sdkManifest = JSON.parse(await readFile(sdkManifestPath, "utf8"));
  assert.equal(sdkManifest.version, "1.29.0");
  assert.equal(sdkManifest.dependencies["@hono/node-server"], "2.0.11");

  console.log(
    `Packed consumer check passed for ${packageManifest.name}@${packageManifest.version} with zero vulnerabilities.`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
