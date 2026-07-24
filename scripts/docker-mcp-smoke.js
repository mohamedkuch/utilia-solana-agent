import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";

const image = process.env.UTILIA_DOCKER_IMAGE || "utilia-solana-agent:ci";
const expectedTools = [
  "normalize_audio",
  "pdf_to_markdown",
  "solana_priority_fees",
  "solana_token_analysis",
  "solana_transaction_analysis",
  "solana_transaction_simulate",
];

const child = spawn("docker", ["run", "--rm", "-i", image], {
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: child.stdout });

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
}, 15_000);

const responses = new Map();
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id !== undefined) responses.set(message.id, message);
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "utilia-ci", version: "1.0.0" },
    },
  })}\n`,
);
child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  })}\n`,
);
child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  })}\n`,
);
child.stdin.end();

const [exitCode] = await Promise.all([
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  }),
  new Promise((resolve) => {
    lines.once("close", resolve);
  }),
]);
clearTimeout(timeout);

assert.equal(exitCode, 0);
assert.equal(responses.get(1)?.result?.serverInfo?.name, "utilia-solana-agent");
assert.deepEqual(
  responses
    .get(2)
    ?.result?.tools?.map((tool) => tool.name)
    .sort(),
  expectedTools,
);
console.log(`MCP Docker smoke test passed with ${expectedTools.length} tools.`);
