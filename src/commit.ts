import { parseInput } from './getTarUrl'

/**
 * Metadata stored alongside cache to track commit info
 */
export type CacheMetadata = {
  commit?: string
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
 * Gets the remote commit SHA with fallback branches (main → master)
 * @param repoUrl - Repository URL (any supported format)
 * @param branches - Array of branches to try in order (defaults to ['main', 'master'])
 * @returns Object with commit SHA and branch used, or null values if all failed
 */
export async function getRemoteCommitWithFallback(
  repoUrl: string,
  branches: string[] = ['main', 'master']
): Promise<{ commit: string | null; branch: string | null }> {
  for (const branch of branches) {
    const commit = await getRemoteCommit(repoUrl, branch)
    if (commit) {
      return { commit, branch }
    }
  }
  return { commit: null, branch: null }
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
 * @param branch - Branch to check (if undefined, will try main then master)
 * @param cacheDir - Path to cache directory
 * @returns Object with isStale boolean, commit info, and resolved branch
 */
export async function checkCacheStale(
  repoUrl: string,
  branch: string | undefined,
  cacheDir: string
): Promise<{
  isStale: boolean
  remoteCommit: string | null
  remoteBranch: string | null
  cachedCommit: string | null
  cachedBranch: string | null
}> {
  const metadata = await readCacheMetadata(cacheDir)

  // Get remote commit - use fallback if no specific branch
  let remoteCommit: string | null
  let remoteBranch: string | null

  if (branch) {
    remoteCommit = await getRemoteCommit(repoUrl, branch)
    remoteBranch = remoteCommit ? branch : null
  } else {
    const result = await getRemoteCommitWithFallback(repoUrl)
    remoteCommit = result.commit
    remoteBranch = result.branch
  }

  // If we can't get remote commit, assume not stale (fail-safe to use cache)
  if (!remoteCommit || !remoteBranch) {
    return {
      isStale: false,
      remoteCommit: null,
      remoteBranch: null,
      cachedCommit: metadata?.commit ?? null,
      cachedBranch: metadata?.branch ?? null,
    }
  }

  // If no cached metadata, consider stale
  if (!metadata) {
    return {
      isStale: true,
      remoteCommit,
      remoteBranch,
      cachedCommit: null,
      cachedBranch: null,
    }
  }

  // Compare commits - if cached commit is unknown, consider stale
  // Also stale if branch changed (e.g., cached was 'master' but now checking 'main')
  const isStale = !metadata.commit || metadata.commit !== remoteCommit || metadata.branch !== remoteBranch

  return {
    isStale,
    remoteCommit,
    remoteBranch,
    cachedCommit: metadata.commit ?? null,
    cachedBranch: metadata.branch,
  }
}
