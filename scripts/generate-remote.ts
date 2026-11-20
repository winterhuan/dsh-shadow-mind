/** Generate Typert host and browser Remote artifacts for the standalone package. */
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FaceModelEmitter, WorkspaceAnalyzer, writePackageArtifacts } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'shadow-mind-typert-'))
try {
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir')
  const packageDir = join(temporary, 'packages', 'shadow-mind')
  await mkdir(packageDir, { recursive: true })
  await cp(join(root, 'src'), join(packageDir, 'src'), { recursive: true })
  await cp(join(root, 'package.json'), join(packageDir, 'package.json'))
  await cp(join(root, 'tsconfig.json'), join(packageDir, 'tsconfig.json'))
  await cp(join(root, 'tsconfig.host.json'), join(packageDir, 'tsconfig.host.json'))
  await symlink(join(root, 'node_modules'), join(packageDir, 'node_modules'), 'dir')
  const protocolDir = join(temporary, 'packages', 'protocol')
  await mkdir(protocolDir, { recursive: true })
  await cp(join(root, 'node_modules/@deepseek-ai/dsh-typert-protocol/lib/types'), join(protocolDir, 'src'), { recursive: true })
  await writeFile(join(protocolDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-typert-protocol', type: 'module', exports: { '.': './src/index.d.ts' } }))
  await writeFile(join(protocolDir, 'tsconfig.json'), JSON.stringify({ include: ['src'] }))
  const options = JSON.parse(await readFile(join(root, 'tsconfig.host.json'), 'utf8')).compilerOptions
  options.paths = { '@deepseek-ai/dsh-typert-protocol': [join(protocolDir, 'src/index.d.ts')] }
  await writeFile(join(temporary, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: options, files: [], references: [{ path: './packages/shadow-mind/tsconfig.host.json' }, { path: './packages/protocol/tsconfig.json' }] }))
  const model = new WorkspaceAnalyzer({ root: temporary, packages: ['@winterhuan/dsh-shadow-mind'], faces: ['host'], checkDiagnostics: false }).analyze()
  const artifacts = model.faces.flatMap(face => face.packages.map(item => new FaceModelEmitter(face).emit(item.name)))
  if (!artifacts.some(artifact => artifact.remote !== undefined)) throw new Error('Shadow Mind Remote was not generated')
  writePackageArtifacts(root, artifacts)
} finally { await rm(temporary, { recursive: true, force: true }) }
