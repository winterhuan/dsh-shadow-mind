import type { Context } from "@deepseek-ai/cordis";
import { ShadowMindRuntime } from "./runtime.js";

export * from "./runtime.js";
export * from "./types.js";

export default function apply(ctx: Context): () => void {
  const agentDir = process.env.HOME ?? ".";
  const runtime = new ShadowMindRuntime(ctx, { agentDir });
  void runtime.start();
  return () => runtime.stop();
}
