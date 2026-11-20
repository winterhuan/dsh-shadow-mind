/** Staged profile configuration edits for the Shadow Mind settings card. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import { type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
/** Host entry id owning Shadow Mind's live profile values. */
export declare const SHADOW_SETTINGS_NS = "shadow-mind-runtime";
export interface ShadowSettings {
    heartbeatProbability?: number;
    heartbeatTools?: string[];
    maxParallel?: number;
    timeoutSeconds?: number;
    resultBatchWindowMs?: number;
    maxHeartbeatRunsPerTask?: number;
    defaultShadowModel?: string;
    defaultThinkingLevel?: string;
}
export interface ShadowSettingsState extends SettingsFormShell {
    heartbeatProbability: SettingsFieldState;
    heartbeatTools: SettingsFieldState;
    maxParallel: SettingsFieldState;
    timeoutSeconds: SettingsFieldState;
    resultBatchWindowMs: SettingsFieldState;
    maxHeartbeatRunsPerTask: SettingsFieldState;
    defaultShadowModel: SettingsFieldState;
    defaultThinkingLevel: SettingsFieldState;
}
export interface ShadowSettingsFace extends SettingsFormActions {
    hooks: {
        shadowSettings: SnapshotStore<ShadowSettingsState>;
    };
}
export declare class ShadowSettingsController {
    private readonly form;
    private readonly store;
    constructor(scope: SettingsFormScope<ShadowSettings>);
    private projection;
    inject(): ShadowSettingsFace;
    dispose(): void;
}
//# sourceMappingURL=settings-controller.d.ts.map