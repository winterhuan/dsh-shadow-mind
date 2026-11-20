import type { Context } from '@deepseek-ai/cordis';
import { type ShadowLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.shadowMind': ShadowLocaleKey;
    }
}
export declare const NS = "settings.shadowMind";
export declare const inject: string[];
export declare function apply(ctx: Context, _config?: unknown): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map