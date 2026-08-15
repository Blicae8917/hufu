import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContractError, validateTask } from "../src/hufu/contracts.js";

describe("validateTask", () => {
  it("accepts a minimal native envelope", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "task-42",
      project: {
        id: "demo-project",
        repository: "https://example.com/demo/project.git",
      },
      source: "native",
      objective: "Validate the first public task contract.",
      authorization_scope: ["read repository", "write local report"],
      terminal_conditions: ["contract tests pass", "human review remains open"],
    };

    const task = validateTask(payload);

    assert.equal(task.task_id, "task-42");
    assert.equal(task.project.id, "demo-project");
    assert.equal(task.source, "native");
    assert.deepEqual(task.authorization_scope, [
      "read repository",
      "write local report",
    ]);
  });

  it("keeps a valid external_ref and omits external_status", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "external-7",
      project: {
        id: "demo-project",
        repository: "git@example.com:demo/project.git",
      },
      source: "external",
      objective: "Run the authorized local verification.",
      authorization_scope: ["run local tests"],
      terminal_conditions: ["verification result is recorded"],
      external_ref: "tracker:7",
    };

    const task = validateTask(payload);

    assert.equal(task.external_ref, "tracker:7");
    assert.equal(
      Object.prototype.hasOwnProperty.call(task, "external_status"),
      false,
    );
  });

  it("rejects a missing objective", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "task-42",
      project: {
        id: "demo-project",
        repository: "https://example.com/demo.git",
      },
      source: "native",
      authorization_scope: ["read repository"],
      terminal_conditions: ["report is produced"],
    };

    assert.throws(
      () => validateTask(payload),
      (error: unknown) =>
        error instanceof ContractError && /objective/.test(error.message),
    );
  });

  it("rejects an unknown source", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "task-42",
      project: {
        id: "demo-project",
        repository: "https://example.com/demo.git",
      },
      source: "shadow-control-plane",
      objective: "Do something.",
      authorization_scope: ["read repository"],
      terminal_conditions: ["report is produced"],
    };

    assert.throws(
      () => validateTask(payload),
      (error: unknown) =>
        error instanceof ContractError && /source/.test(error.message),
    );
  });

  it("rejects an empty authorization_scope", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "task-42",
      project: {
        id: "demo-project",
        repository: "https://example.com/demo.git",
      },
      source: "native",
      objective: "Do something.",
      authorization_scope: [],
      terminal_conditions: ["report is produced"],
    };

    assert.throws(
      () => validateTask(payload),
      (error: unknown) =>
        error instanceof ContractError &&
        /authorization_scope/.test(error.message),
    );
  });
});
