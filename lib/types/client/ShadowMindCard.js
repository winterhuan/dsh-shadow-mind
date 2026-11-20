import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Settings page for the profile fields Shadow Mind exposes to users. */
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { formLabels } from "./locales.js";
export function ShadowMindCard(props) {
    const state = props.useShadowSettings(snapshot => snapshot);
    if (props.view === 'summary')
        return props.t('description');
    const disabled = !state.writable;
    const field = (name, label, numeric = false) => (_jsx(SettingsValueField, { id: `plugin-config-shadow-${name}`, label: props.t(label), overriddenLabel: props.t('overridden'), resetLabel: props.t('reset'), invalidLabel: props.t('invalidNumber'), numeric: numeric, disabled: disabled, ...state[name], onEdit: text => { props.edit(name, text); }, onReset: () => { props.resetField(name); } }));
    return _jsxs(SettingsForm, { labels: formLabels(props.t), state: state, onSave: props.save, onDiscard: props.discard, children: [field('heartbeatProbability', 'heartbeatProbability', true), field('heartbeatTools', 'heartbeatTools'), field('maxParallel', 'maxParallel', true), field('timeoutSeconds', 'timeoutSeconds', true), field('resultBatchWindowMs', 'resultBatchWindowMs', true), field('maxHeartbeatRunsPerTask', 'maxHeartbeatRunsPerTask', true), field('defaultShadowModel', 'defaultShadowModel'), field('defaultThinkingLevel', 'defaultThinkingLevel')] });
}
//# sourceMappingURL=ShadowMindCard.js.map