import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ShadowSnapshotController, ShadowSnapshotState } from './snapshot-controller.ts';
export interface ShadowBandInjected {
    hooks: {
        shadowSnapshot: SnapshotStore<ShadowSnapshotState>;
    };
    controller: ShadowSnapshotController;
}
export type ShadowStatusBandProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'settings.shadowMind'> & InjectFace<ShadowBandInjected>;
export declare function ShadowStatusBand(props: ShadowStatusBandProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=StatusBand.d.ts.map