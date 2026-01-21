/**
 * Cache update strategy:
 * - 'always': Always re-download, ignore cache
 * - 'commit': Re-download only if remote commit SHA differs from cached (default)
 * - 'never': Always use cache if it exists, never check remote
 */
export type UpdateStrategy = 'always' | 'commit' | 'never'

export type Config = {
  cacheDir?: string
  outDir?: string
  update?: UpdateStrategy
  url: string
  branch?: string
  subpath?: string
}

export type GittarResult = {
  files: string[] // Absolute file paths (filtered by subpath if specified)
  cacheDir: string // Where the full tar is stored
  outDir: string // Where files were copied to (may be same as cacheDir)
  subpath?: string // The subpath filter if user specified one
  fromCache: boolean // Whether data was retrieved from cache (true) or downloaded (false)
  commit?: string // The commit SHA that was downloaded/cached
  branch?: string // The branch that was used
}
