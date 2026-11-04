import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getRemoteCommit } from '../src/commit'

let fixture: string
let commit: string
let tagCommit: string
let originalGitConfig: string | undefined

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'gittar-refs-'))
  originalGitConfig = process.env.GIT_CONFIG_GLOBAL
  const repo = join(fixture, 'repo')
  // Rewrite only this fixture URL; never change the user's Git configuration.
  const config = join(fixture, 'gitconfig')
  await Bun.write(config, `[url "${repo}"]\n\tinsteadOf = https://gittar.test/owner/repo.git\n`)
  process.env.GIT_CONFIG_GLOBAL = config
  await Bun.$`git init --initial-branch=main ${repo}`.quiet()
  await Bun.$`git -C ${repo} -c user.name=Test -c user.email=test@example.invalid -c commit.gpgSign=false commit --allow-empty -m initial`.quiet()
  commit = (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim()
  await Bun.$`git -C ${repo} tag lightweight`.quiet()
  await Bun.$`git -C ${repo} -c user.name=Test -c user.email=test@example.invalid tag -a annotated -m release`.quiet()
  await Bun.$`git -C ${repo} branch release/stable`.quiet()
  await Bun.$`git -C ${repo} -c user.name=Test -c user.email=test@example.invalid -c commit.gpgSign=false commit --allow-empty -m next`.quiet()
  await Bun.$`git -C ${repo} tag release/stable`.quiet()
  tagCommit = (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim()
})

afterAll(async () => {
  if (originalGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL
  else process.env.GIT_CONFIG_GLOBAL = originalGitConfig
  await rm(fixture, { recursive: true, force: true })
})

test.each(['release/stable', 'lightweight', 'annotated'])(
  'resolves %s to its commit, preferring a branch over a same-name tag',
  async (revision) => {
    expect(await getRemoteCommit('https://gittar.test/owner/repo', revision)).toBe(commit)
  }
)

test('an explicit tag ref selects the tag instead of a same-name branch', async () => {
  expect(await getRemoteCommit('https://gittar.test/owner/repo', 'refs/tags/release/stable')).toBe(tagCommit)
})

test('does not mistake a matching ref pattern for an exact revision', async () => {
  expect(await getRemoteCommit('https://gittar.test/owner/repo', 'light*')).toBeNull()
})
