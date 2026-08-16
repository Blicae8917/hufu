import { Context } from "@deepseek-ai/cordis";

import { CommandError, commandErrorBody } from "hufu";

import { apply } from "./plugin.js";
import { executeTool, listToolNames, type ToolResult } from "./tools.js";

export interface IsolatedHufuHost {
  dispose(): Promise<void>;
  get(name: string): unknown;
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  listTools(): readonly string[];
}

export async function createIsolatedHufuHost(): Promise<IsolatedHufuHost> {
  const ctx = new Context();
  const fiber = await ctx.plugin({ apply, name: "hufu" });
  return {
    async dispose() {
      await fiber.dispose();
    },
    get(name: string) {
      return ctx.get(name);
    },
    async invoke(toolName: string, args: Record<string, unknown>) {
      const service = ctx.get("hufu") as
        | { invoke(name: string, toolArgs: Record<string, unknown>): Promise<ToolResult> }
        | undefined;
      if (service === undefined) {
        return commandErrorBody(
          new CommandError("CONTRACT_INVALID", "hufu plugin is not mounted"),
        );
      }
      return service.invoke(toolName, args);
    },
    listTools() {
      if (ctx.get("hufu") === undefined) {
        return [];
      }
      return listToolNames();
    },
  };
}

export { executeTool, listToolNames };
