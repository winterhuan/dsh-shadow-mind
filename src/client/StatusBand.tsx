/**
 * Ambient Shadow Mind status band under the composer card
 * (`conversation.composer.dock`).
 *
 * One muted read-only line: system mode (active / paused / auto off), running
 * shadow agents with elapsed time, and the latest recorded event. Detail lives
 * in `/shadow status`; this surface only confirms that the system is alive.
 */
import type { CSSProperties, JSX } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useShadowSnapshot } from "./snapshot-store.js";
import type { ShadowMindSnapshot } from "./types.js";

export type StatusBandProps = PropsRuntime<"conversation.composer.dock">;

const bandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 22,
  padding: "2px 4px",
  fontSize: 12,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-tertiary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const strongStyle: CSSProperties = {
  color: "var(--dsw-alias-label-secondary)",
};

function elapsed(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

/** Render up to `limit` running shadows, then a `+N` overflow. */
function runningSummary(
  running: ShadowMindSnapshot["running"],
  now: number,
  limit: number,
): string {
  const shown = running.slice(0, limit);
  const parts = shown.map(
    (run) => `${run.shadowId} ${elapsed(run.startedAt, now)}`,
  );
  const overflow = running.length - shown.length;
  if (overflow > 0) parts.push(`+${overflow}`);
  return parts.join(" · ");
}

export function StatusBand(_props: StatusBandProps): JSX.Element | null {
  const snapshot = useShadowSnapshot();
  if (snapshot.status !== "ready") return null;
  const state = snapshot.snapshot;
  if (!state.present) return null;

  const idle =
    !state.paused &&
    state.activeCount === 0 &&
    state.eventCount === 0 &&
    state.configError === null &&
    state.diagnostics.length === 0;
  if (idle) return null;

  const mode = state.paused
    ? "暂停"
    : state.autoEnabled
      ? "活跃"
      : "自动关闭";
  const now = Date.now();
  const lastEvent =
    state.recentEvents.length > 0
      ? state.recentEvents[state.recentEvents.length - 1]
      : undefined;

  return (
    <div style={bandStyle} title="/shadow status 查看完整状态">
      <span style={strongStyle}>Shadow {mode}</span>
      {state.paused && <span>运行 {state.activeCount}</span>}
      {!state.paused && state.activeCount > 0 && (
        <span style={strongStyle}>🐙 {runningSummary(state.running, now, 2)}</span>
      )}
      {state.configError !== null && (
        <span style={{ color: "var(--dsw-alias-state-error-primary)" }}>
          配置错误
        </span>
      )}
      {lastEvent !== undefined && <span>· {lastEvent.kind}</span>}
    </div>
  );
}
