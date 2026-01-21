import type { Config, GittarResult, UpdateStrategy } from './types.public'
import { parseRepoInfo, getCacheDir, normalizePath } from './utils'
import { checkCache, copyFiles } from './cache'
import { downloadTar } from './download'
import { extractTar } from './extract'
import { checkCacheStale, writeCacheMetadata, readCacheMetadata, getRemoteCommit } from './commit'

/**
 * Downloads and extracts a git repository tar archive with cache-first support
 *
 * Behavior:
 * - Always caches the full tar archive in cacheDir for reuse
 * - Subpath filtering (if specified) only affects returned files, not cache
 * - Returns metadata including cache hit status and storage locations
 *
 * Update strategies:
 * - 'always': Always re-download, ignore cache
 * - 'commit': Re-download only if remote commit SHA differs from cached (default)
 * - 'never': Always use cache if it exists, never check remote
 *
 * @param config - Configuration object
 * @returns Object containing filtered files, cache location, output location, and metadata
 * @throws URLError if URL parsing or download fails
 * @throws FSError if filesystem operations fail
 */
export function gittar(config: Config): Promise<GittarResult>
export function gittar(url: string): Promise<GittarResult>
export default async function gittar(configOrUrl: Config | string): Promise<GittarResult> {
  let config: Config
  if (typeof configOrUrl === 'string') {
    config = { url: configOrUrl }
  } else {
    config = configOrUrl
  }

  // Default update strategy is 'commit'
  const updateStrategy: UpdateStrategy = config.update ?? 'commit'

  // Extract owner, repo, and subpath from URL
  const parsed = parseRepoInfo(config.url)
  const owner = parsed.owner
  const repo = parsed.repo

  // Use subpath from config if provided, otherwise use subpath from URL
  const subpath = config.subpath || parsed.subpath

  // Determine cache directory (subpath affects cache location logic)
  const cacheDir = getCacheDir(config, owner, repo)

  // Determine output directory (defaults to cacheDir)
  const outdir = config.outDir ? normalizePath(config.outDir) : cacheDir

  // Determine branch to use for remote checks
  const branchToCheck = config.branch || 'main'

  let fromCache = false
  let files: string[]
  let commit: string | undefined
  let branch: string | undefined

  // Check cache based on update strategy
  if (updateStrategy !== 'always') {
    const cachedFiles = await checkCache(cacheDir, subpath)

    if (cachedFiles) {
      let useCache = false
      const metadata = await readCacheMetadata(cacheDir)

      if (updateStrategy === 'never') {
        // Never check remote, always use cache if it exists
        useCache = true
        commit = metadata?.commit
        branch = metadata?.branch
      } else {
        // updateStrategy === 'commit' - check if cache is stale
        const staleCheck = await checkCacheStale(config.url, branchToCheck, cacheDir)

        if (!staleCheck.isStale) {
          useCache = true
          commit = staleCheck.cachedCommit ?? undefined
          branch = staleCheck.cachedBranch ?? undefined
        }
      }

      if (useCache) {
        fromCache = true
        // If outdir is different from cacheDir, copy files to outdir
        if (outdir !== cacheDir) {
          files = await copyFiles(cacheDir, outdir, subpath)
        } else {
          files = cachedFiles
        }
        return { files, cacheDir, outDir: outdir, subpath, fromCache, commit, branch }
      }
    }
  }

  // Download tar with branch fallback
  fromCache = false
  const downloadResult = await downloadTar(config)
  branch = downloadResult.branch

  // Get the commit SHA for the downloaded branch
  commit = (await getRemoteCommit(config.url, branch)) ?? undefined

  // Always extract full tar to cacheDir for future use
  await extractTar(downloadResult.data, cacheDir)

  // Save metadata for future cache validation
  if (commit) {
    await writeCacheMetadata(cacheDir, {
      commit,
      branch,
      timestamp: Date.now(),
    })
  }

  // If outdir is different from cacheDir, copy files to outdir (filtered by subpath if specified)
  if (outdir !== cacheDir) {
    files = await copyFiles(cacheDir, outdir, subpath)
  } else {
    files = (await checkCache(cacheDir, subpath))!
  }

  return { files, cacheDir, outDir: outdir, subpath, fromCache, commit, branch }
}
