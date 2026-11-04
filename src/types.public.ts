/**
 * Cache update strategy:
 * - 'always': Always re-download, ignore cache
 * - 'commit': Re-download only if remote commit SHA differs from cached (default)
 * - 'never': Reuse cache for the requested revision without checking remote
 */
export type UpdateStrategy = 'always' | 'commit' | 'never'

export type Config = {
  cacheDir?: string
  outDir?: string
  update?: UpdateStrategy
  url: string
  branch?: string // Branch name, tag, or full commit SHA
  subpath?: string
}

export type GittarResult = {
  files: string[] // Absolute file paths (filtered by subpath if specified)
  cacheDir: string // Where the full tar is stored
  outDir: string // Where files were copied to (may be same as cacheDir)
  subpath?: string // The subpath filter if user specified one
  fromCache: boolean // Whether data was retrieved from cache (true) or downloaded (false)
  commit?: string // The commit SHA that was downloaded/cached
  branch?: string // The requested revision that was used (branch, tag, or full SHA)
}
