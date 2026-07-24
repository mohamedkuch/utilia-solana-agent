export const UTILIA_MCP_URL = "https://api.utilia.ink/mcp";
export const UTILIA_PAY_TO = "AX1TzKChcrgjVW2JMtcYFLgxerfH1XfW7etuSdMSUKh5";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const MAX_ATOMIC_USDC = 10_000;

export function isAllowedPayment(paymentRequired) {
  return paymentRequired?.accepts?.some((requirement) => {
    const amount = Number(requirement.amount);
    return (
      requirement.network === SOLANA_MAINNET &&
      requirement.asset === SOLANA_USDC &&
      requirement.payTo === UTILIA_PAY_TO &&
      Number.isSafeInteger(amount) &&
      amount > 0 &&
      amount <= MAX_ATOMIC_USDC
    );
  });
}
