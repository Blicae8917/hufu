import { Context, Service } from "@deepseek-ai/cordis";

import { executeTool, listToolNames, type ToolResult } from "./tools.js";

export const name = "hufu";

export class HufuService extends Service {
  constructor(ctx: Context) {
    super(ctx, "hufu");
  }

  listTools(): readonly string[] {
    return listToolNames();
  }

  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    return executeTool(toolName, args);
  }
}

export function apply(ctx: Context): void {
  const service = new HufuService(ctx);
  const hostTools = ctx.get("tools") as
    | { register?: (tool: Record<string, unknown>) => unknown }
    | undefined;
  if (typeof hostTools?.register === "function") {
    for (const toolName of listToolNames()) {
      hostTools.register({
        name: toolName,
        execute: (toolArgs: Record<string, unknown>) =>
          service.invoke(toolName, toolArgs),
      });
    }
  }
}
