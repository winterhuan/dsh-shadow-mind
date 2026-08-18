/**
 * Shared Shadow Mind snapshot store (browser half).
 *
 * One module-level poller serves every mounted UI entry: the host snapshot is
 * cheap to produce and the UI only needs ambient freshness, so a fixed-rate
 * poll (5s) beats wiring a host push channel. Polling starts once the Remote
 * namespace is mounted (apply) and stops on plugin unload.
 */
import { useEffect, useState } from "react";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { ShadowMindSnapshot } from "./types.js";

/** Poll interval for the ambient status surfaces. */
export const SNAPSHOT_POLL_MS = 5000;

export type SnapshotState =
  | { status: "idle" }
  | { status: "ready"; snapshot: ShadowMindSnapshot }
  | { status: "error"; message: string; snapshot: ShadowMindSnapshot | undefined };

type SnapshotFetcher = () => Promise<RemoteResult<ShadowMindSnapshot>>;

let state: SnapshotState = { status: "idle" };
const listeners = new Set<() => void>();
let fetcher: SnapshotFetcher | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight: Promise<void> | undefined;

function notify(): void {
  for (const listener of listeners) listener();
}

async function tick(): Promise<void> {
  if (fetcher === undefined || inFlight !== undefined) return;
  inFlight = (async () => {
    const result = await fetcher();
    if (result.ok) {
      state = { status: "ready", snapshot: result.value };
    } else {
      state = {
        status: "error",
        message: result.error.message,
        snapshot: state.status === "ready" ? state.snapshot : undefined,
      };
    }
  })().catch((error: unknown) => {
    state = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      snapshot: state.status === "ready" ? state.snapshot : undefined,
    };
  });
  await inFlight;
  inFlight = undefined;
  notify();
}

/** Start the shared poller with the mounted Remote fetch function. */
export function startSnapshotPolling(fetch: SnapshotFetcher): void {
  fetcher = fetch;
  if (timer !== undefined) return;
  void tick();
  timer = setInterval(() => void tick(), SNAPSHOT_POLL_MS);
}

/** Stop polling and drop listeners; safe to call more than once. */
export function stopSnapshotPolling(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  fetcher = undefined;
  inFlight = undefined;
  listeners.clear();
}

/** React subscription over the shared snapshot state. */
export function useShadowSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<SnapshotState>(state);
  useEffect(() => {
    const listener = (): void => setSnapshot(state);
    listeners.add(listener);
    setSnapshot(state);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}
