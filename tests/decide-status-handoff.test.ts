import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectOpenGrant,
  parseStdout,
  recordPacket,
  runHufu,
  withTempDir,
} from "./decision-harness.js";

describe("hufu status and handoff with a decision", () => {
  it("exposes only decision id version and digest", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const status = runHufu(["status"], dir);
      assert.equal(status.status, 0, status.stderr);
      assert.doesNotMatch(status.stdout, /business_outcome/);
      assert.doesNotMatch(status.stdout, /acceptance_metric/);
      assert.doesNotMatch(status.stdout, /simplest_safe_route/);
      const view = parseStdout(status.stdout)["result"] as Record<string, unknown>;
      const decision = view["decision"] as Record<string, unknown>;
      const value = decision["value"] as Record<string, unknown>;
      assert.equal(value["decision_id"], packet["decision_id"]);
      assert.equal(value["version"], 1);
      assert.equal(value["content_digest"], packet["content_digest"]);
      assert.equal(Object.keys(value).sort().join(","), "content_digest,decision_id,version");
    });
  });

  it("includes decision_ref on handoff", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const handoff = runHufu(
        [
          "handoff",
          "--work-item",
          "wi-1",
          "--completed",
          "decision recorded",
          "--remaining",
          "execute within grant",
        ],
        dir,
      );
      assert.equal(handoff.status, 0, handoff.stderr);
      const result = parseStdout(handoff.stdout)["result"] as Record<
        string,
        unknown
      >;
      const ref = result["decision_ref"] as Record<string, unknown>;
      assert.equal(ref["decision_id"], packet["decision_id"]);
      assert.match(String(result["next_action_text"]), /decision-demo/);
      assert.doesNotMatch(handoff.stdout, /Record one canonical decision/);
    });
  });
});
