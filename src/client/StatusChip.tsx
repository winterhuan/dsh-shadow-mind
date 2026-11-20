/** Compact Shadow state beside the current Session's input controls. */
import { useEffect } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ShadowSnapshotController, ShadowSnapshotState } from './snapshot-controller.ts'

export interface ShadowStatusInjected {
  hooks: { shadowSnapshot: SnapshotStore<ShadowSnapshotState> }
  controller: ShadowSnapshotController
}
export type ShadowStatusChipProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'settings.shadowMind'> & InjectFace<ShadowStatusInjected>

export function ShadowStatusChip(props: ShadowStatusChipProps) {
  const state = props.useShadowSnapshot(snapshot => snapshot)
  useEffect(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId])
  if (state.status === 'loading' && state.snapshot === undefined) return null
  if (state.status === 'error' && state.snapshot === undefined) return <Tag tone="warning">{props.t('connectionError')}</Tag>
  const snapshot = state.snapshot
  if (snapshot === undefined || !snapshot.present) return null
  return <Tag tone={snapshot.paused ? 'neutral' : 'success'}>{props.t(snapshot.paused ? 'paused' : 'active')}</Tag>
}
