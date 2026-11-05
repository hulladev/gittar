import { parseInput } from './getTarUrl'
import type { Config, RepositorySource } from './types.public'

/** Parse a source without network access; repository/subpath identity excludes its revision. */
export function parseRepository(input: string | Pick<Config, 'url' | 'branch' | 'subpath'>): RepositorySource | null {
  const config = typeof input === 'string' ? { url: input } : input
  const parsed = parseInput(config.url, config.branch)
  if (!parsed) return null
  const repository = `https://${parsed.hostname.toLowerCase()}/${parsed.owner}/${parsed.repo.replace(/\.git$/, '')}`
  const subpath = (config.subpath ?? parsed.subpath ?? '').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
  return { repository, subpath, ref: parsed.ref }
}
