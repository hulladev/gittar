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

  // Extract owner, repo, branch, and subpath from URL
  const parsed = parseRepoInfo(config.url)
  const owner = parsed.owner
  const repo = parsed.repo

  // Use subpath from config if provided, otherwise use subpath from URL
  const subpath = config.subpath || parsed.subpath

  // Determine cache directory (subpath affects cache location logic)
  const cacheDir = getCacheDir(config, owner, repo)

  // Determine output directory (defaults to cacheDir)
  const outdir = config.outDir ? normalizePath(config.outDir) : cacheDir

  // Determine branch: config.branch takes priority, then URL branch, then default 'main'
  const branchToCheck = config.branch || parsed.branch

  let fromCache = false
  let files: string[]
  let commit: string | undefined
  let branch: string | undefined
  // Track remote commit/branch from stale check to avoid duplicate calls
  let knownRemoteCommit: string | null = null
  let knownRemoteBranch: string | null = null

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
        // Preserve remote commit/branch for potential use after download
        knownRemoteCommit = staleCheck.remoteCommit
        knownRemoteBranch = staleCheck.remoteBranch

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
  // If we have an explicit branch (from config or URL), use it to prevent fallback
  fromCache = false
  const downloadConfig = branchToCheck ? { ...config, branch: branchToCheck } : config
  const downloadResult = await downloadTar(downloadConfig)
  branch = downloadResult.branch

  // Get the commit SHA for the downloaded branch
  // Reuse knownRemoteCommit if we already fetched it for the same branch, otherwise fetch it
  if (knownRemoteCommit && knownRemoteBranch === branch) {
    commit = knownRemoteCommit
  } else {
    commit = (await getRemoteCommit(config.url, branch)) ?? undefined
  }

  // Always extract full tar to cacheDir for future use
  await extractTar(downloadResult.data, cacheDir)

  // Save metadata for future cache validation
  await writeCacheMetadata(cacheDir, {
    commit,
    branch,
    timestamp: Date.now(),
  })

  // If outdir is different from cacheDir, copy files to outdir (filtered by subpath if specified)
  if (outdir !== cacheDir) {
    files = await copyFiles(cacheDir, outdir, subpath)
  } else {
    files = (await checkCache(cacheDir, subpath))!
  }

  return { files, cacheDir, outDir: outdir, subpath, fromCache, commit, branch }
}
