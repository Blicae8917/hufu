import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  assertWriteBackGrant,
  WRITE_BACK_CONSTITUTION_AMENDED,
} from "../src/hufu/gitlab-authority.js";
import { createHttpGitLabInstancePort } from "../src/hufu/gitlab-instance-http.js";
import { parseGitLabInstanceIdentity } from "../src/hufu/gitlab-instance-ref.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));
const EXAMPLE_ORIGIN = "https://gitlab.example.com";
const EXAMPLE_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
const EXAMPLE_PROJECT = "example-group/example-project";
const EXAMPLE_CREDENTIAL = "example-host-injected-credential";

const WRITE_METHODS = [
  "createIssue",
  "updateIssue",
  "closeIssue",
  "comment",
  "merge",
] as const;

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-nowrite-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("gitlab authority no-write (#53 / T003 T011 T012)", () => {
  it("keeps write_back_enabled false after a successful self-hosted connect", () => {
    withTempDir((dir) => {
      const connected = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: EXAMPLE_PROJECT,
        taskAuthority: "gitlab",
        instanceKind: "self_hosted",
        instanceOrigin: EXAMPLE_ORIGIN,
        allowedInstanceOrigins: [EXAMPLE_ORIGIN],
        identitySource: "explicit",
        secretProvider: {
          resolve() {
            return EXAMPLE_CREDENTIAL;
          },
        },
      });
      assert.equal(connected.task_authority, "gitlab");
      assert.equal(connected.write_back_enabled, false);
      assert.equal(connected.authority_capability, "read_projection");
      assert.equal(WRITE_BACK_CONSTITUTION_AMENDED, false);
    });
  });

  it("keeps instance HTTP ports free of write methods", () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    const port: GitLabPort = createHttpGitLabInstancePort({
      identity,
      secretProvider: {
        resolve() {
          return EXAMPLE_CREDENTIAL;
        },
      },
      fetch: async () => {
        throw new Error("write-method assertion must not fetch");
      },
    });
    assert.deepEqual(Object.keys(port), ["listIssueProjections"]);
    for (const method of WRITE_METHODS) {
      assert.equal(method in port, false);
    }
    const httpIdentity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    const httpPort: GitLabPort = createHttpGitLabInstancePort({
      identity: httpIdentity,
      secretProvider: {
        resolve() {
          return EXAMPLE_CREDENTIAL;
        },
      },
      fetch: async () => {
        throw new Error("write-method assertion must not fetch");
      },
    });
    assert.deepEqual(Object.keys(httpPort), ["listIssueProjections"]);
    for (const method of WRITE_METHODS) {
      assert.equal(method in httpPort, false);
    }
  });

  it("fails closed on a write-back grant while the Constitution gate is shut", () => {
    assert.equal(WRITE_BACK_CONSTITUTION_AMENDED, false);
    assert.throws(
      () =>
        assertWriteBackGrant({
          capability: "write_back",
          constitutionAmended: false,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    withTempDir((dir) => {
      assert.throws(
        () =>
          connectWorkspace(dir, {
            commander: "human:alice",
            grantScope: "write-back",
            projectId: "demo",
            repository: EXAMPLE_PROJECT,
            taskAuthority: "gitlab",
            instanceKind: "self_hosted",
            instanceOrigin: EXAMPLE_ORIGIN,
            allowedInstanceOrigins: [EXAMPLE_ORIGIN],
            identitySource: "explicit",
            writeBackEnabled: true,
            secretProvider: {
              resolve() {
                return EXAMPLE_CREDENTIAL;
              },
            },
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "CONTRACT_INVALID",
      );
    });
  });

  it("does not add serve success, consult, outbound runtime, or Goal commands", () => {
    const serve = spawnSync(process.execPath, [mainJs, "serve"], {
      encoding: "utf8",
      env: { ...process.env, HUFU_DENY_NETWORK: "1" },
    });
    assert.equal(serve.status, 2);
    assert.match(serve.stdout, /EXPANSION_GATE_CLOSED/);

    for (const command of [
      "consult",
      "goal",
      "todo",
      "scheduler",
      "heartbeat",
      "runtime",
    ]) {
      const result = spawnSync(process.execPath, [mainJs, command], {
        encoding: "utf8",
        env: { ...process.env, HUFU_DENY_NETWORK: "1" },
      });
      assert.equal(result.status, 1, command);
      assert.match(result.stderr, /unknown command/);
    }
  });
});
