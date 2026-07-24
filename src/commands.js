export const TOOL_NAMES = {
  fees: "solana_priority_fees",
  transaction: "solana_transaction_analysis",
  simulate: "solana_transaction_simulate",
  token: "solana_token_analysis",
  pdf: "pdf_to_markdown",
};

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

export function parseCommand(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { type: "help" };
  }
  if (command === "--version" || command === "-v") return { type: "version" };
  if (command === "mcp") return { type: "mcp" };
  if (command === "doctor") return { type: "doctor" };
  if (command === "fees") {
    const accounts = rest[0] ? rest[0].split(",").filter(Boolean) : [];
    return { type: "call", tool: TOOL_NAMES.fees, args: { accounts } };
  }
  if (command === "transaction") {
    if (!rest[0]) throw new Error("transaction requires a Solana signature");
    return { type: "call", tool: TOOL_NAMES.transaction, args: { signature: rest[0] } };
  }
  if (command === "simulate") {
    if (!rest[0]) throw new Error("simulate requires a serialized transaction");
    return {
      type: "call",
      tool: TOOL_NAMES.simulate,
      args: { transaction: rest[0], encoding: rest[1] ?? "base64", accountAddresses: [] },
    };
  }
  if (command === "token") {
    if (!rest[0]) throw new Error("token requires an SPL mint address");
    return { type: "call", tool: TOOL_NAMES.token, args: { mint: rest[0] } };
  }
  if (command === "pdf") {
    if (!rest[0]) throw new Error("pdf requires a public HTTPS PDF URL");
    const maxPages = rest[1] === undefined ? 50 : Number(rest[1]);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw new Error("pdf maxPages must be an integer from 1 to 100");
    }
    return {
      type: "call",
      tool: TOOL_NAMES.pdf,
      args: { url: rest[0], maxPages },
    };
  }
  if (command === "call") {
    if (!rest[0]) throw new Error("call requires a remote tool name");
    return {
      type: "call",
      tool: rest[0],
      args: rest[1] ? parseJson(rest[1], "tool arguments") : {},
    };
  }
  throw new Error(`Unknown command: ${command}`);
}
