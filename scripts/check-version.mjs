import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function extract(pattern, filePath, label) {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(pattern);
  if (match === null) {
    console.error(`version not found in ${label}`);
    process.exit(1);
  }
  return match[1];
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const pluginPackage = JSON.parse(
  readFileSync(join(root, "packages/hufu-dsh/package.json"), "utf8"),
);
const versions = {
  package: packageJson.version,
  plugin: pluginPackage.version,
  source: extract(
    /^export const VERSION = "([^"]+)";$/m,
    join(root, "src/hufu/version.ts"),
    "version.ts",
  ),
  versionDoc: extract(
    /Current version: `([^`]+)`/,
    join(root, "VERSION.md"),
    "VERSION.md",
  ),
};

if (new Set(Object.values(versions)).size !== 1) {
  console.error(`version mismatch: ${JSON.stringify(versions)}`);
  process.exit(1);
}

console.log(`version check passed: ${versions.package}`);
