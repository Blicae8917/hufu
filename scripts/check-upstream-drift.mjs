import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;
const MODES = new Set(["static", "observe", "release"]);
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
 *   mode?: string,
 *   now?: () => Date,
 *   lsRemote?: (repository: string, ref: string) => Promise<string | null>,
 *   isReachable?: (
 *     repository: string,
 *     ref: string,
 *     recorded: string,
 *     actual: string,
 *   ) => Promise<boolean | null>,
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

export function parseCliMode(argv) {
  const eq = argv.find((arg) => arg.startsWith("--mode="));
  if (eq) {
    return eq.slice("--mode=".length);
  }
  const index = argv.indexOf("--mode");
  if (index >= 0) {
    return argv[index + 1];
  }
  return undefined;
}

function resolveMode(options = {}) {
  return options.mode ?? process.env["HUFU_UPSTREAM_GATE_MODE"] ?? "static";
}

function isImmutableTag(ref) {
  return ref.startsWith("refs/tags/");
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

function defaultIsReachable(repository, ref, recorded) {
  const url = `https://github.com/${repository}`;
  const dir = mkdtempSync(join(tmpdir(), "hufu-reach-"));
  try {
    const init = spawnSync("git", ["init", "--bare", dir], {
      encoding: "utf8",
    });
    if (init.status !== 0) {
      return null;
    }
    const fetch = spawnSync(
      "git",
      ["fetch", "--filter=blob:none", "--recurse-submodules=no", url, ref],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    if (fetch.status !== 0) {
      return null;
    }
    const check = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", recorded, "FETCH_HEAD"],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
    if (check.status === 0) {
      return true;
    }
    if (check.status === 1) {
      return false;
    }
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function emptyResult(checkedAt, mode, status, exitCode, message) {
  return {
    checked_at: checkedAt,
    mode,
    exitCode,
    status,
    message,
    upstreams: [],
    ...(status === "drift" || status === "head_advanced"
      ? { incompatibility: false }
      : {}),
  };
}

function messageFor(status) {
  switch (status) {
    case "static_ok":
      return "static accepted-baseline integrity ok";
    case "match":
      return "recorded refs match live ls-remote";
    case "drift":
      return "HEAD drift observed; not an incompatibility";
    case "head_advanced":
      return "live HEAD advanced; recorded commit still reachable";
    case "tag_moved":
      return "immutable tag moved from recorded SHA";
    case "unreachable":
      return "recorded commit is unreachable from accepted ref";
    case "unavailable":
      return "upstream observation unavailable";
    case "unchecked":
      return "未核对：HUFU_DENY_NETWORK=1";
    default:
      return "contract invalid";
  }
}

/**
 * @param {"match" | "drift" | "head_advanced" | "tag_moved" | "unreachable" | "unavailable"} current
 * @param {"match" | "drift" | "head_advanced" | "tag_moved" | "unreachable" | "unavailable"} next
 */
function worseStatus(current, next) {
  const rank = {
    match: 0,
    head_advanced: 1,
    drift: 2,
    tag_moved: 3,
    unreachable: 4,
    unavailable: 5,
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0) ? next : current;
}

function exitCodeFor(mode, status) {
  if (status === "contract_invalid" || status === "unchecked") {
    return 1;
  }
  if (status === "static_ok" || status === "match") {
    return 0;
  }
  if (status === "drift" && mode === "observe") {
    return 0;
  }
  if (status === "head_advanced" && mode === "release") {
    return 0;
  }
  return 1;
}

export async function checkUpstreamDrift(options = {}) {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const mode = resolveMode(options);
  if (!MODES.has(mode)) {
    return emptyResult(
      checkedAt,
      mode,
      "contract_invalid",
      1,
      `unknown mode: ${mode}`,
    );
  }

  const denyNetwork =
    options.denyNetwork === true || process.env["HUFU_DENY_NETWORK"] === "1";

  if (denyNetwork && mode !== "static") {
    return emptyResult(checkedAt, mode, "unchecked", 1, messageFor("unchecked"));
  }

  let rows;
  try {
    rows = parseGateTable(options.markdown ?? "");
  } catch (error) {
    return emptyResult(
      checkedAt,
      mode,
      "contract_invalid",
      1,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (mode === "static") {
    return {
      checked_at: checkedAt,
      mode,
      exitCode: 0,
      status: "static_ok",
      message: messageFor("static_ok"),
      upstreams: rows.map((row) => ({
        name: row.name,
        repository: row.repository,
        ref: row.ref,
        recorded: row.recorded,
        actual: "not_queried",
        availability: "not_queried",
        distance: "data_insufficient",
        observed_at: checkedAt,
        recorded_on: row.observedDate,
      })),
    };
  }

  const lsRemote = options.lsRemote ?? defaultLsRemote;
  const isReachable = options.isReachable ?? defaultIsReachable;
  const upstreams = [];
  let status = "match";

  for (const row of rows) {
    let actual = null;
    let availability = "available";
    /** @type {"match" | "drift" | "head_advanced" | "tag_moved" | "unreachable" | "unavailable"} */
    let outcome = "match";
    try {
      actual = await lsRemote(row.repository, row.ref);
      if (actual === null || actual === undefined || actual === "") {
        actual = null;
        availability = "unavailable";
        outcome = "unavailable";
      } else {
        actual = String(actual).toLowerCase();
        if (actual !== row.recorded) {
          if (mode === "observe") {
            outcome = "drift";
          } else if (isImmutableTag(row.ref)) {
            outcome = "tag_moved";
          } else {
            let reachable;
            try {
              reachable = await isReachable(
                row.repository,
                row.ref,
                row.recorded,
                actual,
              );
            } catch {
              reachable = null;
            }
            if (reachable === true) {
              outcome = "head_advanced";
            } else if (reachable === false) {
              outcome = "unreachable";
            } else {
              availability = "unavailable";
              outcome = "unavailable";
            }
          }
        }
      }
    } catch {
      actual = null;
      availability = "unavailable";
      outcome = "unavailable";
    }

    status = worseStatus(status, outcome);
    upstreams.push({
      name: row.name,
      repository: row.repository,
      ref: row.ref,
      recorded: row.recorded,
      actual: actual === null ? "unavailable" : actual,
      availability,
      outcome,
      distance: "data_insufficient",
      observed_at: checkedAt,
      recorded_on: row.observedDate,
    });
  }

  const exitCode = exitCodeFor(mode, status);
  return {
    checked_at: checkedAt,
    mode,
    exitCode,
    status,
    message: messageFor(status),
    upstreams,
    ...(status === "drift" || status === "head_advanced"
      ? { incompatibility: false }
      : {}),
  };
}

export async function runCli(options = {}) {
  const compatibilityPath = options.compatibilityPath ?? DEFAULT_COMPAT;
  const markdown = readFileSync(compatibilityPath, "utf8");
  return checkUpstreamDrift({
    markdown,
    mode: options.mode,
    denyNetwork: options.denyNetwork,
    lsRemote: options.lsRemote,
    isReachable: options.isReachable,
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
    mode: parseCliMode(process.argv.slice(2)),
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
