import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { declareSelfHostedGitLabAuthority } from "../src/hufu/gitlab-authority.js";
import {
  parseGitLabInstanceExternalRef,
  parseGitLabInstanceIdentity,
  parseGitLabInstanceOrigin,
  parseGitLabInstanceSourceUrl,
} from "../src/hufu/gitlab-instance-ref.js";
import { CommandError } from "../src/hufu/errors.js";
import { type SecretProvider } from "../src/hufu/secret-provider.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

const EXAMPLE_ORIGIN = "https://gitlab.example.com";
const EXAMPLE_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
const EXAMPLE_HTTP_HOST_PORT_ORIGIN = "http://gitlab.example.com:41101";
const EXAMPLE_PROJECT = "example-group/example-project";
const EXAMPLE_CREDENTIAL = "example-host-injected-credential";

function exampleSecretProvider(): SecretProvider {
  return {
    resolve() {
      return EXAMPLE_CREDENTIAL;
    },
  };
}

describe("gitlab authority identity (#53 / T002 T009)", () => {
  it("declares self-hosted authority only with explicit identity, allowlist, and credential", () => {
    const declared = declareSelfHostedGitLabAuthority({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
      allowedInstanceOrigins: [EXAMPLE_ORIGIN],
      identitySource: "explicit",
      secretProvider: exampleSecretProvider(),
    });
    assert.equal(declared.task_authority, "gitlab");
    assert.equal(declared.instance_kind, "self_hosted");
    assert.equal(declared.instance_origin, EXAMPLE_ORIGIN);
    assert.equal(declared.project_path, EXAMPLE_PROJECT);
    assert.equal(declared.capability, "read_projection");
    assert.equal(declared.write_back_enabled, false);
    assert.equal(JSON.stringify(declared).includes(EXAMPLE_CREDENTIAL), false);
  });

  it("parses gitlab-instance refs for the example host and project", () => {
    const parsed = parseGitLabInstanceExternalRef(
      "gitlab-instance:gitlab.example.com/example-group/example-project#456",
    );
    assert.equal(
      parsed.external_ref,
      "gitlab-instance:gitlab.example.com/example-group/example-project#456",
    );
    assert.equal(parsed.instance_host, "gitlab.example.com");
    assert.equal(parsed.repository, EXAMPLE_PROJECT);
    assert.equal(parsed.issue, 456);
  });

  it("preserves http IPv4:port and hostname:port origins as the canonical identity", () => {
    assert.equal(
      parseGitLabInstanceOrigin(EXAMPLE_HTTP_IPV4_ORIGIN),
      EXAMPLE_HTTP_IPV4_ORIGIN,
    );
    assert.equal(
      parseGitLabInstanceOrigin(EXAMPLE_HTTP_HOST_PORT_ORIGIN),
      EXAMPLE_HTTP_HOST_PORT_ORIGIN,
    );
    assert.equal(parseGitLabInstanceOrigin(EXAMPLE_ORIGIN), EXAMPLE_ORIGIN);
    const ipv4 = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    assert.equal(ipv4.instance_origin, EXAMPLE_HTTP_IPV4_ORIGIN);
    assert.equal(ipv4.instance_host, "192.0.2.10");
    assert.equal(ipv4.project_path, EXAMPLE_PROJECT);
    const sourced = parseGitLabInstanceSourceUrl(
      `${EXAMPLE_HTTP_IPV4_ORIGIN}/${EXAMPLE_PROJECT}`,
    );
    assert.equal(sourced.instance_origin, EXAMPLE_HTTP_IPV4_ORIGIN);
    assert.equal(sourced.project_path, EXAMPLE_PROJECT);
  });

  it("declares task_authority=gitlab for an allowlisted HTTP IPv4:port origin", () => {
    const declared = declareSelfHostedGitLabAuthority({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
      allowedInstanceOrigins: [EXAMPLE_HTTP_IPV4_ORIGIN],
      identitySource: "explicit",
      secretProvider: exampleSecretProvider(),
    });
    assert.equal(declared.task_authority, "gitlab");
    assert.equal(declared.instance_origin, EXAMPLE_HTTP_IPV4_ORIGIN);
    assert.equal(declared.project_path, EXAMPLE_PROJECT);
    assert.equal(declared.capability, "read_projection");
    assert.equal(declared.write_back_enabled, false);
    assert.equal(JSON.stringify(declared).includes(EXAMPLE_CREDENTIAL), false);
  });

  it("compares the commander allowlist by exact scheme, host, and port", () => {
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_HTTP_HOST_PORT_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
          allowedInstanceOrigins: ["https://gitlab.example.com:41101"],
          identitySource: "explicit",
          secretProvider: exampleSecretProvider(),
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
          allowedInstanceOrigins: ["http://192.0.2.10"],
          identitySource: "explicit",
          secretProvider: exampleSecretProvider(),
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("fails closed when gitlab.com impersonates self-hosted", () => {
    assert.throws(
      () =>
        parseGitLabInstanceIdentity({
          instanceKind: "self_hosted",
          instanceOrigin: "https://gitlab.com",
          projectPath: EXAMPLE_PROJECT,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: "https://gitlab.com",
          projectPath: EXAMPLE_PROJECT,
          allowedInstanceOrigins: ["https://gitlab.com"],
          identitySource: "explicit",
          secretProvider: exampleSecretProvider(),
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    for (const origin of [
      "http://gitlab.com",
      "http://www.gitlab.com",
      "https://www.gitlab.com",
    ]) {
      assert.throws(
        () =>
          parseGitLabInstanceIdentity({
            instanceKind: "self_hosted",
            instanceOrigin: origin,
            projectPath: EXAMPLE_PROJECT,
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
        origin,
      );
    }
  });

  it("fails closed when the origin embeds credentials, a project path, or IPv6", () => {
    assert.throws(
      () => parseGitLabInstanceOrigin("http://user:pass@192.0.2.10:41101"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    assert.throws(
      () =>
        parseGitLabInstanceOrigin(
          "http://192.0.2.10:41101/example-group/example-project",
        ),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseGitLabInstanceOrigin("http://[2001:db8::1]:41101"),
      (error: unknown) =>
        error instanceof CommandError &&
        (error.code === "REPOSITORY_NOT_ALLOWED" ||
          error.code === "CONTRACT_INVALID"),
    );
  });

  it("fails closed when the allowlist, credential, or identity source is missing or inferred", () => {
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
          identitySource: "explicit",
          secretProvider: exampleSecretProvider(),
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
          allowedInstanceOrigins: ["https://gitlab.example.net"],
          identitySource: "explicit",
          secretProvider: exampleSecretProvider(),
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    assert.throws(
      () =>
        declareSelfHostedGitLabAuthority({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
          allowedInstanceOrigins: [EXAMPLE_ORIGIN],
          identitySource: "explicit",
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
    for (const identitySource of ["git_remote", "issue_body", "model"] as const) {
      assert.throws(
        () =>
          declareSelfHostedGitLabAuthority({
            instanceKind: "self_hosted",
            instanceOrigin: EXAMPLE_ORIGIN,
            projectPath: EXAMPLE_PROJECT,
            allowedInstanceOrigins: [EXAMPLE_ORIGIN],
            identitySource,
            secretProvider: exampleSecretProvider(),
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "CONTRACT_INVALID",
      );
    }
  });

  it("does not network or enable write-back after a successful declaration", () => {
    const declared = declareSelfHostedGitLabAuthority({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
      allowedInstanceOrigins: [EXAMPLE_ORIGIN],
      identitySource: "explicit",
      secretProvider: exampleSecretProvider(),
    });
    assert.equal(declared.write_back_enabled, false);
    assert.equal(declared.capability, "read_projection");
    assert.doesNotMatch(JSON.stringify(declared), /https?:\/\/gitlab\.com\/api/);
  });

  it("lets connect declare task_authority=gitlab for an explicit allowlisted instance", () => {
    const dir = mkdtempSync(join(tmpdir(), "hufu-gl-id-cli-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          mainJs,
          "connect",
          "--project-id",
          "demo",
          "--repository",
          EXAMPLE_PROJECT,
          "--task-authority",
          "gitlab",
          "--commander",
          "human:alice",
          "--grant-scope",
          "read-only projection and handoff",
          "--instance-kind",
          "self_hosted",
          "--instance-origin",
          EXAMPLE_ORIGIN,
          "--allowed-instance-origin",
          EXAMPLE_ORIGIN,
        ],
        {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            HUFU_DENY_NETWORK: "1",
            HUFU_GITLAB_INSTANCE_TOKEN: EXAMPLE_CREDENTIAL,
          },
        },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout) as {
        result?: Record<string, unknown>;
      };
      assert.equal(payload.result?.["task_authority"], "gitlab");
      assert.equal(payload.result?.["instance_kind"], "self_hosted");
      assert.equal(payload.result?.["write_back_enabled"], false);
      assert.equal(result.stdout.includes(EXAMPLE_CREDENTIAL), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets connect declare task_authority=gitlab for the example HTTP IPv4:port origin", () => {
    const dir = mkdtempSync(join(tmpdir(), "hufu-gl-id-http-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          mainJs,
          "connect",
          "--project-id",
          "demo",
          "--repository",
          EXAMPLE_PROJECT,
          "--task-authority",
          "gitlab",
          "--commander",
          "human:alice",
          "--grant-scope",
          "read-only projection and handoff",
          "--instance-kind",
          "self_hosted",
          "--instance-origin",
          EXAMPLE_HTTP_IPV4_ORIGIN,
          "--allowed-instance-origin",
          EXAMPLE_HTTP_IPV4_ORIGIN,
        ],
        {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            HUFU_DENY_NETWORK: "1",
            HUFU_GITLAB_INSTANCE_TOKEN: EXAMPLE_CREDENTIAL,
          },
        },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout) as {
        result?: Record<string, unknown>;
      };
      assert.equal(payload.result?.["task_authority"], "gitlab");
      assert.equal(payload.result?.["instance_kind"], "self_hosted");
      assert.equal(payload.result?.["instance_origin"], EXAMPLE_HTTP_IPV4_ORIGIN);
      assert.equal(payload.result?.["write_back_enabled"], false);
      assert.equal(result.stdout.includes(EXAMPLE_CREDENTIAL), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
