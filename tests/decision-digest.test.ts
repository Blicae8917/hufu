import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  componentDigest,
  packetContentDigest,
} from "../src/hufu/decision-digest.js";

const semantic = {
  acceptance_metric: "done",
  authoritative_state: {
    freshness: "not_applicable",
    observed_at: "2026-08-16T00:00:00.000Z",
    task_ref: "wi-1",
  },
  authority_scope_ref: { grant_id: "g1", revision: 1 },
  business_outcome: "ship",
  decision_id: "d1",
  evidence_as_of: "2026-08-16T00:00:00.000Z",
  non_goals: [],
  recheck_when: { type: "implementation_activity" },
  simplest_safe_route: "go",
  true_stoplines: [],
  unknowns: [],
  verified_facts: [],
  version: 1,
};

describe("decision content digest", () => {
  it("gives the same digest for equivalent objects with different key order", () => {
    const left = packetContentDigest(semantic);
    const right = packetContentDigest({
      version: 1,
      decision_id: "d1",
      business_outcome: "ship",
      authoritative_state: semantic.authoritative_state,
      acceptance_metric: "done",
      simplest_safe_route: "go",
      verified_facts: [],
      unknowns: [],
      non_goals: [],
      true_stoplines: [],
      authority_scope_ref: { revision: 1, grant_id: "g1" },
      evidence_as_of: "2026-08-16T00:00:00.000Z",
      recheck_when: { type: "implementation_activity" },
    });
    assert.equal(left, right);
    assert.match(left, /^sha256:[0-9a-f]{64}$/);
  });

  it("computes stable component digests", () => {
    assert.equal(
      componentDigest("ship"),
      componentDigest("ship"),
    );
    assert.equal(
      componentDigest(semantic.authoritative_state),
      componentDigest({
        observed_at: "2026-08-16T00:00:00.000Z",
        task_ref: "wi-1",
        freshness: "not_applicable",
      }),
    );
  });

  it("does not include content_digest in the hashed fields", () => {
    const withDigest = packetContentDigest({
      ...semantic,
      content_digest: "sha256:deadbeef",
    });
    assert.equal(withDigest, packetContentDigest(semantic));
  });
});
