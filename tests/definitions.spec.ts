import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, onTestFinished } from 'vitest'
import { Config } from '../src/config.ts'
import { loadDefinitions, parseDefinition } from '../src/definitions.ts'

describe('Markdown definition admission', () => {
  it('rejects tools and malformed model routes instead of silently broadening access', () => {
    expect(() => parseDefinition('---\ntools: [bash]\n---\nReview.', 'review')).toThrow('unsupported field: tools')
    expect(() => parseDefinition('---\nrun_with_model: incomplete\n---\nReview.', 'review')).toThrow('provider/model')
    expect(parseDefinition('---\nrun_with_model: provider/org/model\n---\nReview.', 'review').route).toEqual({ provider: 'provider', model: 'org/model' })
  })

  it('isolates invalid files and disables every conflicting id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-definitions-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    await Promise.all([
      writeFile(join(directory, 'first.md'), '---\nid: duplicate\n---\nReview.'),
      writeFile(join(directory, 'second.md'), '---\nid: duplicate\n---\nReview.'),
      writeFile(join(directory, 'valid.md'), '---\nname: Valid\n---\nReview.'),
      writeFile(join(directory, 'broken.md'), 'not a definition'),
    ])
    const result = await loadDefinitions(Config({ definitionsDirectory: directory }))
    expect(result.definitions.map(definition => definition.id)).toEqual(['valid'])
    expect(result.diagnostics).toHaveLength(2)
  })
})
