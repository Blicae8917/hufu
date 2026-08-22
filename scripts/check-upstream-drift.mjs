import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;
const DEFAULT_COMPAT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "COMPATIBILITY.md",
);

/**
 * @typedef {{
 *   name: string,
 *   repository: string,
 *   ref: string,
 *   recorded: string,
 *   observedDate: string,
 * }} GateRow
 *
 * @typedef {{
 *   markdown?: string,
 *   now?: () => Date,
 *   lsRemote?: (repository: string, ref: string) => Promise<string | null>,
 *   denyNetwork?: boolean,
 * }} CheckOptions
 */

export function parseGateTable(markdown) {
  const heading = markdown.indexOf("## 门禁核对表");
  if (heading < 0) {
    throw new Error("missing 门禁核对表");
  }
  const after = markdown.slice(heading);
  const nextHeading = after.indexOf("\n## ", 1);
  const section = nextHeading < 0 ? after : after.slice(0, nextHeading);
  const lines = section.split(/\r?\n/).filter((line) => line.startsWith("|"));
  if (lines.length < 3) {
    throw new Error("门禁核对表 has no data rows");
  }
  const header = splitRow(lines[0] ?? "");
  const expected = ["上游", "仓库", "ref", "记录 SHA", "观测日期"];
  if (expected.some((name, index) => (header[index] ?? "") !== name)) {
    throw new Error("门禁核对表 header mismatch");
  }
  /** @type {GateRow[]} */
  const rows = [];
  for (const line of lines.slice(2)) {
    const cells = splitRow(line);
    if (cells.length < 5) {
      throw new Error("门禁核对表 row missing fields");
    }
    const name = cells[0] ?? "";
    const repository = cells[1] ?? "";
    const ref = cells[2] ?? "";
    const recorded = cells[3] ?? "";
    const observedDate = cells[4] ?? "";
    if (!name || !repository || !ref || !recorded || !observedDate) {
      throw new Error("门禁核对表 row missing fields");
    }
    if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(repository)) {
      throw new Error(`invalid repository ${repository}`);
    }
    if (!SHA_RE.test(recorded)) {
      throw new Error(`recorded value is not a commit: ${recorded}`);
    }
    rows.push({
      name,
      repository,
      ref,
      recorded: recorded.toLowerCase(),
      observedDate,
    });
  }
  if (rows.length === 0) {
    throw new Error("门禁核对表 has no data rows");
  }
  return rows;
}

function splitRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/^`+|`+$/g, ""));
}

function defaultLsRemote(repository, ref) {
  const url = `https://github.com/${repository}`;
  const result = spawnSync("git", ["ls-remote", url, ref], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    return null;
  }
  const first = (result.stdout ?? "").trim().split("\n")[0] ?? "";
  const sha = (first.split(/\s+/)[0] ?? "").toLowerCase();
  return SHA_RE.test(sha) ? sha : null;
}

export async function checkUpstreamDrift(options = {}) {
  const denyNetwork =
    options.denyNetwork === true || process.env["HUFU_DENY_NETWORK"] === "1";
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();

  if (denyNetwork) {
    return {
      checked_at: checkedAt,
      exitCode: 1,
      status: "unchecked",
      message: "未核对：HUFU_DENY_NETWORK=1",
      upstreams: [],
    };
  }

  let rows;
  try {
    rows = parseGateTable(options.markdown ?? "");
  } catch (error) {
    return {
      checked_at: checkedAt,
      exitCode: 1,
      status: "contract_invalid",
      message: error instanceof Error ? error.message : String(error),
      upstreams: [],
    };
  }

  const lsRemote = options.lsRemote ?? defaultLsRemote;
  const upstreams = [];
  let status = "match";

  for (const row of rows) {
    let actual = null;
    let availability = "available";
    try {
      actual = await lsRemote(row.repository, row.ref);
      if (actual === null || actual === undefined || actual === "") {
        actual = null;
        availability = "unavailable";
        status = "unavailable";
      } else {
        actual = String(actual).toLowerCase();
        if (actual !== row.recorded && status === "match") {
          status = "drift";
        }
      }
    } catch {
      actual = null;
      availability = "unavailable";
      status = "unavailable";
    }

    upstreams.push({
      name: row.name,
      repository: row.repository,
      ref: row.ref,
      recorded: row.recorded,
      actual: actual === null ? "unavailable" : actual,
      availability,
      distance: "data_insufficient",
      observed_at: checkedAt,
      recorded_on: row.observedDate,
    });
  }

  return {
    checked_at: checkedAt,
    exitCode: status === "match" ? 0 : 1,
    status,
    message:
      status === "match"
        ? "recorded refs match live ls-remote"
        : status === "drift"
          ? "recorded refs drifted from live ls-remote"
          : "upstream observation unavailable",
    upstreams,
  };
}

export async function runCli(options = {}) {
  const compatibilityPath = options.compatibilityPath ?? DEFAULT_COMPAT;
  const markdown = readFileSync(compatibilityPath, "utf8");
  return checkUpstreamDrift({
    markdown,
    denyNetwork: options.denyNetwork,
    lsRemote: options.lsRemote,
    now: options.now,
  });
}

const invoked =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invoked) {
  const result = await runCli({
    compatibilityPath: process.env["HUFU_COMPATIBILITY_PATH"] ?? DEFAULT_COMPAT,
    denyNetwork: process.env["HUFU_DENY_NETWORK"] === "1",
  });
  const rendered = JSON.stringify(result, null, 2);
  if (result.exitCode === 0) {
    console.log(rendered);
  } else {
    console.error(rendered);
    if (result.message) {
      console.error(result.message);
    }
  }
  process.exit(result.exitCode);
}
