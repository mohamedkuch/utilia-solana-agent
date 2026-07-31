#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { CompatibilityError, verifyArtifact } from "./lib.mjs";

const [filename, ...extra] = process.argv.slice(2);
if (!filename || extra.length > 0) {
  process.stderr.write(
    "usage: node examples/compatibility/verify-artifact.mjs <artifact.json>\n",
  );
  process.exitCode = 2;
} else {
  try {
    const artifact = JSON.parse(await readFile(filename, "utf8"));
    const result = verifyArtifact(artifact);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const result = {
      valid: false,
      failure: {
        class:
          error instanceof CompatibilityError
            ? error.failureClass
            : "invalid_configuration",
        message: error instanceof Error ? error.message : "unknown error",
      },
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}
