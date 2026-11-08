/** Real AgentLoop, preset composition and spawn provider with a deterministic adapter. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader, { Group } from '@deepseek-ai/cordis-plugin-loader'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Commands from '@deepseek-ai/dsh-commands'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { parse } from 'yaml'
import { onTestFinished } from 'vitest'
import ShadowMind from '../../src/index.ts'
import * as ShadowCommands from '../../src/commands.ts'
import type { Config } from '../../src/config.ts'

export function textResponse(text: string): StreamChunk[] {
  return [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }]
}

export function toolResponse(name: string, args: object): StreamChunk[] {
  const id = ToolCallId('fixture-call')
  const json = JSON.stringify(args)
  return [{ type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: json } },
    { type: 'finish', reason: { kind: 'tool-calls' } }]
}

export type Respond = (options: GenerateOptions, child: boolean) => AsyncIterable<StreamChunk> | readonly StreamChunk[]

export class Adapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly respond: Respond) { super() }
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 200000 } })
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield* this.respond(options, options.tools?.some(tool => tool.name === 'structured_output') === true)
  }
}

export function reportResponse(options: GenerateOptions, content = 'The result omits a required check.'): StreamChunk[] {
  const ref = Number(JSON.stringify(options.messages).match(/seq=(\d+)/u)?.[1])
  return toolResponse('structured_output', { status: 'report', content, refs: [ref] })
}

export async function harness(respond: Respond, config: Partial<Config> = {}, definitions = ['completion']) {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-mind-test-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  const adapter = new Adapter(respond)
  const workspace = join(directory, 'workspace')
  await mkdir(workspace)
  await writeFile(join(workspace, 'evidence.txt'), 'A fixture file that the reviewer can read.\n')
  for (const id of definitions) await writeFile(join(directory, `${id}.md`), `---\nid: ${id}\nname: ${id}\ntrigger: [final_response]\n---\nCheck completion against the task.\n`)
  await ctx.plugin(Loader, { baseUrl: import.meta.url })
  ctx.loader.builtins.group = Group
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(SubprocessLocal)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(AgentPresets, { default: 'standard' })
  await ctx.plugin(Commands)
  ctx.llm.registerAdapter(['fixture'], adapter)
  const patch = parse((await readFile(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')).replace('!!js ', '')) as { insert: { config?: { id?: string; plugins?: { name: string; config?: object }[] } }[] }[]
  const preset = patch[0]?.insert.find(row => row.config?.id === 'shadow-mind-review')?.config
  if (preset?.plugins === undefined) throw new Error('review preset missing')
  const plugins = preset.plugins.map(row => ({ ...row,
    ...row.name !== '@deepseek-ai/dsh-agent-instructions' ? {} : { config: { ...row.config, dshHome: join(directory, 'dsh-home'), agentsHome: join(directory, 'agents-home') } },
    name: row.name === '@winterhuan/dsh-shadow-mind/review-policy' ? new URL('../../src/review-policy.ts', import.meta.url).href : import.meta.resolve(row.name),
  }))
  await ctx.plugin({ inject: ['agentPresets'], async* apply(scope: Context) {
    yield await scope.agentPresets.register({ id: 'standard', plugins: [] })
    yield await scope.agentPresets.register({ id: 'shadow-mind-review', plugins })
  } })
  const runtime = await ctx.plugin(ShadowMind, { definitionsDirectory: directory, ...config })
  await ctx.plugin(ShadowCommands)
  const handle = await ctx.agents.create({ sessionId: SessionId('root'), meta: { cwd: workspace },
    agentOptions: { provider: 'fixture', model: 'fixture' }, setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard') } })
  const send = (text = 'Read the evidence and implement the requested result.') => handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
  return { ctx, adapter, directory, workspace, runtime, agent: handle.agent, send }
}
