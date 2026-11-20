/** Human controls use DSH's existing command results and conversation UI. */
import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type {} from './index.ts'

export const name = 'shadow-mind-commands'
export const inject = ['commands', 'shadowMind']

/**
 * Register the original human controls while the runtime owns scheduling.
 * @param ctx - Plugin context owning the command registration.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.commands.register({ definitionId: CommandDefinitionId('dsh-shadow-mind/shadow'), name: 'shadow',
    description: 'inspect and control independent Shadow reviews and workers', input: { hint: 'status | check [id] | probe [id] [tools] | list | clean | auto on|off | pause | resume' },
    async handler({ agent, rawInput, signal }) {
      const [action = 'status', id, tools, ...rest] = rawInput.trim().split(/\s+/u).filter(Boolean)
      const usage = 'Usage: /shadow status | check [id] | probe [id] [tools,...] | list | clean | auto on|off | pause | resume'
      if (rest.length > 0) return { kind: 'error', text: usage }
      if (action === 'status') return { kind: 'success', text: await ctx.shadowMind.status(agent) }
      if (action === 'list') return { kind: 'success', text: await ctx.shadowMind.manage(agent, 'list') }
      if (action === 'clean') return { kind: 'success', text: await ctx.shadowMind.clean(agent) }
      if (action === 'auto') {
        if (id !== 'on' && id !== 'off') return { kind: 'error', text: usage }
        return { kind: 'success', text: ctx.shadowMind.setAuto(id === 'on') }
      }
      if (action === 'pause' || action === 'resume') {
        if (id !== undefined) return { kind: 'error', text: usage }
        await ctx.shadowMind.pause(agent, action === 'pause')
        return { kind: 'success', text: action === 'pause' ? 'Shadow Mind paused; active reviews stopped.' : 'Shadow Mind resumed for future reviews.' }
      }
      if (action === 'check') {
        if (tools !== undefined) return { kind: 'error', text: usage }
        await ctx.shadowMind.review(agent, signal, id)
        return { kind: 'success', text: await ctx.shadowMind.status(agent) }
      }
      if (action === 'probe') {
        const requested = tools?.split(',').map(item => item.trim()).filter(Boolean) ?? []
        return { kind: 'success', text: await ctx.shadowMind.probe(agent, signal, id, requested) }
      }
      return { kind: 'error', text: usage }
    },
  }))
}
