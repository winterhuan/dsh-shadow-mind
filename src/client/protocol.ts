/**
 * Client half of the `shadowMind` Typert Remote.
 *
 * The host service (`ShadowMindRemote` in src/remote.ts) is claimed by the
 * Gateway through the strict host-face manifest in typert.host.js, which
 * `@deepseek-ai/dsh-typert-loader` registers on plugin mount. The client keeps
 * one hand-written descriptor (no parameters, `src-json` result codec) plus
 * declaration merging into the protocol maps to mount the namespace and call
 * `ctx.remote.shadowMind.snapshot()`.
 */
import type {
  RemoteResult,
  TypertClientRemote,
  TypertRemoteContribution,
  TypertRemoteNamespace,
} from "@deepseek-ai/dsh-typert-protocol";
import type { ShadowMindSnapshot } from "./types.js";

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface TypertRemoteMap {
    "shadowMind/snapshot": () => Promise<RemoteResult<ShadowMindSnapshot>>;
  }
  interface TypertRemoteNamespaceMap {
    shadowMind: TypertRemoteNamespace<"shadowMind">;
  }
}

/** Wire namespace of the host Shadow Mind remote service. */
export const SHADOW_MIND_NAMESPACE = "shadowMind" as const;

/** Explicit contribution mounted through `ctx.remote.$mount`. */
export const SHADOW_MIND_CONTRIBUTION: TypertRemoteContribution = {
  package: "@winterchenhuan/dsh-shadow-mind",
  descriptors: [
    {
      id: "@winterchenhuan/dsh-shadow-mind#shadowMind/snapshot",
      service: SHADOW_MIND_NAMESPACE,
      namespace: SHADOW_MIND_NAMESPACE,
      method: "snapshot",
      invocation: { kind: "direct" },
      parameters: [],
      result: { mode: "src-json" },
    },
  ],
};

/**
 * Fetch the current runtime snapshot through the mounted Remote namespace.
 * Resolves a transport/carrier failure into the `RemoteResult` error branch;
 * never throws for business or connection failures.
 */
export function shadowMindSnapshot(
  remote: TypertClientRemote,
): Promise<RemoteResult<ShadowMindSnapshot>> {
  return remote.shadowMind.snapshot();
}
