import { digestPayload } from "./digest.js";
import { CommandError } from "./errors.js";

export const PACKET_DIGEST_FIELDS = [
  "acceptance_metric",
  "authoritative_state",
  "authority_scope_ref",
  "business_outcome",
  "decision_id",
  "evidence_as_of",
  "non_goals",
  "recheck_when",
  "simplest_safe_route",
  "true_stoplines",
  "unknowns",
  "verified_facts",
  "version",
] as const;

export function packetContentDigest(
  packet: Record<string, unknown>,
): string {
  const semantic: Record<string, unknown> = {};
  for (const key of PACKET_DIGEST_FIELDS) {
    if (!(key in packet)) {
      throw new CommandError("CONTRACT_INVALID", `missing ${key} for content digest`);
    }
    semantic[key] = packet[key];
  }
  return digestPayload(semantic);
}

export function componentDigest(value: unknown): string {
  return digestPayload(value);
}

export function rebaseFingerprint(input: {
  readonly decision_id: string;
  readonly version: number;
  readonly evidence_frontier_seq: number;
}): string {
  return digestPayload({
    decision_id: input.decision_id,
    evidence_frontier_seq: input.evidence_frontier_seq,
    version: input.version,
  });
}
