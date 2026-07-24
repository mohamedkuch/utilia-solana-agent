import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MCP_SDK_VERSION = "1.29.0";
const ORIGINAL_HONO_RANGE = "^1.19.9";
const SAFE_HONO_VERSION = "2.0.11";

async function findPackageManifest(entryUrl, expectedName) {
  let directory = path.dirname(fileURLToPath(entryUrl));
  while (true) {
    const manifestPath = path.join(directory, "package.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.name === expectedName) return { manifest, manifestPath };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not locate ${expectedName} package.json`);
    }
    directory = parent;
  }
}

const sdk = await findPackageManifest(
  import.meta.resolve("@modelcontextprotocol/sdk/client/index.js"),
  "@modelcontextprotocol/sdk",
);
const hono = await findPackageManifest(
  import.meta.resolve("@hono/node-server"),
  "@hono/node-server",
);

if (sdk.manifest.version !== MCP_SDK_VERSION) {
  throw new Error(
    `Expected MCP SDK ${MCP_SDK_VERSION}, found ${sdk.manifest.version}`,
  );
}
if (hono.manifest.version !== SAFE_HONO_VERSION) {
  throw new Error(
    `Expected @hono/node-server ${SAFE_HONO_VERSION}, found ${hono.manifest.version}`,
  );
}

const currentRange = sdk.manifest.dependencies?.["@hono/node-server"];
if (
  currentRange !== ORIGINAL_HONO_RANGE &&
  currentRange !== SAFE_HONO_VERSION
) {
  throw new Error(`Unexpected MCP SDK Hono dependency: ${currentRange}`);
}

if (currentRange !== SAFE_HONO_VERSION) {
  sdk.manifest.dependencies["@hono/node-server"] = SAFE_HONO_VERSION;
  await writeFile(
    sdk.manifestPath,
    `${JSON.stringify(sdk.manifest, null, 2)}\n`,
  );
}

console.error(
  `Prepared bundled MCP SDK ${MCP_SDK_VERSION} with @hono/node-server ${SAFE_HONO_VERSION}.`,
);
