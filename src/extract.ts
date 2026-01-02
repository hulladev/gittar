import { tmpdir } from 'os'
import { Glob } from 'bun'
import { FSError } from './errors'

/**
 * Extracts tar.gz data to target directory
 * Note: Always extracts the full tar archive. Subpath filtering should be done by the caller.
 * @param tarData - The gzipped tar data
 * @param outdir - Target directory for extraction
 * @returns Array of extracted file paths (absolute)
 * @throws FSError if extraction fails
 */
export async function extractTar(tarData: ArrayBuffer, outdir: string): Promise<string[]> {
  // Generate unique temp file name
  const tmpPath = `${tmpdir()}/gittar-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`

  try {
    // Create output directory
    await Bun.$`mkdir -p ${outdir}`

    // Write tar data to temporary file
    await Bun.write(tmpPath, tarData)

    // Extract tar.gz to output directory
    // --strip-components=1 removes the root folder (e.g., repo-branch/)
    await Bun.$`tar -xzf ${tmpPath} -C ${outdir} --strip-components=1`

    // Delete temporary tar file
    await Bun.$`rm ${tmpPath}`

    // List all extracted files
    const glob = new Glob('**/*')
    const files: string[] = []

    for await (const file of glob.scan({
      cwd: outdir,
      onlyFiles: true,
    })) {
      files.push(`${outdir}/${file}`)
    }

    return files.sort()
  } catch (error) {
    // Clean up temp file on error
    try {
      await Bun.$`rm -f ${tmpPath}`
    } catch {
      // Ignore cleanup errors
    }

    throw new FSError(`Failed to extract tar to ${outdir}`, error)
  }
}
