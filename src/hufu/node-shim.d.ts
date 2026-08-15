declare var process: {
  argv: string[];
  execPath: string;
  env: Record<string, string | undefined>;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  cwd(): string;
  exit(code?: number): never;
};

declare var console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare var URL: {
  new (url: string | URL, base?: string | URL): URL;
};

interface URL {
  readonly href: string;
}

interface ImportMeta {
  readonly url: string;
}

declare module "node:assert/strict" {
  function equal(actual: unknown, expected: unknown, message?: string): void;
  function notEqual(actual: unknown, expected: unknown, message?: string): void;
  function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  function ok(value: unknown, message?: string): void;
  function match(value: string, regexp: RegExp, message?: string): void;
  function throws(
    fn: () => unknown,
    error?:
      | RegExp
      | Function
      | ((error: unknown) => boolean),
    message?: string,
  ): void;
  function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export {
    deepEqual,
    doesNotMatch,
    equal,
    match,
    notEqual,
    ok,
    throws,
  };
}

declare module "node:child_process" {
  interface SpawnSyncResult {
    status: number | null;
    stdout: string;
    stderr: string;
  }

  export function spawnSync(
    command: string,
    args: readonly string[],
    options: {
      cwd?: string;
      encoding: "utf8";
      env?: Record<string, string | undefined>;
    },
  ): SpawnSyncResult;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function writeFileSync(
    path: string,
    data: string,
    encoding: "utf8",
  ): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:test" {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
