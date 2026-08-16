import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandError } from "../src/hufu/errors.js";
import {
  canonicalGitLabExternalRef,
  parseGitLabExternalRef,
  parseGitLabProject,
} from "../src/hufu/gitlab-ref.js";

describe("gitlab refs", () => {
  it("parses example-group/example-project from path and gitlab.com HTTPS/SSH forms", () => {
    assert.equal(
      parseGitLabProject("example-group/example-project"),
      "example-group/example-project",
    );
    assert.equal(
      parseGitLabProject("https://gitlab.com/example-group/example-project"),
      "example-group/example-project",
    );
    assert.equal(
      parseGitLabProject("https://gitlab.com/example-group/example-project.git"),
      "example-group/example-project",
    );
    assert.equal(
      parseGitLabProject("git@gitlab.com:example-group/example-project.git"),
      "example-group/example-project",
    );
  });

  it("rejects nested groups, GitHub identities, and private hosts", () => {
    assert.throws(
      () => parseGitLabProject("group/sub/project"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseGitLabProject("https://github.com/Blicae8917/hufu"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseGitLabProject("github:Blicae8917/hufu#4"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseGitLabProject("https://gitlab.example.com/example-group/example-project"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
  });

  it("accepts gitlab:example-group/example-project#456 and rejects invalid refs", () => {
    assert.equal(
      parseGitLabExternalRef("gitlab:example-group/example-project#456").external_ref,
      canonicalGitLabExternalRef("example-group/example-project", 456),
    );
    assert.throws(
      () => parseGitLabExternalRef("gitlab:example-group/example-project#012"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
    assert.throws(
      () => parseGitLabExternalRef("gitlab:example-group/example-project#"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
    assert.throws(
      () => parseGitLabExternalRef("github:Blicae8917/hufu#4"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
  });
});
