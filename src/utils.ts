import { homedir } from 'os'
import { parseInput } from './getTarUrl'
import { URLError } from './errors'
import type { Config } from './types.public'

/**
 * Normalizes a path by expanding ~ to home directory
 * @param path - Path that may contain ~
 * @returns Normalized absolute path
 */
export function normalizePath(path: string): string {
  if (path.startsWith('~/')) {
    return `${homedir()}/${path.slice(2)}`
  }
  if (path === '~') {
    return homedir()
  }
  return path
}

/**
 * Extracts owner, repo, and optional subpath from a URL or short format input
 * @param url - Repository URL or identifier
 * @returns Object containing owner, repo, and optional subpath
 * @throws URLError if parsing fails
 */
export function parseRepoInfo(url: string): { owner: string; repo: string; subpath?: string } {
  const parsed = parseInput(url)

  if (!parsed) {
    throw new URLError(`Failed to parse repository URL: ${url}`)
  }

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    subpath: parsed.subpath,
  }
}

/**
 * Determines the cache directory path based on config
 * Priority: cachedir → default path
 *
 * Note: cacheDir is independent of outDir. The cache always stores the full repo,
 * while outDir (if different) gets a copy of the files (potentially filtered by subpath).
 *
 * @param config - Configuration object
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param subpath - Optional subpath filter (not used, kept for backward compatibility)
 * @returns Absolute path to cache directory
 */
export function getCacheDir(config: Config, owner: string, repo: string): string {
  if (config.cacheDir) {
    return normalizePath(config.cacheDir)
  }

  // Default: ~/.cache/hulla/gittar/{owner}/{repo}
  return `${homedir()}/.cache/hulla/gittar/${owner}/${repo}`
}
