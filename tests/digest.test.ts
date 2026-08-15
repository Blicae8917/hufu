import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalize, digestPayload } from "../src/hufu/digest.js";

const fixturePath = fileURLToPath(
  new URL("../../tests/fixtures/digest/rfc8785-examples.json", import.meta.url),
);

interface DigestExample {
  readonly name: string;
  readonly input?: unknown;
  readonly code_points?: readonly number[];
  readonly canonical: string;
}

interface KeyOrderExample {
  readonly input: Record<string, string>;
  readonly expected_key_order: readonly string[];
}

interface DigestFixture {
  readonly examples: readonly DigestExample[];
  readonly rfc8785_3_2_3_key_order: KeyOrderExample;
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as DigestFixture;

function exampleInput(example: DigestExample): unknown {
  if (example.code_points !== undefined) {
    return String.fromCodePoint(...example.code_points);
  }
  return example.input;
}

describe("RFC 8785 bounded digest", () => {
  for (const example of fixture.examples) {
    it(`canonicalizes ${example.name}`, () => {
      const input = exampleInput(example);
      const expected =
        example.code_points === undefined
          ? example.canonical
          : JSON.stringify(input);
      assert.equal(canonicalize(input), expected);
      const hex = createHash("sha256").update(expected, "utf8").digest("hex");
      assert.equal(digestPayload(input), `sha256:${hex}`);
      assert.match(digestPayload(input), /^sha256:[0-9a-f]{64}$/);
    });
  }

  it("gives the same digest for equivalent objects with different key insertion order", () => {
    const left = { b: 1, a: 2, nested: { z: true, a: false } };
    const right = { nested: { a: false, z: true }, a: 2, b: 1 };
    assert.equal(digestPayload(left), digestPayload(right));
    assert.equal(canonicalize(left), '{"a":2,"b":1,"nested":{"a":false,"z":true}}');
  });

  it("does not treat JSON.stringify as RFC 8785", () => {
    const input = { b: 1, a: 2 };
    assert.equal(JSON.stringify(input), '{"b":1,"a":2}');
    assert.equal(canonicalize(input), '{"a":2,"b":1}');
    assert.notEqual(JSON.stringify(input), canonicalize(input));
  });

  it("sorts RFC 8785 section 3.2.3 keys by UTF-16 code units", () => {
    const sample = fixture.rfc8785_3_2_3_key_order;
    const canonical = canonicalize(sample.input);
    let previousIndex = -1;
    for (const key of sample.expected_key_order) {
      const token = `${JSON.stringify(key)}:`;
      const index = canonical.indexOf(token);
      assert.ok(index !== -1, `missing key ${JSON.stringify(key)}`);
      assert.ok(
        index > previousIndex,
        `key ${JSON.stringify(key)} is out of UTF-16 order`,
      );
      previousIndex = index;
    }
    assert.notEqual(
      JSON.stringify(sample.input),
      canonical,
      "fixture input is not pre-sorted, so stringify must differ from JCS",
    );
  });
});
