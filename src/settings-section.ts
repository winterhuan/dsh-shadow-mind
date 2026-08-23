/**
 * Host-side wiring of the `shadow-mind` user-settings namespace.
 *
 * Owns three facts:
 * 1. Registration — the namespace resolves through
 *    {@link SHADOW_CONFIG_SCHEMA} over the stored user layer; while no
 *    settings service is composed, consumers run on the schema defaults.
 * 2. Legacy import — an old `$DSH_HOME/agent/shadow-minds/config.json` is
 *    imported into the user layer exactly once, then renamed aside so a
 *    later edit cannot resurrect stale values.
 * 3. Change fan-out — committed changes reach the runtime through the same
 *    hooks, whether they arrive from the Web settings page, a management
 *    tool, or an external editor of the document.
 */
import { rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { SettingsScope } from "@deepseek-ai/dsh-settings";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import {
  DEFAULT_CONFIG,
  SHADOW_CONFIG_SCHEMA,
  legacyConfigPatch,
} from "./config.js";
import { CONFIG_FILE, SHADOW_MIND_DIR } from "./constants.js";
import type { ShadowConfig } from "./types.js";

/** User-settings namespace owned by this plugin. */
export const SHADOW_SETTINGS_NAMESPACE = settingsNamespace("shadow-mind");

/** Suffix appended to the legacy file after its one-time import. */
const MIGRATED_SUFFIX = ".migrated";

/** Consumer hooks mirroring the canonical `installSettingsSection` face. */
export interface ShadowSettingsHooks {
  /**
   * Receive the active configuration source: the resolved settings scope
   * while one is attached, the schema defaults otherwise. Called at attach,
   * at detach, and before the matching {@link onChange}.
   * @param current - thunk returning the currently authoritative value.
   */
  setSource(current: () => ShadowConfig): void;
  /** Re-judge derived state after an attach, a detach, or a committed change. */
  onChange(): void;
}

/** The scope handle the runtime needs for persisted writes. */
export type ShadowSettingsScope = SettingsScope<ShadowConfig>;

/**
 * Register the settings namespace on the caller's lifecycle and hand the
 * resolved source plus the write scope to the consumer hooks.
 *
 * Hand-rolled instead of `installSettingsSection` because the migration
 * import needs the scope's write path, which the canonical helper does not
 * expose; the wiring otherwise mirrors it (fallback source on detach,
 * change notification through `watch`).
 * @param ctx - plugin context owning the registration.
 * @param agentDir - harness agent directory holding the legacy config file.
 * @param hooks - consumer source sink and change notification.
 * @returns the attached scope once registration ran; `undefined` when no
 *   settings service is composed (hooks keep their fallback source). The
 *   promise never rejects: a failed import renames the file aside, records
 *   nothing further, and leaves defaults in force.
 */
export async function attachSettingsSection(
  ctx: Context,
  agentDir: string,
  hooks: ShadowSettingsHooks,
): Promise<ShadowSettingsScope | undefined> {
  let attached: ShadowSettingsScope | undefined;
  try {
    await ctx.inject(["settings"], async (settingsCtx) => {
      const scope = settingsCtx.settings.register(SHADOW_SETTINGS_NAMESPACE, SHADOW_CONFIG_SCHEMA);
      try {
        await importLegacyConfig(scope, join(agentDir, SHADOW_MIND_DIR, CONFIG_FILE));
      } catch {
        // The file was renamed aside; defaults stay in force and the section
        // still attaches so later edits through tools or the settings page work.
      }
      hooks.setSource(() => scope.get());
      // Detach falls back to the defaults and notifies, so a provider reload
      // degrades instead of freezing the last snapshot. During the owner's own
      // teardown the notification would touch resources being released, so it
      // is skipped — same rationale as installSettingsSection's unloading guard.
      let disposed = false;
      settingsCtx.effect(() => () => {
        disposed = true;
        hooks.setSource(() => DEFAULT_CONFIG);
        hooks.onChange();
      });
      hooks.onChange();
      scope.watch(() => {
        if (!disposed) hooks.onChange();
      });
      attached = scope;
    });
  } catch {
    return undefined; // Import failure or registration error: stay on defaults.
  }
  return attached;
}

/**
 * Import the legacy JSON config into the user layer once, then rename the
 * file aside. A missing file is the normal first-run case. Any other failure
 * still renames the file (its bytes survive inside the renamed copy) and
 * throws — the caller falls back to defaults instead of surfacing an error
 * through startup.
 * @param scope - freshly registered write scope.
 * @param configPath - absolute path of the legacy `config.json`.
 */
async function importLegacyConfig(
  scope: ShadowSettingsScope,
  configPath: string,
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    return; // ENOENT and friends: nothing to import.
  }
  try {
    const patch = legacyConfigPatch(JSON.parse(raw));
    if (Object.keys(patch).length > 0) await scope.update(patch);
  } catch (error) {
    throw new Error(
      `legacy config ${configPath} could not be imported (${error instanceof Error ? error.message : String(error)})`,
    );
  } finally {
    // Always rename: a rejected import must not retry every boot.
    await rename(configPath, `${configPath}${MIGRATED_SUFFIX}`).catch(() => {});
  }
}
