import { ledgerPaths, readLedger } from "hufu";

export function bindWorkspaceStorage(workspaceRoot: string) {
  return {
    kind: "hufu-jsonl-ledger" as const,
    paths: ledgerPaths(workspaceRoot),
    read() {
      return readLedger(workspaceRoot);
    },
  };
}
