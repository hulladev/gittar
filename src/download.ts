import { getTarUrl } from './getTarUrl'
import { URLError } from './errors'
import type { Config } from './types.public'

/**
 * Downloads tar.gz with automatic branch fallback (main → master)
 * @param config - Configuration object
 * @returns ArrayBuffer containing the downloaded tar.gz data
 * @throws URLError if download fails or platform is unsupported
 */
export async function downloadTar(config: Config): Promise<ArrayBuffer> {
  // Determine which branches to try
  const branches = config.branch ? [config.branch] : ['main', 'master']

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]
    const url = getTarUrl(config.url, branch)

    if (!url) {
      throw new URLError(`Unsupported platform for URL: ${config.url}`)
    }

    try {
      const response = await fetch(url)

      if (response.ok) {
        return await response.arrayBuffer()
      }

      // If 404 and not the last branch to try, continue to next branch
      if (response.status === 404 && i < branches.length - 1) {
        continue
      }

      // Any other error or 404 on last attempt
      throw new URLError(`Failed to download tar: ${response.status} ${response.statusText} (branch: ${branch})`, {
        url,
        branch,
      })
    } catch (error) {
      // Re-throw URLError as-is
      if (error instanceof URLError) {
        throw error
      }

      // Wrap network errors
      throw new URLError(`Network error downloading tar from ${url}`, error)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new URLError(`All branch attempts failed for ${config.url}`)
}
