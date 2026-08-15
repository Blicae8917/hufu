import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandError } from "../src/hufu/errors.js";
import {
  canonicalExternalRef,
  parseExternalRef,
  parseThisPublicGithubRepository,
} from "../src/hufu/github-ref.js";

describe("github refs", () => {
  it("parses this public repository from HTTPS and SSH forms", () => {
    assert.equal(
      parseThisPublicGithubRepository("https://github.com/Blicae8917/hufu"),
      "Blicae8917/hufu",
    );
    assert.equal(
      parseThisPublicGithubRepository("https://github.com/blicae8917/hufu.git"),
      "Blicae8917/hufu",
    );
    assert.equal(
      parseThisPublicGithubRepository("git@github.com:Blicae8917/hufu.git"),
      "Blicae8917/hufu",
    );
    assert.equal(
      parseThisPublicGithubRepository("Blicae8917/hufu"),
      "Blicae8917/hufu",
    );
  });

  it("rejects other repositories and unparseable URLs", () => {
    assert.throws(
      () => parseThisPublicGithubRepository("https://github.com/other/repo"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
    assert.throws(
      () => parseThisPublicGithubRepository("https://example.com/demo.git"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "REPOSITORY_NOT_ALLOWED",
    );
  });

  it("accepts github:Blicae8917/hufu#4 and rejects invalid refs", () => {
    assert.equal(
      parseExternalRef("github:Blicae8917/hufu#4").external_ref,
      canonicalExternalRef(4),
    );
    assert.equal(
      parseExternalRef("github:blicae8917/hufu#4").external_ref,
      "github:Blicae8917/hufu#4",
    );
    assert.throws(
      () => parseExternalRef("github:Blicae8917/hufu#012"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
    assert.throws(
      () => parseExternalRef("github:Blicae8917/hufu#"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
    assert.throws(
      () => parseExternalRef("gitlab:group/project#1"),
      (error: unknown) =>
        error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
    );
  });
});
