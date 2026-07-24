import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveNormalizedAudio } from "../src/audio-output.js";

test("verifies and saves normalized MP3 output without overwriting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "utilia-audio-"));
  const outputPath = path.join(directory, "normalized.mp3");
  const audio = Buffer.from("test mp3 bytes");
  const result = JSON.stringify({
    contentType: "audio/mpeg",
    encoding: "base64",
    outputBytes: audio.length,
    outputSha256: crypto.createHash("sha256").update(audio).digest("hex"),
    outputDurationSeconds: 1,
    audioBase64: audio.toString("base64"),
  });

  try {
    const metadata = await saveNormalizedAudio(result, outputPath);
    assert.equal(metadata.outputPath, outputPath);
    assert.equal("audioBase64" in metadata, false);
    assert.deepEqual(await readFile(outputPath), audio);
    await assert.rejects(() => saveNormalizedAudio(result, outputPath), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a mismatched output digest", async () => {
  await assert.rejects(
    () =>
      saveNormalizedAudio(
        JSON.stringify({
          contentType: "audio/mpeg",
          encoding: "base64",
          outputBytes: 3,
          outputSha256: "0".repeat(64),
          audioBase64: Buffer.from("abc").toString("base64"),
        }),
        "unused.mp3",
      ),
    /digest verification failed/,
  );
});
