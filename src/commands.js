export const TOOL_NAMES = {
  fees: "solana_priority_fees",
  transaction: "solana_transaction_analysis",
  simulate: "solana_transaction_simulate",
  token: "solana_token_analysis",
  pdf: "pdf_to_markdown",
};

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseDuration(value) {
  const match = /^(\d+)(s|m|h)?$/i.exec(value);
  if (!match) throw new Error("watch-fees --every must look like 60s, 12m, or 1h");
  const amount = parsePositiveInteger(match[1], "watch-fees --every");
  const multiplier = { s: 1, m: 60, h: 3_600 }[(match[2] ?? "s").toLowerCase()];
  const seconds = amount * multiplier;
  if (seconds < 60 || seconds > 86_400) {
    throw new Error("watch-fees --every must be between 60 seconds and 24 hours");
  }
  return seconds;
}

function parseWatchFees(rest) {
  const options = { everySeconds: 720, maxCalls: 25, accounts: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    if (flag === "--every") {
      options.everySeconds = parseDuration(value);
    } else if (flag === "--max-calls") {
      options.maxCalls = parsePositiveInteger(value, "watch-fees --max-calls");
      if (options.maxCalls > 500) {
        throw new Error("watch-fees --max-calls cannot exceed 500");
      }
    } else if (flag === "--accounts") {
      options.accounts = value.split(",").filter(Boolean);
      if (options.accounts.length > 20) {
        throw new Error("watch-fees --accounts cannot exceed 20 addresses");
      }
    } else {
      throw new Error(`Unknown watch-fees option: ${flag}`);
    }
    index += 1;
  }
  return { type: "watch-fees", ...options };
}

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
  if (command === "watch-fees") return parseWatchFees(rest);
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
