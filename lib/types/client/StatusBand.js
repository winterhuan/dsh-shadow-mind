import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Session-scoped Shadow activity summary beneath the composer. */
import { useEffect } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './StatusBand.module.css';
export function ShadowStatusBand(props) {
    const state = props.useShadowSnapshot(snapshot => snapshot);
    useEffect(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId]);
    if (state.status === 'loading' && state.snapshot === undefined)
        return null;
    if (state.status === 'error' && state.snapshot === undefined)
        return _jsx("div", { className: css.band, role: "status", children: props.t('connectionError') });
    const snapshot = state.snapshot;
    if (snapshot === undefined || !snapshot.present)
        return _jsx("div", { className: css.band, role: "status", children: props.t('noAgent') });
    return _jsxs("div", { className: css.band, role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.title, children: props.t(snapshot.paused ? 'paused' : 'active') }), _jsxs("span", { children: [props.t('activeRuns'), ": ", snapshot.activeCount, "/", snapshot.maxParallelShadows] }), _jsxs("span", { children: [props.t('configuredShadows'), ": ", snapshot.shadows.length] }), _jsxs("span", { children: [props.t('recordedEvents'), ": ", snapshot.eventCount] }), snapshot.diagnostics.length > 0 ? _jsxs(Tag, { tone: "warning", children: [props.t('diagnostics'), ": ", snapshot.diagnostics.length] }) : null] });
}
//# sourceMappingURL=StatusBand.js.map