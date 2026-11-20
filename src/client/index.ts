/** Browser entry for Shadow Mind settings and Session activity surfaces. */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@winterhuan/dsh-shadow-mind/remote'
import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import shadowMindRemote from '@winterhuan/dsh-shadow-mind/remote'
import { en, zh, type ShadowLocaleKey } from './locales.ts'
import { ShadowMindCard } from './ShadowMindCard.tsx'
import { ShadowSettingsController, SHADOW_SETTINGS_NS } from './settings-controller.ts'
import type { ShadowSettings } from './settings-controller.ts'
import { ShadowSnapshotController } from './snapshot-controller.ts'
import { ShadowStatusBand } from './StatusBand.tsx'
import { ShadowStatusChip } from './StatusChip.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.shadowMind': ShadowLocaleKey }
}

/** Locale namespace used by Shadow Mind's settings and activity surfaces. */
export const NS = 'settings.shadowMind'
export const inject = ['remote', 'slots', 'locale', 'configForms']

export async function apply(ctx: Context, _config?: unknown): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(shadowMindRemote as TypertRemoteContribution)
  const ui = ctx.inject(['remote.shadowMind'], current => mount(current))
  try { await ui } catch (error) {
    try { await ui.dispose() } finally { await disposeRemote() }
    throw error
  }
  return async () => { try { await ui.dispose() } finally { await disposeRemote() } }
}

function mount(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'shadow-mind: dictionaries')
  const t = ctx.locale.bind(NS)
  const form = new ShadowSettingsController(ctx.configForms.get<ShadowSettings>(SHADOW_SETTINGS_NS))
  const snapshots = new ShadowSnapshotController(ctx.remote.shadowMind)
  ctx.effect(() => () => { form.dispose(); snapshots.dispose() }, 'shadow-mind: client state')
  ctx.effect(() => ctx.configForms.whileServed([SHADOW_SETTINGS_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'shadow-mind', order: 45, label: () => t('title'), locale: NS, inject: () => form.inject(),
  }, ShadowMindCard))), 'shadow-mind: settings page')
  ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'shadow-mind-status', order: 40, locale: NS,
    inject: sessionId => ({ hooks: { shadowSnapshot: snapshots.storeFor(sessionId) }, controller: snapshots }),
  }, ShadowStatusChip)), 'shadow-mind: session status')
  ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'shadow-mind-status', order: 40, locale: NS,
    inject: sessionId => ({ hooks: { shadowSnapshot: snapshots.storeFor(sessionId) }, controller: snapshots }),
  }, ShadowStatusBand)), 'shadow-mind: activity band')
}
