import shadowMindRemote from '@winterhuan/dsh-shadow-mind/remote';
import { en, zh } from "./locales.js";
import { ShadowMindCard } from "./ShadowMindCard.js";
import { ShadowSettingsController, SHADOW_SETTINGS_NS } from "./settings-controller.js";
import { ShadowSnapshotController } from "./snapshot-controller.js";
import { ShadowStatusBand } from "./StatusBand.js";
import { ShadowStatusChip } from "./StatusChip.js";
export const NS = 'settings.shadowMind';
export const inject = ['remote', 'slots', 'locale', 'configForms'];
export async function apply(ctx, _config) {
    const disposeRemote = await ctx.remote.$mount(shadowMindRemote);
    const ui = ctx.inject(['remote.shadowMind'], current => mount(current));
    try {
        await ui;
    }
    catch (error) {
        try {
            await ui.dispose();
        }
        finally {
            await disposeRemote();
        }
        throw error;
    }
    return async () => { try {
        await ui.dispose();
    }
    finally {
        await disposeRemote();
    } };
}
function mount(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'shadow-mind: dictionaries');
    const t = ctx.locale.bind(NS);
    const form = new ShadowSettingsController(ctx.configForms.get(SHADOW_SETTINGS_NS));
    const snapshots = new ShadowSnapshotController(ctx.remote.shadowMind);
    ctx.effect(() => () => { form.dispose(); snapshots.dispose(); }, 'shadow-mind: client state');
    ctx.effect(() => ctx.configForms.whileServed([SHADOW_SETTINGS_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: 'shadow-mind', order: 45, label: () => t('title'), locale: NS, inject: () => form.inject(),
    }, ShadowMindCard))), 'shadow-mind: settings page');
    ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left', id: 'shadow-mind-status', order: 40, locale: NS,
        inject: sessionId => ({ hooks: { shadowSnapshot: snapshots.storeFor(sessionId) }, controller: snapshots }),
    }, ShadowStatusChip)), 'shadow-mind: session status');
    ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'shadow-mind-status', order: 40, locale: NS,
        inject: sessionId => ({ hooks: { shadowSnapshot: snapshots.storeFor(sessionId) }, controller: snapshots }),
    }, ShadowStatusBand)), 'shadow-mind: activity band');
}
//# sourceMappingURL=index.js.map