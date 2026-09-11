import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addLocalSourceFromInput } from './local-sources-add.server'
import { readLocalSourcesFile } from './local-sources-vault.server'

describe('local-sources-add.server', () => {
  let home: string
  const prev = process.env.CLAWQL_OBSIDIAN_VAULT_PATH

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'clawql-sources-'))
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home
  })

  afterEach(async () => {
    if (prev === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prev
    await rm(home, { recursive: true, force: true })
  })

  it('adds a CLI source', async () => {
    const { entry, path } = await addLocalSourceFromInput({
      command: 'echo',
      args: ['hello'],
      name: 'Echo test',
    })
    expect(entry.kind).toBe('cli')
    expect(entry.cliCommand).toBe('echo')
    expect(path).toContain('sources.json')

    const file = await readLocalSourcesFile()
    expect(file.sources).toHaveLength(1)
    expect(file.sources[0]?.id).toBe(entry.id)

    const raw = await readFile(join(home, 'sources.json'), 'utf8')
    expect(raw).toContain('echo')
  })
})
