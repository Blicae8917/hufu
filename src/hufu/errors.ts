export const ERROR_CODES = [
  "CONTRACT_INVALID",
  "TASK_AUTHORITY_UNSUPPORTED",
  "TASK_AUTHORITY_MISSING",
  "LEDGER_WRITER_CONFLICT",
  "LEDGER_CAUSALITY_CONFLICT",
  "LEDGER_DIGEST_CONFLICT",
  "LEDGER_CORRUPT",
  "SCHEMA_UNSUPPORTED",
  "OBSERVATION_UNAVAILABLE",
  "DATA_INSUFFICIENT",
  "GRANT_SCOPE_EXCEEDED",
  "REPOSITORY_NOT_ALLOWED",
  "EXTERNAL_REF_INVALID",
  "DECISION_CONFLICT",
  "ENVELOPE_INVALID",
  "ACK_INVALID",
  "ROLE_NOT_ACTIVE",
  "ENGINE_NOT_BOUND",
  "ENGINE_AUTHORITY_REJECTED",
  "ENGINE_CONTROL_PLANE_REJECTED",
  "RECEIPT_INVALID",
  "PILOT_INVALID",
  "EXPANSION_GATE_CLOSED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CommandError extends Error {
  readonly code: ErrorCode;
  readonly schema_version = "1" as const;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

const EXIT_CODE_2: ReadonlySet<ErrorCode> = new Set([
  "CONTRACT_INVALID",
  "TASK_AUTHORITY_UNSUPPORTED",
  "SCHEMA_UNSUPPORTED",
  "GRANT_SCOPE_EXCEEDED",
  "REPOSITORY_NOT_ALLOWED",
  "EXTERNAL_REF_INVALID",
  "ENVELOPE_INVALID",
  "ACK_INVALID",
  "ROLE_NOT_ACTIVE",
  "ENGINE_AUTHORITY_REJECTED",
  "ENGINE_CONTROL_PLANE_REJECTED",
  "RECEIPT_INVALID",
  "PILOT_INVALID",
  "EXPANSION_GATE_CLOSED",
]);

const EXIT_CODE_3: ReadonlySet<ErrorCode> = new Set([
  "LEDGER_WRITER_CONFLICT",
  "LEDGER_CAUSALITY_CONFLICT",
  "LEDGER_DIGEST_CONFLICT",
  "LEDGER_CORRUPT",
  "DECISION_CONFLICT",
]);

export function exitCodeFor(code: ErrorCode): 2 | 3 | 4 {
  if (EXIT_CODE_2.has(code)) {
    return 2;
  }
  if (EXIT_CODE_3.has(code)) {
    return 3;
  }
  return 4;
}

export function commandErrorBody(error: CommandError): {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    schema_version: "1";
  };
} {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      schema_version: "1",
    },
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
