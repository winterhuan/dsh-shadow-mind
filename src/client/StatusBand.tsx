/** Session-scoped Shadow activity summary beneath the composer. */
import { useEffect } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ShadowSnapshotController, ShadowSnapshotState } from './snapshot-controller.ts'
import css from './StatusBand.module.css'

export interface ShadowBandInjected {
  hooks: { shadowSnapshot: SnapshotStore<ShadowSnapshotState> }
  controller: ShadowSnapshotController
}
export type ShadowStatusBandProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'settings.shadowMind'> & InjectFace<ShadowBandInjected>

export function ShadowStatusBand(props: ShadowStatusBandProps) {
  const state = props.useShadowSnapshot(snapshot => snapshot)
  useEffect(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId])
  if (state.status === 'loading' && state.snapshot === undefined) return null
  if (state.status === 'error' && state.snapshot === undefined) return <div className={css.band} role="status">{props.t('connectionError')}</div>
  const snapshot = state.snapshot
  if (snapshot === undefined || !snapshot.present) return <div className={css.band} role="status">{props.t('noAgent')}</div>
  return <div className={css.band} role="status" aria-live="polite">
    <span className={css.title}>{props.t(snapshot.paused ? 'paused' : 'active')}</span>
    <span>{props.t('activeRuns')}: {snapshot.activeCount}/{snapshot.maxParallelShadows}</span>
    <span>{props.t('configuredShadows')}: {snapshot.shadows.length}</span>
    <span>{props.t('recordedEvents')}: {snapshot.eventCount}</span>
    {snapshot.diagnostics.length > 0 ? <Tag tone="warning">{props.t('diagnostics')}: {snapshot.diagnostics.length}</Tag> : null}
  </div>
}
