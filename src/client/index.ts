/**
 * Shadow Mind client plugin (browser half).
 *
 * Mounts the `shadowMind` Remote namespace, starts the shared snapshot
 * poller, registers the two ambient status surfaces (the composer tool row
 * chip `conversation.input.left` and the under-composer status band
 * `conversation.composer.dock`), and contributes the plugin's settings card
 * to the configurable-plugins tab (`settings.plugin.item`, keyed by the
 * `shadow-mind` namespace).
 */
import type { ClientContext, SettingsScope } from "@deepseek-ai/dsh-client-runtime/client";
// Side-effect type import: pulls the conversation SlotMap contracts
// (input.left / composer.dock) into the compilation via declaration merging.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// Side-effect type import: pulls the `settings.plugin.item` SlotMap contract.
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import {
  SHADOW_MIND_CONTRIBUTION,
  shadowMindSnapshotTolerant,
} from "./protocol.js";
import { startSnapshotPolling, stopSnapshotPolling } from "./snapshot-store.js";
import { StatusChip } from "./StatusChip.js";
import { StatusBand } from "./StatusBand.js";
import {
  SHADOW_CLIENT_SETTINGS_NS,
  ShadowSettingsCardController,
  type ShadowClientSettings,
} from "./settings-card-controller.js";
import { ShadowSettingsCard } from "./SettingsCard.js";

/**
 * Required client services: the slot registry, the Typert Remote gateway,
 * and the settings scope binder.
 *
 * `remote.shadowMind` must NOT be declared here. The namespace service is
 * created by this entry's own `ctx.remote.$mount(...)` inside `apply`, and a
 * Cordis fiber stays pending until every injected service exists — declaring
 * it deadlocks the entry ("pending (waiting for service: remote.shadowMind)")
 * and fails web boot. Only namespaces mounted by the shell's static assembly
 * (see @deepseek-ai/dsh-api-remotes) are safe to inject. After the mount
 * resolves, `ctx.remote.shadowMind` resolves without an inject declaration,
 * and the poller reads it tolerantly through the strict `ctx.get`.
 *
 * `settingsScope` is provided by the shell's ui-settings row (static web-app
 * assembly), so injecting it only ever waits for shell startup.
 */
export const inject = ["slots", "remote", "settingsScope"];

/**
 * Client plugin body: mount the namespace, poll the snapshot, register UI.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // eslint-disable-next-line no-console
  console.log("[shadow-mind] client plugin loading");
  // Register slots synchronously so the UI has a seat even if remote mount or
  // polling fails later; otherwise an async setup error would leave no surface.
  const disposers: Array<() => void> = [];
  if (!ctx.slots || !ctx.remote) {
    // eslint-disable-next-line no-console
    console.error("[shadow-mind] required client services missing; slots=", !!ctx.slots, "remote=", !!ctx.remote);
    return;
  }
  try {
    disposers.push(
      ctx.slots.inject("conversation.input.left", () =>
        ctx.slots.register({ name: "conversation.input.left", id: "shadow-mind", order: 100 }, StatusChip),
      ),
    );
    disposers.push(
      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register({ name: "conversation.composer.dock", id: "shadow-mind", order: 100 }, StatusBand),
      ),
    );
    // eslint-disable-next-line no-console
    console.log("[shadow-mind] UI slots registered");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[shadow-mind] failed to register UI slots", error);
  }

  // Settings card: bind this plugin's namespace scope on this entry's fiber
  // and register the keyed entry the configurable-plugins tab dispatches.
  try {
    const binder = (ctx as unknown as { settingsScope?: { bind<T>(spec: { namespace: string }): SettingsScope<T> } }).settingsScope;
    if (binder) {
      const scope = binder.bind<ShadowClientSettings>({ namespace: SHADOW_CLIENT_SETTINGS_NS });
      const controller = new ShadowSettingsCardController(scope);
      disposers.push(
        ctx.slots.inject("settings.plugin.item", () =>
          ctx.slots.register(
            { name: "settings.plugin.item", key: SHADOW_CLIENT_SETTINGS_NS, inject: () => controller.inject() },
            ShadowSettingsCard,
          ),
        ),
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn("[shadow-mind] settingsScope service unavailable; settings card not registered");
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[shadow-mind] failed to register settings card", error);
  }

  // Mount the Remote namespace and start polling asynchronously. Slot
  // registration already succeeded, so a remote failure does not hide the UI.
  void (async () => {
    try {
      await ctx.remote.$mount(SHADOW_MIND_CONTRIBUTION);
      startSnapshotPolling(() => shadowMindSnapshotTolerant(ctx));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[shadow-mind] remote mount failed", error);
    }
  })();

  ctx.effect(() => () => {
    stopSnapshotPolling();
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
  });
}
