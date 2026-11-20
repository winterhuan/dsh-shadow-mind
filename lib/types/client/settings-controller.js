import { SettingsFormModel, settingsNumberField, settingsTextField, } from '@deepseek-ai/dsh-client-ui-primitives';
/** Host entry id owning Shadow Mind's live profile values. */
export const SHADOW_SETTINGS_NS = 'shadow-mind-runtime';
const listField = (field) => ({
    field,
    format: (value) => Array.isArray(value) && value.every(item => typeof item === 'string') ? value.join(', ') : '',
    parse: (text) => ({ kind: 'set', value: text.split(',').map(item => item.trim()).filter(Boolean) }),
});
export class ShadowSettingsController {
    form;
    store;
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [
            settingsNumberField('heartbeatProbability'), listField('heartbeatTools'), settingsNumberField('maxParallel'),
            settingsNumberField('timeoutSeconds'), settingsNumberField('resultBatchWindowMs'),
            settingsNumberField('maxHeartbeatRunsPerTask'), settingsTextField('defaultShadowModel'), settingsTextField('defaultThinkingLevel'),
        ]);
        this.store = this.form.bind(() => this.projection());
    }
    projection() {
        return {
            ...this.form.shell(), heartbeatProbability: this.form.field('heartbeatProbability'), heartbeatTools: this.form.field('heartbeatTools'),
            maxParallel: this.form.field('maxParallel'), timeoutSeconds: this.form.field('timeoutSeconds'),
            resultBatchWindowMs: this.form.field('resultBatchWindowMs'), maxHeartbeatRunsPerTask: this.form.field('maxHeartbeatRunsPerTask'),
            defaultShadowModel: this.form.field('defaultShadowModel'), defaultThinkingLevel: this.form.field('defaultThinkingLevel'),
        };
    }
    inject() { return { hooks: { shadowSettings: this.store }, ...this.form.actions() }; }
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=settings-controller.js.map