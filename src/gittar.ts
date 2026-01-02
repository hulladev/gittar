import type { Config, GittarResult } from './types.public'
import { parseRepoInfo, getCacheDir, normalizePath } from './utils'
import { checkCache, copyFiles } from './cache'
import { downloadTar } from './download'
import { extractTar } from './extract'

/**
 * Downloads and extracts a git repository tar archive with cache-first support
 *
 * Behavior:
 * - Always caches the full tar archive in cacheDir for reuse
 * - Subpath filtering (if specified) only affects returned files, not cache
 * - Returns metadata including cache hit status and storage locations
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

  // Extract owner, repo, and subpath from URL
  const parsed = parseRepoInfo(config.url)
  const owner = parsed.owner
  const repo = parsed.repo

  // Use subpath from config if provided, otherwise use subpath from URL
  const subpath = config.subpath || parsed.subpath

  // Determine cache directory (subpath affects cache location logic)
  const cacheDir = getCacheDir(config, owner, repo, subpath)

  // Determine output directory (defaults to cacheDir)
  const outdir = config.outDir ? normalizePath(config.outDir) : cacheDir

  let fromCache = false
  let files: string[]

  // Check cache if update is not forced
  if (config.update !== true) {
    const cachedFiles = await checkCache(cacheDir, subpath)

    if (cachedFiles) {
      fromCache = true
      // If outdir is different from cacheDir, copy files to outdir
      if (outdir !== cacheDir) {
        files = await copyFiles(cacheDir, outdir, subpath)
      } else {
        files = cachedFiles
      }
      return { files, cacheDir, outDir: outdir, subpath, fromCache }
    }
  }

  // Download tar with branch fallback
  fromCache = false
  const tarData = await downloadTar(config)

  // Always extract full tar to cacheDir for future use
  await extractTar(tarData, cacheDir)

  // If outdir is different from cacheDir, copy files to outdir (filtered by subpath if specified)
  if (outdir !== cacheDir) {
    files = await copyFiles(cacheDir, outdir, subpath)
  } else {
    files = (await checkCache(cacheDir, subpath))!
  }

  return { files, cacheDir, outDir: outdir, subpath, fromCache }
}
