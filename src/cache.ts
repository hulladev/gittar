import { Glob } from 'bun'
import { FSError } from './errors'

/**
 * Checks if cache exists and returns all cached file paths
 * @param cacheDir - Path to cache directory
 * @param subpath - Optional subpath to filter files
 * @returns Array of absolute file paths, or null if cache doesn't exist
 * @throws FSError if file listing fails
 */
export async function checkCache(cacheDir: string, subpath?: string): Promise<string[] | null> {
  try {
    // Check if directory exists
    const { exitCode } = await Bun.$`test -d ${cacheDir}`.nothrow().quiet()

    if (exitCode !== 0) {
      return null
    }

    // If subpath is specified, check if it exists in cache
    const searchDir = subpath ? `${cacheDir}/${subpath}` : cacheDir
    const subpathExists = await Bun.$`test -e ${searchDir}`.nothrow().quiet()

    if (subpathExists.exitCode !== 0) {
      return null
    }

    // Recursively list all files in the cache directory (or subpath)
    const glob = new Glob('**/*')
    const files: string[] = []

    for await (const file of glob.scan({
      cwd: searchDir,
      onlyFiles: true,
    })) {
      files.push(`${searchDir}/${file}`)
    }

    return files.sort()
  } catch (error) {
    throw new FSError(`Failed to check cache at ${cacheDir}`, error)
  }
}

/**
 * Copies all files from source directory to destination directory
 * @param sourceDir - Source directory path
 * @param destDir - Destination directory path
 * @param subpath - Optional subpath to copy (only files within this path will be copied)
 * @returns Array of destination file paths (absolute)
 * @throws FSError if copying fails
 */
export async function copyFiles(sourceDir: string, destDir: string, subpath?: string): Promise<string[]> {
  try {
    // Create destination directory
    await Bun.$`mkdir -p ${destDir}`

    // Determine source path based on subpath
    const copySource = subpath ? `${sourceDir}/${subpath}` : sourceDir

    // Check if source exists
    const { exitCode } = await Bun.$`test -e ${copySource}`.nothrow().quiet()
    if (exitCode !== 0) {
      throw new Error(`Source path does not exist: ${copySource}`)
    }

    // Copy all files recursively
    await Bun.$`cp -R ${copySource}/. ${destDir}/`

    // List all copied files
    const glob = new Glob('**/*')
    const files: string[] = []

    for await (const file of glob.scan({
      cwd: destDir,
      onlyFiles: true,
    })) {
      files.push(`${destDir}/${file}`)
    }

    return files.sort()
  } catch (error) {
    throw new FSError(`Failed to copy files from ${sourceDir} to ${destDir}`, error)
  }
}
