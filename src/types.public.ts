export type Config = {
  cacheDir?: string
  outDir?: string
  update?: boolean
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
}
