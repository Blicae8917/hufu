export const GITLAB_INSTANCE_CREDENTIAL_NAME = "gitlab_instance_read";

export interface SecretProvider {
  resolve(name: string): string | undefined;
}

const INSTANCE_TOKEN_ENV = "HUFU_GITLAB_INSTANCE_TOKEN";

export function createEnvSecretProvider(
  env: Record<string, string | undefined> = process.env,
): SecretProvider {
  return {
    resolve(name: string): string | undefined {
      if (name !== GITLAB_INSTANCE_CREDENTIAL_NAME) {
        return undefined;
      }
      const value = env[INSTANCE_TOKEN_ENV];
      if (value === undefined || value.trim() === "") {
        return undefined;
      }
      return value;
    },
  };
}

export function isCredentialAvailable(
  provider: SecretProvider | undefined,
  name: string = GITLAB_INSTANCE_CREDENTIAL_NAME,
): boolean {
  if (provider === undefined) {
    return false;
  }
  const value = provider.resolve(name);
  return value !== undefined && value.trim() !== "";
}
