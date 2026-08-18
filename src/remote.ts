import { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";
import type { ShadowMindSnapshot } from "./types.js";
import { ShadowMindRuntime } from "./runtime.js";

/** Host-side Typert remote service exposing Shadow Mind state to the Web UI. */
export class ShadowMindRemote extends TypertRemoteService {
  private readonly runtime: ShadowMindRuntime;

  constructor(ctx: Context, runtime: ShadowMindRuntime) {
    super(ctx, "shadowMind");
    this.runtime = runtime;
  }

  /** Return a serializable runtime snapshot. */
  @Remote("snapshot")
  async snapshot(): Promise<ShadowMindSnapshot> {
    return this.runtime.snapshot();
  }
}
