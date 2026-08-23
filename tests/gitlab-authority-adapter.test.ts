import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandError } from "../src/hufu/errors.js";
import { createHttpGitLabPort } from "../src/hufu/gitlab-http.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import {
  parseGitLabExternalRef,
  parseGitLabProject,
} from "../src/hufu/gitlab-ref.js";

const EXAMPLE_SELF_HOSTED_URL =
  "https://gitlab.example.com/example-group/example-project";
const EXAMPLE_INSTANCE_REF =
  "gitlab-instance:gitlab.example.com/example-group/example-project#456";

const WRITE_METHODS = [
  "createIssue",
  "updateIssue",
  "closeIssue",
  "comment",
  "merge",
  "create",
  "update",
  "close",
] as const;

function assertReadOnlyPort(port: GitLabPort): void {
  assert.deepEqual(Object.keys(port), ["listIssueProjections"]);
  for (const method of WRITE_METHODS) {
    assert.equal(method in port, false, `${method} must not exist on GitLabPort`);
  }
}

describe("gitlab authority adapter (#53 / T001 T007)", () => {
  it("keeps 007 parsers failing closed on example self-hosted sources", () => {
    assert.throws(
      () => parseGitLabProject(EXAMPLE_SELF_HOSTED_URL),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseGitLabExternalRef(EXAMPLE_INSTANCE_REF),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
  });

  it("keeps the 007 HTTP port read-only with no write methods", () => {
    const port = createHttpGitLabPort({
      fetch: async () => {
        throw new Error("007 list contract must not be invoked in this assertion");
      },
    });
    assertReadOnlyPort(port);
  });
});
