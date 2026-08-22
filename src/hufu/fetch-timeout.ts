import { CommandError } from "./errors.js";

declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;

export function fetchWithTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number,
  timedOutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settle(() =>
        reject(new CommandError("OBSERVATION_UNAVAILABLE", timedOutMessage)),
      );
    }, timeoutMs);

    function settle(action: () => void): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      action();
    }

    run().then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}
