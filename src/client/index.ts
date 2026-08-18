/**
 * Shadow Mind client plugin (browser half).
 *
 * Mounts the `shadowMind` Remote namespace, starts the shared snapshot
 * poller, and registers the two ambient status surfaces: the composer tool
 * row chip (`conversation.input.left`) and the under-composer status band
 * (`conversation.composer.dock`). Both are read-only observers; management
 * stays on `/shadow` and the model tools.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Side-effect type import: pulls the conversation SlotMap contracts
// (input.left / composer.dock) into the compilation via declaration merging.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import {
  SHADOW_MIND_CONTRIBUTION,
  shadowMindSnapshot,
} from "./protocol.js";
import { startSnapshotPolling, stopSnapshotPolling } from "./snapshot-store.js";
import { StatusChip } from "./StatusChip.js";
import { StatusBand } from "./StatusBand.js";

/** Required client services: the slot registry and the Typert Remote gateway. */
export const inject = ["slots", "remote"];

/**
 * Client plugin body: mount the namespace, poll the snapshot, register UI.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  void (async () => {
    await ctx.remote.$mount(SHADOW_MIND_CONTRIBUTION);
    // Polling is owned by this fiber: plugin unload stops it and clears state.
    startSnapshotPolling(() => shadowMindSnapshot(ctx.remote));
    ctx.effect(() => () => stopSnapshotPolling());

    ctx.slots.inject("conversation.input.left", () =>
      ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "shadow-mind",
          order: 100,
        },
        StatusChip,
      ),
    );
    ctx.slots.inject("conversation.composer.dock", () =>
      ctx.slots.register(
        {
          name: "conversation.composer.dock",
          id: "shadow-mind",
          order: 100,
        },
        StatusBand,
      ),
    );
  })();
}
