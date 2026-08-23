const BEARER_RE = /Bearer\s+\S+/gi;
const PRIVATE_TOKEN_RE = /PRIVATE-TOKEN\s*[:=]\s*\S+/gi;
const ENV_TOKEN_RE = /HUFU_GITLAB_INSTANCE_TOKEN\s*=\s*\S+/g;
const GLPAT_RE = /glpat-[A-Za-z0-9_-]+/g;

export function redactSecrets(
  text: string,
  extraSecrets: readonly string[] = [],
): string {
  let out = text;
  for (const secret of extraSecrets) {
    if (secret !== "") {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  out = out.replace(BEARER_RE, "[REDACTED]");
  out = out.replace(PRIVATE_TOKEN_RE, "[REDACTED]");
  out = out.replace(ENV_TOKEN_RE, "[REDACTED]");
  out = out.replace(GLPAT_RE, "[REDACTED]");
  return out;
}

export function redactUnknown(value: unknown, extraSecrets: readonly string[] = []): string {
  return redactSecrets(
    value instanceof Error ? value.message : String(value),
    extraSecrets,
  );
}
