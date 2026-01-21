import { parseInput } from './getTarUrl'

/**
 * Metadata stored alongside cache to track commit info
 */
export type CacheMetadata = {
  commit: string
  branch: string
  timestamp: number
}

const METADATA_FILE = '.gittar-meta.json'

/**
 * Gets the remote commit SHA for a repository branch using git ls-remote
 * @param repoUrl - Repository URL (any supported format)
 * @param branch - Branch name to check
 * @returns The commit SHA, or null if it couldn't be retrieved
 */
export async function getRemoteCommit(repoUrl: string, branch: string): Promise<string | null> {
  const parsed = parseInput(repoUrl, branch)
  if (!parsed) {
    return null
  }

  const { owner, repo, hostname } = parsed
  const gitUrl = `https://${hostname}/${owner}/${repo}.git`

  try {
    const result = await Bun.$`git ls-remote ${gitUrl} refs/heads/${branch}`.quiet().nothrow()

    if (result.exitCode !== 0) {
      return null
    }

    const output = result.stdout.toString().trim()
    if (!output) {
      return null
    }

    // Output format: "<sha>\trefs/heads/<branch>"
    const sha = output.split(/\s+/)[0]
    return sha || null
  } catch {
    return null
  }
}

/**
 * Reads the cached metadata from a cache directory
 * @param cacheDir - Path to the cache directory
 * @returns The cached metadata, or null if not found
 */
export async function readCacheMetadata(cacheDir: string): Promise<CacheMetadata | null> {
  try {
    const metaPath = `${cacheDir}/${METADATA_FILE}`
    const file = Bun.file(metaPath)

    if (!(await file.exists())) {
      return null
    }

    const content = await file.json()
    return content as CacheMetadata
  } catch {
    return null
  }
}

/**
 * Writes metadata to a cache directory
 * @param cacheDir - Path to the cache directory
 * @param metadata - The metadata to write
 */
export async function writeCacheMetadata(cacheDir: string, metadata: CacheMetadata): Promise<void> {
  const metaPath = `${cacheDir}/${METADATA_FILE}`
  await Bun.write(metaPath, JSON.stringify(metadata, null, 2))
}

/**
 * Checks if the cache is stale by comparing remote and cached commit SHAs
 * @param repoUrl - Repository URL
 * @param branch - Branch to check
 * @param cacheDir - Path to cache directory
 * @returns Object with isStale boolean and commit info
 */
export async function checkCacheStale(
  repoUrl: string,
  branch: string,
  cacheDir: string
): Promise<{
  isStale: boolean
  remoteCommit: string | null
  cachedCommit: string | null
  cachedBranch: string | null
}> {
  const [metadata, remoteCommit] = await Promise.all([
    readCacheMetadata(cacheDir),
    getRemoteCommit(repoUrl, branch),
  ])

  // If we can't get remote commit, assume not stale (fail-safe to use cache)
  if (!remoteCommit) {
    return {
      isStale: false,
      remoteCommit: null,
      cachedCommit: metadata?.commit ?? null,
      cachedBranch: metadata?.branch ?? null,
    }
  }

  // If no cached metadata, consider stale
  if (!metadata) {
    return {
      isStale: true,
      remoteCommit,
      cachedCommit: null,
      cachedBranch: null,
    }
  }

  // Compare commits
  const isStale = metadata.commit !== remoteCommit || metadata.branch !== branch

  return {
    isStale,
    remoteCommit,
    cachedCommit: metadata.commit,
    cachedBranch: metadata.branch,
  }
}
