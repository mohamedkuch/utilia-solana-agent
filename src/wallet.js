import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function resolveUserPath(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

function parseKeypairFile(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("SOLANA_KEYPAIR_PATH must contain a JSON byte array");
  }
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error("SOLANA_KEYPAIR_PATH must contain exactly 64 bytes");
  }
  if (parsed.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error("SOLANA_KEYPAIR_PATH contains an invalid byte");
  }
  return Uint8Array.from(parsed);
}

export function hasWalletConfiguration(env = process.env) {
  return Boolean(env.SOLANA_KEYPAIR_PATH || env.SOLANA_PRIVATE_KEY);
}

export async function loadWalletSigner(env = process.env) {
  let secretBytes;
  if (env.SOLANA_KEYPAIR_PATH) {
    const filename = resolveUserPath(env.SOLANA_KEYPAIR_PATH);
    secretBytes = parseKeypairFile(await readFile(filename, "utf8"));
  } else if (env.SOLANA_PRIVATE_KEY) {
    try {
      secretBytes = bs58.decode(env.SOLANA_PRIVATE_KEY);
    } catch {
      throw new Error("SOLANA_PRIVATE_KEY must be valid base58");
    }
    if (secretBytes.length !== 64) {
      secretBytes.fill(0);
      throw new Error("SOLANA_PRIVATE_KEY must decode to exactly 64 bytes");
    }
  } else {
    throw new Error(
      "Set SOLANA_KEYPAIR_PATH to a Solana JSON keypair or SOLANA_PRIVATE_KEY to a base58 64-byte private key",
    );
  }

  try {
    return await createKeyPairSignerFromBytes(secretBytes);
  } finally {
    secretBytes.fill(0);
  }
}
