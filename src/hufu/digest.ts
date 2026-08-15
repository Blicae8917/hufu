import { createHash } from "node:crypto";

import { CommandError, isJsonObject } from "./errors.js";

export const DIGEST_SPEC_VERSION = "1" as const;

export function canonicalize(value: unknown): string {
  return canonicalizeValue(value);
}

export function digestPayload(payload: unknown): string {
  const canonical = canonicalize(payload);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

function canonicalizeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  if (typeof value === "string") {
    assertNoLoneSurrogates(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "digest v1 rejects non-integers and unsafe integers",
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item === undefined) {
        throw new CommandError(
          "CONTRACT_INVALID",
          "digest v1 rejects sparse arrays",
        );
      }
      items.push(canonicalizeValue(item));
    }
    return `[${items.join(",")}]`;
  }
  if (isJsonObject(value)) {
    const keys = Object.keys(value).sort();
    const properties: string[] = [];
    for (const key of keys) {
      assertNoLoneSurrogates(key);
      const property = value[key];
      if (property === undefined) {
        throw new CommandError(
          "CONTRACT_INVALID",
          "digest v1 rejects undefined properties",
        );
      }
      properties.push(`${JSON.stringify(key)}:${canonicalizeValue(property)}`);
    }
    return `{${properties.join(",")}}`;
  }
  throw new CommandError(
    "CONTRACT_INVALID",
    "digest v1 rejects unsupported JSON types",
  );
}

function assertNoLoneSurrogates(text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new CommandError(
          "CONTRACT_INVALID",
          "digest v1 rejects lone surrogates",
        );
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "digest v1 rejects lone surrogates",
      );
    }
  }
}
