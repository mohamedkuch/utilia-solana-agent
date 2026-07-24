import assert from "node:assert/strict";
import { mock, test } from "node:test";
import bs58 from "bs58";

let fileContents = "[]";
let signerInput;
let signerFailure;

mock.module("node:fs/promises", {
  namedExports: {
    readFile: async (filename, encoding) => {
      assert.equal(encoding, "utf8");
      assert.equal(typeof filename, "string");
      return fileContents;
    },
  },
});
mock.module("@solana/kit", {
  namedExports: {
    createKeyPairSignerFromBytes: async (bytes) => {
      signerInput = bytes;
      if (signerFailure) throw signerFailure;
      return { address: "wallet" };
    },
  },
});

const { hasWalletConfiguration, loadWalletSigner } =
  await import("../src/wallet.js");

test("detects wallet configuration", () => {
  assert.equal(hasWalletConfiguration({}), false);
  assert.equal(
    hasWalletConfiguration({ SOLANA_KEYPAIR_PATH: "/tmp/key.json" }),
    true,
  );
  assert.equal(hasWalletConfiguration({ SOLANA_PRIVATE_KEY: "secret" }), true);
});

test("loads and zeroes a JSON keypair through absolute and home paths", async () => {
  fileContents = JSON.stringify(
    Array.from({ length: 64 }, (_, index) => index),
  );
  assert.deepEqual(
    await loadWalletSigner({ SOLANA_KEYPAIR_PATH: "/tmp/keypair.json" }),
    { address: "wallet" },
  );
  assert.deepEqual([...signerInput], Array(64).fill(0));

  await loadWalletSigner({ SOLANA_KEYPAIR_PATH: "~/keypair.json" });
  await loadWalletSigner({ SOLANA_KEYPAIR_PATH: "~" });
});

test("rejects malformed JSON keypair files", async () => {
  fileContents = "not json";
  await assert.rejects(
    () => loadWalletSigner({ SOLANA_KEYPAIR_PATH: "relative.json" }),
    /JSON byte array/,
  );
  fileContents = JSON.stringify([1, 2]);
  await assert.rejects(
    () => loadWalletSigner({ SOLANA_KEYPAIR_PATH: "/tmp/keypair.json" }),
    /exactly 64 bytes/,
  );
  fileContents = JSON.stringify(Array(64).fill(256));
  await assert.rejects(
    () => loadWalletSigner({ SOLANA_KEYPAIR_PATH: "/tmp/keypair.json" }),
    /invalid byte/,
  );
});

test("loads, validates, and zeroes base58 private keys", async () => {
  const encoded = bs58.encode(
    Uint8Array.from({ length: 64 }, (_, index) => index),
  );
  await loadWalletSigner({ SOLANA_PRIVATE_KEY: encoded });
  assert.deepEqual([...signerInput], Array(64).fill(0));

  await assert.rejects(
    () => loadWalletSigner({ SOLANA_PRIVATE_KEY: "not!base58" }),
    /valid base58/,
  );
  await assert.rejects(
    () =>
      loadWalletSigner({ SOLANA_PRIVATE_KEY: bs58.encode(new Uint8Array(63)) }),
    /exactly 64 bytes/,
  );
});

test("requires a wallet and zeroes secrets when signer creation fails", async () => {
  await assert.rejects(() => loadWalletSigner({}), /Set SOLANA_KEYPAIR_PATH/);
  const encoded = bs58.encode(new Uint8Array(64).fill(7));
  signerFailure = new Error("signer failed");
  await assert.rejects(
    () => loadWalletSigner({ SOLANA_PRIVATE_KEY: encoded }),
    /signer failed/,
  );
  assert.deepEqual([...signerInput], Array(64).fill(0));
  signerFailure = undefined;
});
