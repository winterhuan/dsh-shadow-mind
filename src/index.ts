import type { Context } from "@deepseek-ai/cordis";
import { ShadowMindRuntime } from "./runtime.js";
import { ShadowMindRemote } from "./remote.js";
import { resolveShadowMindRoot } from "./paths.js";

export * from "./runtime.js";
export * from "./remote.js";
export * from "./types.js";
export * from "./paths.js";

export default function apply(ctx: Context): () => void {
  const agentDir = resolveShadowMindRoot();
  const runtime = new ShadowMindRuntime(ctx, { agentDir });
  void runtime.start();
  // Register the host Typert remote so the Web UI can query live state.
  new ShadowMindRemote(ctx, runtime);
  return () => runtime.stop();
}