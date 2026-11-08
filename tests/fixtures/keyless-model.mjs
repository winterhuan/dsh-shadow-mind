/** Deterministic acceptance adapter; every request stays local. */
import { appendFile } from 'node:fs/promises'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const inject = ['llm']
export function apply(ctx, config) {
  class Adapter extends LlmAdapter {
    async listModels(provider) { return [{ provider, id: 'shadow-fixture', name: 'Shadow fixture', contextWindow: 200000, maxTokens: 4096 }] }
    async *stream(options) {
      const names = (options.tools ?? []).map(tool => tool.name)
      const child = names.includes('structured_output')
      const content = JSON.stringify(options.messages)
      if (config.telemetryPath) await appendFile(config.telemetryPath, `${JSON.stringify({ child, names })}\n`)
      if (child) {
        const refs = [...content.matchAll(/seq=(\d+)/gu)].map(match => Number(match[1]))
        const args = JSON.stringify({ status: 'report', content: 'The result needs an explicit verification step. Inspect the evidence file before claiming completion.', refs: refs.slice(-1) })
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: 'shadow-result', name: 'structured_output', argumentsDelta: args }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'shadow-result', name: 'structured_output', arguments: args } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        const text = content.includes('Independent Shadow review findings follow.')
          ? 'Shadow feedback received. The original result needs an explicit verification step; this deterministic acceptance run is complete.'
          : 'The requested result is ready for independent review.'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['shadow-fixture'], new Adapter()))
}
