import type { Session } from '@deepseek-ai/dsh-session';
import { type Config, type ConfigInput, type ResolvedConfig } from './config.ts';
import type { Definition } from './definitions.ts';
export interface Trajectory {
    readonly text: string;
    readonly refs: readonly number[];
    readonly capturedThroughSeq: number;
    readonly omitted: number;
}
export declare function captureTrajectory(session: Session, input: ResolvedConfig | Config | ConfigInput): Trajectory;
export declare function reviewPrompt(definition: Definition, trajectory: Trajectory, mode: 'review' | 'worker'): string;
//# sourceMappingURL=trajectory.d.ts.map