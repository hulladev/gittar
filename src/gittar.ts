import type { Config } from './types.public'
import { parseRepoInfo, getCacheDir } from './utils'
import { checkCache, copyFiles } from './cache'
import { downloadTar } from './download'
import { extractTar } from './extract'

/**
 * Downloads and extracts a git repository tar archive with cache-first support
 *
 * @param config - Configuration object
 * @returns Array of extracted file paths (absolute)
 * @throws URLError if URL parsing or download fails
 * @throws FSError if filesystem operations fail
 */
export default async function gittar(config: Config): Promise<string[]> {
  // Extract owner, repo, and subpath from URL
  const parsed = parseRepoInfo(config.url)
  const owner = parsed.owner
  const repo = parsed.repo

  // Use subpath from config if provided, otherwise use subpath from URL
  const subpath = config.subpath || parsed.subpath

  // Determine cache directory (subpath affects cache location logic)
  const cacheDir = getCacheDir(config, owner, repo, subpath)

  // Determine output directory (defaults to cacheDir)
  const outdir = config.outdir || cacheDir

  // Check cache if update is not forced
  if (config.update !== true) {
    const cachedFiles = await checkCache(cacheDir, subpath)

    if (cachedFiles) {
      // If outdir is different from cacheDir, copy files to outdir
      if (outdir !== cacheDir) {
        return await copyFiles(cacheDir, outdir, subpath)
      }
      return cachedFiles
    }
  }

  // Download tar with branch fallback
  const tarData = await downloadTar(config)

  // Always extract full tar to cacheDir for future use
  await extractTar(tarData, cacheDir)

  // If outdir is different from cacheDir, copy files to outdir (filtered by subpath if specified)
  if (outdir !== cacheDir) {
    return await copyFiles(cacheDir, outdir, subpath)
  }

  // Return cached file paths (filtered by subpath if specified)
  return (await checkCache(cacheDir, subpath))!
}
