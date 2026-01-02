import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { tmpdir } from 'os'
import gittar from '../src/gittar'
import { URLError } from '../src/errors'
import type { Config } from '../src/types.public'

describe('gittar', () => {
  let testDir: string
  let originalFetch: typeof globalThis.fetch
  let mockTarData: ArrayBuffer
  let fetchMock: ReturnType<typeof mock>

  beforeEach(async () => {
    testDir = `${tmpdir()}/gittar-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    originalFetch = globalThis.fetch

    const tempSourceDir = `${tmpdir()}/gittar-source-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/README.md`, '# Test Repo')
    await Bun.write(`${tempSourceDir}/test-repo-main/package.json`, '{"name":"test"}')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    mockTarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()

    // Setup default mock for successful fetch
    fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockTarData),
      } as Response)
    )
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = fetchMock
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet()
    globalThis.fetch = originalFetch
  })

  test('downloads and extracts repository', async () => {
    const config: Config = {
      url: 'owner/repo',
      outdir: testDir,
    }

    const result = await gittar(config)

    expect(result).toBeDefined()
    expect(result.files).toBeDefined()
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.files.every((f) => f.startsWith(testDir))).toBe(true)
    expect(result.fromCache).toBe(false)
    expect(result.cacheDir).toBe(testDir)
    expect(result.outDir).toBe(testDir)

    const readmeExists = await Bun.file(`${testDir}/README.md`).exists()
    const packageExists = await Bun.file(`${testDir}/package.json`).exists()

    expect(readmeExists).toBe(true)
    expect(packageExists).toBe(true)
  })

  test('uses cache when available and update is false', async () => {
    const cacheDir = `${testDir}/cache`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
    }

    const result1 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result1.fromCache).toBe(false)

    const result2 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result2.fromCache).toBe(true)

    expect(result1.files).toEqual(result2.files)
    expect(result1.cacheDir).toEqual(result2.cacheDir)
    expect(result1.outDir).toEqual(result2.outDir)
  })

  test('bypasses cache when update is true', async () => {
    const cacheDir = `${testDir}/cache`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
    }

    const result1 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result1.fromCache).toBe(false)

    const result2 = await gittar({ ...config, update: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result2.fromCache).toBe(false)
  })

  test('uses cachedir when specified', async () => {
    const cacheDir = `${testDir}/custom-cache`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
    }

    const result = await gittar(config)

    expect(result.files.every((f) => f.startsWith(cacheDir))).toBe(true)
    expect(result.cacheDir).toBe(cacheDir)
    expect(result.outDir).toBe(cacheDir)

    const { exitCode } = await Bun.$`test -d ${cacheDir}`.nothrow().quiet()
    expect(exitCode).toBe(0)
  })

  test('uses outdir when cachedir not specified', async () => {
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      outdir: outDir,
    }

    const result = await gittar(config)

    expect(result.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result.cacheDir).toBe(outDir)
    expect(result.outDir).toBe(outDir)
  })

  test('uses default cache location when neither cachedir nor outdir specified', async () => {
    const config: Config = {
      url: 'owner/repo',
    }

    const result = await gittar(config)

    expect(result).toBeDefined()
    expect(result.files).toBeDefined()
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.cacheDir).toBeDefined()
    expect(result.outDir).toBeDefined()
  })

  test('handles branch specification', async () => {
    const config: Config = {
      url: 'owner/repo',
      branch: 'develop',
      outdir: testDir,
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/develop.tar.gz')
  })

  test('throws URLError when repository not found', async () => {
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    )

    const config: Config = {
      url: 'owner/nonexistent-repo',
      outdir: testDir,
    }

    expect(gittar(config)).rejects.toThrow(URLError)
  })

  test('throws URLError for invalid URL', async () => {
    const config: Config = {
      url: 'invalid',
      outdir: testDir,
    }

    expect(gittar(config)).rejects.toThrow(URLError)
  })

  test('handles GitHub URL', async () => {
    const config: Config = {
      url: 'https://github.com/owner/repo',
      outdir: testDir,
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/main.tar.gz')
  })

  test('handles GitLab URL', async () => {
    const config: Config = {
      url: 'https://gitlab.com/owner/repo',
      outdir: testDir,
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://gitlab.com/owner/repo/-/archive/main/repo-main.tar.gz')
  })

  test('handles SSH format', async () => {
    const config: Config = {
      url: 'git@github.com:owner/repo.git',
      outdir: testDir,
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/main.tar.gz')
  })

  test('returns sorted list of files', async () => {
    const config: Config = {
      url: 'owner/repo',
      outdir: testDir,
    }

    const result = await gittar(config)

    for (let i = 1; i < result.files.length; i++) {
      expect(result.files[i - 1] <= result.files[i]).toBe(true)
    }
  })

  test('saves files to cacheDir even when outdir is different', async () => {
    const cacheDir = `${testDir}/cache`
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: outDir,
    }

    await gittar(config)

    const cacheReadmeExists = await Bun.file(`${cacheDir}/README.md`).exists()
    const outReadmeExists = await Bun.file(`${outDir}/README.md`).exists()

    expect(cacheReadmeExists).toBe(true)
    expect(outReadmeExists).toBe(true)
  })

  test('copies from cache to outdir when cache exists and outdir differs', async () => {
    const cacheDir = `${testDir}/cache`
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: outDir,
    }

    const result1 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result1.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result1.fromCache).toBe(false)
    expect(result1.cacheDir).toBe(cacheDir)
    expect(result1.outDir).toBe(outDir)

    await Bun.$`rm -rf ${outDir}`.quiet()

    const result2 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result2.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result2.fromCache).toBe(true)
    expect(result2.cacheDir).toBe(cacheDir)
    expect(result2.outDir).toBe(outDir)

    const outReadmeExists = await Bun.file(`${outDir}/README.md`).exists()
    expect(outReadmeExists).toBe(true)
  })

  test('returns outdir paths when outdir differs from cachedir', async () => {
    const cacheDir = `${testDir}/cache`
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: outDir,
    }

    const result = await gittar(config)

    expect(result.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result.files.every((f) => !f.startsWith(cacheDir))).toBe(true)
    expect(result.cacheDir).toBe(cacheDir)
    expect(result.outDir).toBe(outDir)
  })

  test('returns cachedir paths when outdir equals cachedir', async () => {
    const cacheDir = `${testDir}/cache`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: cacheDir,
    }

    const result = await gittar(config)

    expect(result.files.every((f) => f.startsWith(cacheDir))).toBe(true)
    expect(result.cacheDir).toBe(cacheDir)
    expect(result.outDir).toBe(cacheDir)
  })

  test('preserves cache when update is false and reuses it for different outdir', async () => {
    const cacheDir = `${testDir}/cache`
    const outDir1 = `${testDir}/output1`
    const outDir2 = `${testDir}/output2`

    await gittar({ url: 'owner/repo', cachedir: cacheDir, outdir: outDir1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await gittar({ url: 'owner/repo', cachedir: cacheDir, outdir: outDir2 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const out1ReadmeExists = await Bun.file(`${outDir1}/README.md`).exists()
    const out2ReadmeExists = await Bun.file(`${outDir2}/README.md`).exists()
    const cacheReadmeExists = await Bun.file(`${cacheDir}/README.md`).exists()

    expect(out1ReadmeExists).toBe(true)
    expect(out2ReadmeExists).toBe(true)
    expect(cacheReadmeExists).toBe(true)
  })

  test('updates cache when update is true and copies to outdir', async () => {
    const cacheDir = `${testDir}/cache`
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: outDir,
    }

    await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await gittar({ ...config, update: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const cacheReadmeExists = await Bun.file(`${cacheDir}/README.md`).exists()
    const outReadmeExists = await Bun.file(`${outDir}/README.md`).exists()

    expect(cacheReadmeExists).toBe(true)
    expect(outReadmeExists).toBe(true)
  })

  test('extracts only subpath when URL contains subpath', async () => {
    // Create a mock tar with subdirectories
    const tempSourceDir = `${tmpdir()}/gittar-subpath-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/src`.quiet()
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/docs`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/README.md`, '# Root README')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/index.ts`, 'export const main = () => {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/utils.ts`, 'export const utils = {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/docs/guide.md`, '# Guide')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    const subpathTarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()

    // Setup mock with subdirectory tar
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(subpathTarData),
      } as Response)
    )

    const config: Config = {
      url: 'https://github.com/owner/repo/tree/main/src',
      outdir: testDir,
    }

    const result = await gittar(config)

    // Should only contain files from src directory
    expect(result.files.length).toBe(2)
    expect(result.files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(result.files.some((f) => f.endsWith('utils.ts'))).toBe(true)
    expect(result.subpath).toBe('src')

    // Should NOT contain files from root or docs
    expect(result.files.some((f) => f.endsWith('README.md'))).toBe(false)
    expect(result.files.some((f) => f.endsWith('guide.md'))).toBe(false)

    // Files should be in the root of outdir, not in src subdirectory
    const indexExists = await Bun.file(`${testDir}/index.ts`).exists()
    const utilsExists = await Bun.file(`${testDir}/utils.ts`).exists()
    const readmeExists = await Bun.file(`${testDir}/README.md`).exists()

    expect(indexExists).toBe(true)
    expect(utilsExists).toBe(true)
    expect(readmeExists).toBe(false)
  })

  test('extracts only subpath when config contains subpath', async () => {
    // Create a mock tar with subdirectories
    const tempSourceDir = `${tmpdir()}/gittar-subpath-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/src`.quiet()
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/docs`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/README.md`, '# Root README')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/index.ts`, 'export const main = () => {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/docs/guide.md`, '# Guide')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    const subpathTarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()

    // Setup mock with subdirectory tar
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(subpathTarData),
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
      outdir: testDir,
      subpath: 'docs',
    }

    const result = await gittar(config)

    // Should only contain files from docs directory
    expect(result.files.length).toBe(1)
    expect(result.files.some((f) => f.endsWith('guide.md'))).toBe(true)
    expect(result.subpath).toBe('docs')

    // Should NOT contain files from root or src
    expect(result.files.some((f) => f.endsWith('README.md'))).toBe(false)
    expect(result.files.some((f) => f.endsWith('index.ts'))).toBe(false)
  })

  test('returns only subpath files from cache when cache exists', async () => {
    // Create a mock tar with subdirectories
    const tempSourceDir = `${tmpdir()}/gittar-subpath-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/src`.quiet()
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/docs`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/README.md`, '# Root README')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/index.ts`, 'export const main = () => {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/utils.ts`, 'export const utils = {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/docs/guide.md`, '# Guide')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    const subpathTarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()

    const fetchMockSubpath = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(subpathTarData),
      } as Response)
    )
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = fetchMockSubpath

    const cacheDir = `${testDir}/cache`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      subpath: 'src',
    }

    // First call should download and cache
    const result1 = await gittar(config)
    expect(fetchMockSubpath).toHaveBeenCalledTimes(1)
    expect(result1.files.length).toBe(2)
    expect(result1.files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(result1.files.some((f) => f.endsWith('utils.ts'))).toBe(true)
    expect(result1.fromCache).toBe(false)
    expect(result1.subpath).toBe('src')

    // Second call should use cache and return only subpath files
    const result2 = await gittar(config)
    expect(fetchMockSubpath).toHaveBeenCalledTimes(1) // Should not fetch again
    expect(result2.files.length).toBe(2)
    expect(result2.files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(result2.files.some((f) => f.endsWith('utils.ts'))).toBe(true)
    expect(result2.files.some((f) => f.endsWith('README.md'))).toBe(false)
    expect(result2.files.some((f) => f.endsWith('guide.md'))).toBe(false)
    expect(result2.fromCache).toBe(true)
    expect(result2.subpath).toBe('src')
  })

  test('copies only subpath files from cache to outdir when outdir differs', async () => {
    // Create a mock tar with subdirectories
    const tempSourceDir = `${tmpdir()}/gittar-subpath-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/src`.quiet()
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/docs`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/README.md`, '# Root README')
    await Bun.write(`${tempSourceDir}/test-repo-main/src/index.ts`, 'export const main = () => {}')
    await Bun.write(`${tempSourceDir}/test-repo-main/docs/guide.md`, '# Guide')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    const subpathTarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()

    const fetchMockSubpath = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(subpathTarData),
      } as Response)
    )
    // @ts-expect-error - fetchMock is a mock function, does not need 100% match
    globalThis.fetch = fetchMockSubpath

    const cacheDir = `${testDir}/cache`
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      cachedir: cacheDir,
      outdir: outDir,
      subpath: 'src',
    }

    // First call should download, cache, and copy to outdir
    const result1 = await gittar(config)
    expect(fetchMockSubpath).toHaveBeenCalledTimes(1)
    expect(result1.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result1.files.length).toBe(1)
    expect(result1.files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(result1.fromCache).toBe(false)
    expect(result1.subpath).toBe('src')
    expect(result1.cacheDir).toBe(cacheDir)
    expect(result1.outDir).toBe(outDir)

    // Remove outdir
    await Bun.$`rm -rf ${outDir}`.quiet()

    // Second call should use cache and copy only subpath to outdir
    const result2 = await gittar(config)
    expect(fetchMockSubpath).toHaveBeenCalledTimes(1) // Should not fetch again
    expect(result2.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result2.files.length).toBe(1)
    expect(result2.files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(result2.fromCache).toBe(true)
    expect(result2.subpath).toBe('src')
    expect(result2.cacheDir).toBe(cacheDir)
    expect(result2.outDir).toBe(outDir)

    // Verify only subpath files exist in outdir
    const outIndexExists = await Bun.file(`${outDir}/index.ts`).exists()
    const outReadmeExists = await Bun.file(`${outDir}/README.md`).exists()
    const outGuideExists = await Bun.file(`${outDir}/guide.md`).exists()

    expect(outIndexExists).toBe(true)
    expect(outReadmeExists).toBe(false)
    expect(outGuideExists).toBe(false)
  })
})
