import { jsx as _jsx } from "react/jsx-runtime";
/** Compact Shadow state beside the current Session's input controls. */
import { useEffect } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
export function ShadowStatusChip(props) {
    const state = props.useShadowSnapshot(snapshot => snapshot);
    useEffect(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId]);
    if (state.status === 'loading' && state.snapshot === undefined)
        return null;
    if (state.status === 'error' && state.snapshot === undefined)
        return _jsx(Tag, { tone: "warning", children: props.t('connectionError') });
    const snapshot = state.snapshot;
    if (snapshot === undefined || !snapshot.present)
        return null;
    return _jsx(Tag, { tone: snapshot.paused ? 'neutral' : 'success', children: props.t(snapshot.paused ? 'paused' : 'active') });
}
//# sourceMappingURL=StatusChip.js.map