/**
 * Compact Shadow Mind status chip in the composer tool row
 * (`conversation.input.left`).
 *
 * Ambient readout per DESIGN.md: a small `🐙 N` indicator while shadow agents
 * run, `⏸` while the system is paused. Hidden when the plugin is absent or
 * idle, so an empty seat costs no layout.
 */
import type { CSSProperties, JSX } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useShadowSnapshot } from "./snapshot-store.js";

export type StatusChipProps = PropsRuntime<"conversation.input.left">;

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "0 2px",
  fontSize: 11,
  lineHeight: "16px",
  color: "var(--dsw-alias-label-secondary)",
  userSelect: "none",
  whiteSpace: "nowrap",
};

export function StatusChip(_props: StatusChipProps): JSX.Element | null {
  const snapshot = useShadowSnapshot();
  if (snapshot.status !== "ready") return null;
  const state = snapshot.snapshot;
  if (!state.present) return null;
  if (state.paused) {
    return (
      <span style={chipStyle} title="Shadow Mind 已暂停（/shadow resume 恢复）">
        ⏸
      </span>
    );
  }
  if (state.activeCount === 0) return null;
  return (
    <span
      style={chipStyle}
      title={`${state.activeCount} 个 Shadow 正在运行（/shadow status 查看详情）`}
    >
      <span aria-hidden>🐙</span>
      <span>{state.activeCount}</span>
    </span>
  );
}
