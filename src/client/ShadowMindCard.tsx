/** Settings page for the profile fields Shadow Mind exposes to users. */
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShadowSettingsFace, ShadowSettingsState } from './settings-controller.ts'
import { formLabels, type ShadowLocaleKey } from './locales.ts'

export type ShadowMindCardProps = PropsRuntime<'plugins.item'> & PropsLocale<'settings.shadowMind'> & InjectFace<ShadowSettingsFace>

export function ShadowMindCard(props: ShadowMindCardProps) {
  const state = props.useShadowSettings(snapshot => snapshot)
  if (props.view === 'summary') return props.t('description')
  const disabled = !state.writable
  const field = (name: keyof Omit<ShadowSettingsState, 'available' | 'writable' | 'dirty' | 'invalid' | 'saving' | 'failed'>,
    label: ShadowLocaleKey, numeric = false) => (
    <SettingsValueField
      id={`plugin-config-shadow-${name}`} label={props.t(label)} overriddenLabel={props.t('overridden')}
      resetLabel={props.t('reset')} invalidLabel={props.t('invalidNumber')} numeric={numeric} disabled={disabled}
      {...state[name]} onEdit={text => { props.edit(name, text) }} onReset={() => { props.resetField(name) }}
    />
  )
  return <SettingsForm labels={formLabels(props.t)} state={state} onSave={props.save} onDiscard={props.discard}>
    {field('heartbeatProbability', 'heartbeatProbability', true)}
    {field('heartbeatTools', 'heartbeatTools')}
    {field('maxParallel', 'maxParallel', true)}
    {field('timeoutSeconds', 'timeoutSeconds', true)}
    {field('resultBatchWindowMs', 'resultBatchWindowMs', true)}
    {field('maxHeartbeatRunsPerTask', 'maxHeartbeatRunsPerTask', true)}
    {field('defaultShadowModel', 'defaultShadowModel')}
    {field('defaultThinkingLevel', 'defaultThinkingLevel')}
  </SettingsForm>
}
