declare var process: {
  argv: string[];
  execPath: string;
  env: Record<string, string | undefined>;
  pid: number;
  platform: string;
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

interface Headers {
  get(name: string): string | null;
}

interface Response {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Headers;
  json(): Promise<unknown>;
}

declare function fetch(
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
): Promise<Response>;

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
  function rejects(
    block: Promise<unknown> | (() => Promise<unknown>),
    error?:
      | RegExp
      | Function
      | ((error: unknown) => boolean),
    message?: string,
  ): Promise<void>;
  function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export {
    deepEqual,
    doesNotMatch,
    equal,
    match,
    notEqual,
    ok,
    rejects,
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

declare module "node:crypto" {
  interface Hash {
    update(data: string, encoding: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
}

declare module "node:fs" {
  export function appendFileSync(
    path: string,
    data: string,
    encoding: "utf8",
  ): void;
  export function closeSync(fd: number): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  export function readdirSync(path: string): string[];
  export function openSync(path: string, flags: string): number;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function renameSync(oldPath: string, newPath: string): void;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function realpathSync(path: string): string;
  export function statSync(path: string): { size: number; isDirectory(): boolean };
  export function truncateSync(path: string, len: number): void;
  export function unlinkSync(path: string): void;
  export function writeFileSync(
    path: string,
    data: string,
    encoding: "utf8",
  ): void;
  export function writeSync(
    fd: number,
    data: string,
    encoding?: "utf8",
  ): number;
}

declare module "node:os" {
  export function tmpdir(): string;
  export function homedir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export const win32: {
    resolve(...paths: string[]): string;
  };
}

declare module "node:test" {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(
    name: string,
    options: { skip?: boolean } | (() => void | Promise<void>),
    fn?: () => void | Promise<void>,
  ): void;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
