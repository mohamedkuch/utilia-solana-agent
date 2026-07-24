import type { ZodType } from "zod";

export type UtiliaEnvironment = Record<string, string | undefined>;

export type UtiliaPaymentRequirement = {
  network: string;
  asset: string;
  payTo: string;
  amount: string;
};

export type UtiliaToolResult = {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  paymentMade?: boolean;
  paymentResponse?: { transaction?: string; [key: string]: unknown };
  [key: string]: unknown;
};

export type SolanaAgentKitLike = {
  wallet: {
    publicKey: { toBase58(): string };
    signMessage(message: Uint8Array): Promise<Uint8Array>;
  };
};

export type UtiliaAgentAction = {
  name: string;
  similes: string[];
  description: string;
  examples: Array<
    Array<{
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      explanation: string;
    }>
  >;
  schema: ZodType;
  handler(
    agent: SolanaAgentKitLike,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
};

export type UtiliaPlugin = {
  name: "utilia";
  methods: {
    utiliaPriorityFees(
      agent: SolanaAgentKitLike,
      input?: { accounts?: string[] },
    ): Promise<Record<string, unknown>>;
    utiliaSimulateTransaction(
      agent: SolanaAgentKitLike,
      input: {
        transaction: string;
        encoding?: "base64" | "base58";
        accountAddresses?: string[];
      },
    ): Promise<Record<string, unknown>>;
    utiliaAnalyzeTransaction(
      agent: SolanaAgentKitLike,
      input: { signature: string },
    ): Promise<Record<string, unknown>>;
    utiliaAnalyzeToken(
      agent: SolanaAgentKitLike,
      input: { mint: string },
    ): Promise<Record<string, unknown>>;
  };
  actions: UtiliaAgentAction[];
  initialize(agent: SolanaAgentKitLike): void;
};

export const MAX_ATOMIC_USDC: number;
export const SOLANA_MAINNET: string;
export const SOLANA_USDC: string;
export const UTILIA_MCP_URL: string;
export const UTILIA_PAY_TO: string;

export function isAllowedPayment(paymentRequired: {
  accepts?: UtiliaPaymentRequirement[];
}): boolean;

export function hasWalletConfiguration(env?: UtiliaEnvironment): boolean;
export function loadWalletSigner(env?: UtiliaEnvironment): Promise<unknown>;

export function connectUtilia(options?: {
  env?: UtiliaEnvironment;
  endpoint?: string;
  signer?: unknown;
  name?: string;
  source?: string;
}): Promise<{
  callTool(tool: string, args: Record<string, unknown>): Promise<UtiliaToolResult>;
  close(): Promise<void>;
}>;

export function callUtiliaTool(
  tool: string,
  args: Record<string, unknown>,
  options?: {
    env?: UtiliaEnvironment;
    endpoint?: string;
    signer?: unknown;
    name?: string;
    source?: string;
  },
): Promise<UtiliaToolResult>;

export function runMcpBridge(options?: Record<string, unknown>): Promise<void>;

export function createSolanaAgentKitSigner(agent: SolanaAgentKitLike): {
  address: string;
  signTransactions(
    transactions: ReadonlyArray<{ messageBytes: Uint8Array }>,
  ): Promise<ReadonlyArray<Record<string, Uint8Array>>>;
};

export function createUtiliaPlugin(options?: {
  clientOptions?: {
    env?: UtiliaEnvironment;
    endpoint?: string;
  };
  callTool?: typeof callUtiliaTool;
}): UtiliaPlugin;
