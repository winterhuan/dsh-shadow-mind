import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
import type { Config } from './config.ts';
import type { Definition } from './definitions.ts';
/** Frozen review input and the exact event references rendered into it. */
export interface Trajectory {
    readonly text: string;
    readonly refs: readonly SessionSeq[];
    readonly capturedThroughSeq: number;
    readonly omitted: number;
}
/**
 * Capture effective messages, keeping task constraints and recent evidence within limits.
 * @param session - Live parent; replacements and projections are respected.
 * @param config - Total and per-entry text bounds.
 * @returns Immutable snapshot without reasoning or raw tool-result bodies.
 */
export declare function captureTrajectory(session: Session, config: Config): Trajectory;
/**
 * Frame quoted observations separately from the user-owned responsibility.
 * @param definition - Responsibility captured for this activation.
 * @param trajectory - Bounded observations from the parent.
 * @returns Complete child task; the native preset supplies project instructions and tools.
 */
export declare function reviewPrompt(definition: Definition, trajectory: Trajectory): string;
