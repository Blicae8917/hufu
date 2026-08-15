import { CommandError } from "./errors.js";
import { type CurrentView, projectCurrentView } from "./projector.js";
import { lockPresent } from "./storage.js";
import { requireReadyEvents } from "./work-item.js";

export function statusWorkspace(workspaceRoot: string): CurrentView {
  if (lockPresent(workspaceRoot)) {
    throw new CommandError(
      "LEDGER_WRITER_CONFLICT",
      "write.lock is present; another writer may be active",
    );
  }
  return projectCurrentView(requireReadyEvents(workspaceRoot));
}
