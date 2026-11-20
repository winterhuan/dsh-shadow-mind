import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ShadowSnapshotController, ShadowSnapshotState } from './snapshot-controller.ts';
export interface ShadowStatusInjected {
    hooks: {
        shadowSnapshot: SnapshotStore<ShadowSnapshotState>;
    };
    controller: ShadowSnapshotController;
}
export type ShadowStatusChipProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'settings.shadowMind'> & InjectFace<ShadowStatusInjected>;
export declare function ShadowStatusChip(props: ShadowStatusChipProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=StatusChip.d.ts.map