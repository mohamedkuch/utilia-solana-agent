import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { VERSION } from "../src/version.js";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("runs the published CLI entrypoint successfully", async () => {
  const result = await execFileAsync(process.execPath, [cliPath, "--version"]);
  assert.equal(result.stdout, `${VERSION}\n`);
  assert.equal(result.stderr, "");
});

test("formats failures from the published CLI entrypoint", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "unknown-command"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, "");
      assert.match(error.stderr, /^utilia-solana-agent: /);
      return true;
    },
  );
});
