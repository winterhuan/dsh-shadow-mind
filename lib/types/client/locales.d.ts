/** English and Simplified Chinese copy for the Shadow Mind Client. */
import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives';
export type ShadowLocaleKey = 'title' | 'description' | 'active' | 'paused' | 'unavailable' | 'connectionError' | 'activeRuns' | 'configuredShadows' | 'recordedEvents' | 'diagnostics' | 'noAgent' | 'heartbeatProbability' | 'heartbeatTools' | 'maxParallel' | 'timeoutSeconds' | 'resultBatchWindowMs' | 'maxHeartbeatRunsPerTask' | 'defaultShadowModel' | 'defaultThinkingLevel' | 'overridden' | 'reset' | 'readOnly' | 'save' | 'saving' | 'saveFailed' | 'invalidNumber';
export declare const en: Record<ShadowLocaleKey, string>;
export declare const zh: Record<ShadowLocaleKey, string>;
export declare function formLabels(t: (key: ShadowLocaleKey) => string): SettingsFormLabels;
//# sourceMappingURL=locales.d.ts.map