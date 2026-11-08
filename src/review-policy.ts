/** Read-only tool exposure and execution policy shared by every review child. */
import type { Context } from '@deepseek-ai/cordis'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import type { PromptPresentation } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'shadow-mind-review-policy'
export const inject = ['tools', 'systemPrompt', 'llm']
const allowed = new Set(['read', 'grep', 'glob', 'structured_output'])

/**
 * Apply the same allowlist to prompt assembly and actual tool dispatch.
 * @param ctx - Review preset context; all effects unwind with its scope.
 */
export function apply(ctx: Context): void {
  const native = new NativeToolExecutor(ctx)
  // A preset can serve concurrent children; request evidence belongs to its Agent.
  const presentations = new WeakMap<object, PromptPresentation>()
  ctx.tools.setExecutor({
    describe(tools) { return native.describe(tools.filter(tool => allowed.has(tool.name))) },
    execute(input) { return native.execute(input) },
  })
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const result = await next()
    if (_context.scope !== undefined) presentations.set(_context.scope, result)
    return result
  })
  ctx.on('agent/pre-step', async (input, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const tools = ctx.tools.schemas(input.agent).filter(tool => allowed.has(tool.name))
    const model = await ctx.llm.resolveModelInfo(input.modelSelection.provider, input.modelSelection.model, input.signal)
    const requestBytes = Buffer.byteLength(JSON.stringify({
      history: input.agent.session.deriveMessages(), messages: decision.messages,
      presentation: presentations.get(input.agent), tools,
    }), 'utf8')
    if (model.context !== undefined && requestBytes + (input.agent.options.maxTokens ?? 4096) + 1024 > model.context.contextWindow) {
      throw new Error('Shadow request exceeds the conservative context budget; reduce maxTrajectoryChars or choose a larger-context model.')
    }
    return decision
  })
  ctx.tools.guard(execution => allowed.has(execution.name) ? undefined : 'Shadow reviews only allow read, grep, glob, and structured_output.')
}
