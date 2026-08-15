export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

export const SCHEMA_VERSION = "0.1";
export const ALLOWED_SOURCES = ["external", "native"] as const;

export type TaskSource = (typeof ALLOWED_SOURCES)[number];

export interface ProjectRef {
  readonly id: string;
  readonly repository: string;
}

export interface TaskEnvelope {
  readonly schema_version: string;
  readonly task_id: string;
  readonly project: ProjectRef;
  readonly source: TaskSource;
  readonly objective: string;
  readonly authorization_scope: readonly string[];
  readonly terminal_conditions: readonly string[];
  readonly external_ref?: string;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = payload[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContractError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredTextList(
  payload: Record<string, unknown>,
  field: string,
): readonly string[] {
  const value = payload[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw new ContractError(`${field} must be a non-empty list of strings`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ContractError(`${field} must contain only non-empty strings`);
    }
    items.push(item.trim());
  }
  return items;
}

function isSource(value: string): value is TaskSource {
  return (ALLOWED_SOURCES as readonly string[]).includes(value);
}

export function validateTask(payload: unknown): TaskEnvelope {
  if (!isJsonObject(payload)) {
    throw new ContractError("task must be a JSON object");
  }

  const schema_version = requiredText(payload, "schema_version");
  if (schema_version !== SCHEMA_VERSION) {
    throw new ContractError(`schema_version must be ${SCHEMA_VERSION}`);
  }

  const source = requiredText(payload, "source");
  if (!isSource(source)) {
    throw new ContractError(
      `source must be one of: ${ALLOWED_SOURCES.join(", ")}`,
    );
  }

  const projectPayload = payload["project"];
  if (!isJsonObject(projectPayload)) {
    throw new ContractError("project must be a JSON object");
  }
  const project: ProjectRef = {
    id: requiredText(projectPayload, "id"),
    repository: requiredText(projectPayload, "repository"),
  };

  const externalRefValue = payload["external_ref"];
  if (
    externalRefValue !== undefined &&
    (typeof externalRefValue !== "string" || externalRefValue.trim() === "")
  ) {
    throw new ContractError(
      "external_ref must be a non-empty string when provided",
    );
  }

  const envelope: TaskEnvelope = {
    schema_version,
    task_id: requiredText(payload, "task_id"),
    project,
    source,
    objective: requiredText(payload, "objective"),
    authorization_scope: requiredTextList(payload, "authorization_scope"),
    terminal_conditions: requiredTextList(payload, "terminal_conditions"),
  };

  if (typeof externalRefValue === "string") {
    return { ...envelope, external_ref: externalRefValue.trim() };
  }
  return envelope;
}
