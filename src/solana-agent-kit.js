import { z } from "zod";
import { callUtiliaTool } from "./remote.js";

function requireAgentWallet(agent) {
  const address = agent?.wallet?.publicKey?.toBase58?.();
  if (!address) {
    throw new Error("Solana Agent Kit wallet must expose publicKey.toBase58()");
  }
  if (typeof agent.wallet.signMessage !== "function") {
    throw new Error("Solana Agent Kit wallet must support signMessage()");
  }
  return { address, wallet: agent.wallet };
}

export function createSolanaAgentKitSigner(agent) {
  const { address, wallet } = requireAgentWallet(agent);
  return {
    address,
    async signTransactions(transactions) {
      return Promise.all(
        transactions.map(async (transaction) => {
          const signature = await wallet.signMessage(transaction.messageBytes);
          if (!(signature instanceof Uint8Array) || signature.length !== 64) {
            throw new Error(
              "Solana Agent Kit wallet returned an invalid Ed25519 signature",
            );
          }
          return { [address]: signature };
        }),
      );
    },
  };
}

function extractPayload(result) {
  const text = result?.content?.find((entry) => entry.type === "text")?.text;
  if (typeof text !== "string") return result?.content ?? [];
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toActionResult(result) {
  return {
    status: result?.isError ? "error" : "success",
    data: extractPayload(result),
    payment: {
      made: Boolean(result?.paymentMade),
      ...(result?.paymentResponse?.transaction
        ? { transaction: result.paymentResponse.transaction }
        : {}),
    },
  };
}

function createAction({ name, similes, description, schema, example, invoke }) {
  return {
    name,
    similes,
    description,
    examples: [[example]],
    schema,
    async handler(agent, input) {
      try {
        return await invoke(agent, input);
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createUtiliaPlugin(options = {}) {
  const callTool = options.callTool ?? callUtiliaTool;
  const invoke = async (agent, tool, args) => {
    const result = await callTool(tool, args, {
      ...options.clientOptions,
      signer: createSolanaAgentKitSigner(agent),
      name: "utilia-solana-agent-kit",
      source: "solana-agent-kit",
    });
    return toActionResult(result);
  };

  const methods = {
    utiliaPriorityFees: (agent, input = {}) =>
      invoke(agent, "solana_priority_fees", {
        accounts: input.accounts ?? [],
      }),
    utiliaSimulateTransaction: (agent, input) =>
      invoke(agent, "solana_transaction_simulate", {
        transaction: input.transaction,
        encoding: input.encoding ?? "base64",
        accountAddresses: input.accountAddresses ?? [],
      }),
    utiliaAnalyzeTransaction: (agent, input) =>
      invoke(agent, "solana_transaction_analysis", {
        signature: input.signature,
      }),
    utiliaAnalyzeToken: (agent, input) =>
      invoke(agent, "solana_token_analysis", {
        mint: input.mint,
      }),
  };

  return {
    name: "utilia",
    methods,
    actions: [
      createAction({
        name: "UTILIA_PRIORITY_FEES",
        similes: [
          "get live solana priority fees",
          "estimate solana compute unit price",
          "localize priority fees",
        ],
        description:
          "Pay $0.002 USDC to fetch current Solana priority-fee quantiles, optionally localized to writable accounts.",
        schema: z.object({
          accounts: z
            .array(z.string().min(32).max(44))
            .max(20)
            .default([])
            .describe(
              "Writable Solana accounts used to localize the fee estimate",
            ),
        }),
        example: {
          input: { accounts: [] },
          output: {
            status: "success",
            data: { low: 1, medium: 1000, high: 5000, urgent: 10000 },
            payment: { made: true },
          },
          explanation:
            "Gets a live network-wide priority-fee recommendation before building a transaction.",
        },
        invoke: methods.utiliaPriorityFees,
      }),
      createAction({
        name: "UTILIA_SIMULATE_TRANSACTION",
        similes: [
          "simulate solana transaction",
          "preflight unsigned transaction",
          "diagnose transaction before broadcast",
        ],
        description:
          "Pay $0.008 USDC to simulate a serialized Solana transaction and return logs, compute usage, errors, and failure guidance.",
        schema: z.object({
          transaction: z
            .string()
            .min(40)
            .max(200_000)
            .describe("Serialized Solana transaction"),
          encoding: z.enum(["base64", "base58"]).default("base64"),
          accountAddresses: z
            .array(z.string().min(32).max(44))
            .max(20)
            .default([])
            .describe(
              "Accounts whose post-simulation state should be returned",
            ),
        }),
        example: {
          input: {
            transaction: "<base64-serialized-transaction>",
            encoding: "base64",
            accountAddresses: [],
          },
          output: {
            status: "success",
            data: { success: true, unitsConsumed: 125000, logs: [] },
            payment: { made: true },
          },
          explanation:
            "Checks a transaction immediately before signing or broadcast.",
        },
        invoke: methods.utiliaSimulateTransaction,
      }),
      createAction({
        name: "UTILIA_ANALYZE_TRANSACTION",
        similes: [
          "diagnose failed solana transaction",
          "analyze solana signature",
          "explain solana transaction",
        ],
        description:
          "Pay $0.004 USDC to explain a confirmed Solana transaction, including balance deltas, logs, errors, and failure guidance.",
        schema: z.object({
          signature: z
            .string()
            .min(64)
            .max(100)
            .describe("Confirmed Solana signature"),
        }),
        example: {
          input: { signature: "<confirmed-solana-signature>" },
          output: {
            status: "success",
            data: { status: "failed", guidance: ["Review the program error"] },
            payment: { made: true },
          },
          explanation:
            "Explains why a submitted transaction succeeded or failed.",
        },
        invoke: methods.utiliaAnalyzeTransaction,
      }),
      createAction({
        name: "UTILIA_ANALYZE_TOKEN",
        similes: [
          "inspect solana token risk",
          "analyze spl mint",
          "check token authorities and concentration",
        ],
        description:
          "Pay $0.006 USDC to inspect an SPL mint's authorities, Token-2022 controls, holder concentration, and evidence-backed risk flags.",
        schema: z.object({
          mint: z
            .string()
            .min(32)
            .max(44)
            .describe("Solana token mint address"),
        }),
        example: {
          input: { mint: "<solana-token-mint>" },
          output: {
            status: "success",
            data: { riskLevel: "low", flags: [] },
            payment: { made: true },
          },
          explanation:
            "Screens a token mint before an autonomous agent trades it.",
        },
        invoke: methods.utiliaAnalyzeToken,
      }),
    ],
    initialize() {},
  };
}
