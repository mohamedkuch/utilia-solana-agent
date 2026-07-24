import crypto from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";

function decodeBase64(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error("Utilia returned invalid base64 audio");
  }
  return Buffer.from(value, "base64");
}

export async function saveNormalizedAudio(text, outputPath) {
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Utilia returned invalid JSON");
  }
  if (result?.contentType !== "audio/mpeg" || result?.encoding !== "base64") {
    throw new Error("Utilia returned an unexpected audio format");
  }

  const bytes = decodeBase64(result.audioBase64);
  if (
    !Number.isInteger(result.outputBytes) ||
    result.outputBytes !== bytes.length
  ) {
    throw new Error("Utilia audio byte count did not match the payload");
  }
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (
    typeof result.outputSha256 !== "string" ||
    result.outputSha256 !== digest
  ) {
    throw new Error("Utilia audio digest verification failed");
  }

  const absolutePath = path.resolve(outputPath);
  await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
  const { audioBase64: _audioBase64, ...metadata } = result;
  return { outputPath: absolutePath, ...metadata };
}
