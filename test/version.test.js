import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { VERSION } from "../src/version.js";

test("keeps the runtime and package versions aligned", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const nvmVersion = (
    await readFile(new URL("../.nvmrc", import.meta.url), "utf8")
  ).trim();
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.equal(VERSION, packageJson.version);
  assert.equal(packageJson.mcpName, "ink.utilia/solana-preflight");
  assert.equal(nvmVersion, "22.23.1");
  assert.match(packageJson.engines.node, /^>=22/);
  assert.match(workflow, new RegExp(`node-version: ${nvmVersion}`));
  assert.match(workflow, /test "\$\(node --version\)" = "v22\.23\.1"/);
  assert.match(workflow, /test "\$\(npm --version\)" = "10\.9\.8"/);
});

test("keeps every published instruction aligned with the current client", async () => {
  const instructionPaths = [
    "../README.md",
    "../skills/utilia-solana-preflight/SKILL.md",
    "../skills/utilia-pdf-to-markdown/SKILL.md",
    "../skills/utilia-audio-normalization/SKILL.md",
  ];
  const instructionContents = await Promise.all(
    instructionPaths.map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );

  for (const content of instructionContents) {
    assert.match(
      content,
      new RegExp(`utilia-solana-agent@${VERSION.replaceAll(".", "\\.")}`),
    );
    const pinnedVersions = [
      ...content.matchAll(/utilia-solana-agent@(\d+\.\d+\.\d+)/g),
    ].map((match) => match[1]);
    assert.deepEqual([...new Set(pinnedVersions)], [VERSION]);
  }

  const preflight = instructionContents[1];
  for (const tool of [
    "solana_priority_fees",
    "solana_transaction_analysis",
    "solana_token_analysis",
    "solana_transaction_simulate",
    "pdf_to_markdown",
    "normalize_audio",
  ]) {
    assert.match(preflight, new RegExp(`\`${tool}\``));
  }
});
