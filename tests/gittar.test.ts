import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { tmpdir } from 'os'
import gittar from '../src/gittar'
import { URLError } from '../src/errors'
import type { Config } from '../src/types.public'
import * as commitModule from '../src/commit'

describe('gittar', () => {
  let testDir: string
  let originalFetch: typeof globalThis.fetch
  let mockTarData: ArrayBuffer
  let fetchMock: ReturnType<typeof mock>
  let getRemoteCommitSpy: ReturnType<typeof spyOn>

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

    // Mock getRemoteCommit to avoid actual git ls-remote calls
    getRemoteCommitSpy = spyOn(commitModule, 'getRemoteCommit').mockResolvedValue('abc123def456')
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet()
    globalThis.fetch = originalFetch
    getRemoteCommitSpy.mockRestore()
  })

  test('downloads and extracts repository', async () => {
    const config: Config = {
      url: 'owner/repo',
      cacheDir: testDir,
      outDir: testDir,
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

  test('uses cache when available with update: never', async () => {
    const cacheDir = `${testDir}/cache`
    const config: Config = {
      url: 'owner/repo',
      cacheDir: cacheDir,
      update: 'never',
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
      cacheDir: cacheDir,
    }

    const result1 = await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result1.fromCache).toBe(false)

    const result2 = await gittar({ ...config, update: 'always' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result2.fromCache).toBe(false)
  })

  test('uses cachedir when specified', async () => {
    const cacheDir = `${testDir}/custom-cache`
    const config: Config = {
      url: 'owner/repo',
      cacheDir: cacheDir,
    }

    const result = await gittar(config)

    expect(result.files.every((f) => f.startsWith(cacheDir))).toBe(true)
    expect(result.cacheDir).toBe(cacheDir)
    expect(result.outDir).toBe(cacheDir)

    const { exitCode } = await Bun.$`test -d ${cacheDir}`.nothrow().quiet()
    expect(exitCode).toBe(0)
  })

  test('outDir is separate from cacheDir when only outDir specified', async () => {
    const outDir = `${testDir}/output`
    const config: Config = {
      url: 'owner/repo',
      outDir: outDir,
      update: 'never', // Use 'never' to avoid remote commit check
    }

    const result = await gittar(config)

    // Files are copied to outDir
    expect(result.files.every((f) => f.startsWith(outDir))).toBe(true)
    expect(result.outDir).toBe(outDir)
    // cacheDir defaults to standard location, not outDir
    expect(result.cacheDir).not.toBe(outDir)
    expect(result.cacheDir).toContain('.cache/hulla/gittar')
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
      outDir: testDir,
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
      outDir: testDir,
    }

    expect(gittar(config)).rejects.toThrow(URLError)
  })

  test('throws URLError for invalid URL', async () => {
    const config: Config = {
      url: 'invalid',
      outDir: testDir,
    }

    expect(gittar(config)).rejects.toThrow(URLError)
  })

  test('handles GitHub URL', async () => {
    const config: Config = {
      url: 'https://github.com/owner/repo',
      cacheDir: `${testDir}/github-cache`,
      outDir: testDir,
      update: 'always',
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/main.tar.gz')
  })

  test('handles GitLab URL', async () => {
    const config: Config = {
      url: 'https://gitlab.com/owner/repo',
      cacheDir: `${testDir}/gitlab-cache`,
      outDir: testDir,
      update: 'always',
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://gitlab.com/owner/repo/-/archive/main/repo-main.tar.gz')
  })

  test('handles SSH format', async () => {
    const config: Config = {
      url: 'git@github.com:owner/repo.git',
      cacheDir: `${testDir}/ssh-cache`,
      outDir: testDir,
      update: 'always',
    }

    await gittar(config)

    expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/main.tar.gz')
  })

  test('returns sorted list of files', async () => {
    const config: Config = {
      url: 'owner/repo',
      outDir: testDir,
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
      cacheDir: cacheDir,
      outDir: outDir,
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
      cacheDir: cacheDir,
      outDir: outDir,
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
      cacheDir: cacheDir,
      outDir: outDir,
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
      cacheDir: cacheDir,
      outDir: cacheDir,
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

    await gittar({ url: 'owner/repo', cacheDir: cacheDir, outDir: outDir1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await gittar({ url: 'owner/repo', cacheDir: cacheDir, outDir: outDir2 })
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
      cacheDir: cacheDir,
      outDir: outDir,
    }

    await gittar(config)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await gittar({ ...config, update: 'always' })
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
      outDir: testDir,
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
      outDir: testDir,
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
      cacheDir: cacheDir,
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
      cacheDir: cacheDir,
      outDir: outDir,
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

  describe('update strategies', () => {
    test('update: always - always re-downloads even when cache exists', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'always',
      }

      // First download
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.fromCache).toBe(false)
      expect(result1.branch).toBe('main')
      expect(result1.commit).toBe('abc123def456')

      // Second call should still download (always strategy)
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result2.fromCache).toBe(false)
      expect(result2.branch).toBe('main')
      expect(result2.commit).toBe('abc123def456')
    })

    test('update: never - always uses cache when it exists', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'never',
      }

      // First download
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.fromCache).toBe(false)
      expect(result1.commit).toBe('abc123def456')
      expect(result1.branch).toBe('main')

      // Second call should use cache without checking remote
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1) // No additional fetch
      expect(result2.fromCache).toBe(true)
      // Cache should return the same commit/branch from when it was downloaded
      expect(result2.commit).toBe('abc123def456')
      expect(result2.branch).toBe('main')
    })

    test('update: commit (default) - uses cache when commit unchanged', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        // update defaults to 'commit'
      }

      // First download
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.fromCache).toBe(false)
      expect(result1.commit).toBe('abc123def456')
      expect(result1.branch).toBe('main')

      // Second call - same commit, should use cache
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1) // No additional fetch
      expect(result2.fromCache).toBe(true)
      expect(result2.commit).toBe('abc123def456')
      expect(result2.branch).toBe('main')
    })

    test('update: commit - re-downloads when remote commit changes', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'commit',
      }

      // First download
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.fromCache).toBe(false)
      expect(result1.commit).toBe('abc123def456')
      expect(result1.branch).toBe('main')

      // Change the remote commit
      getRemoteCommitSpy.mockResolvedValue('newcommit789')

      // Second call - different commit, should re-download
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(2) // Should fetch again
      expect(result2.fromCache).toBe(false)
      expect(result2.commit).toBe('newcommit789')
      expect(result2.branch).toBe('main')
    })

    test('update: commit - uses cache when remote check fails (fail-safe)', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'commit',
      }

      // First download
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.fromCache).toBe(false)
      expect(result1.commit).toBe('abc123def456')
      expect(result1.branch).toBe('main')

      // Make remote check fail
      getRemoteCommitSpy.mockResolvedValue(null)

      // Second call - remote check fails, should use cache (fail-safe)
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1) // Should NOT fetch again
      expect(result2.fromCache).toBe(true)
      // Should return cached commit/branch
      expect(result2.commit).toBe('abc123def456')
      expect(result2.branch).toBe('main')
    })

    test('returns commit and branch info in result', async () => {
      const config: Config = {
        url: 'owner/repo',
        outDir: testDir,
      }

      const result = await gittar(config)

      expect(result.commit).toBe('abc123def456')
      expect(result.branch).toBe('main')
    })

    test('stores and retrieves metadata correctly', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'never',
      }

      // First download should create metadata
      await gittar(config)

      // Check metadata file exists and has correct content
      const metaPath = `${cacheDir}/.gittar-meta.json`
      const metaFile = Bun.file(metaPath)
      expect(await metaFile.exists()).toBe(true)

      const metadata = await metaFile.json()
      expect(metadata.commit).toBe('abc123def456')
      expect(metadata.branch).toBe('main')
      expect(metadata.timestamp).toBeGreaterThan(0)
    })

    test('always stores branch in metadata even when commit is unavailable', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'never',
      }

      // Make getRemoteCommit return null (simulating failure to fetch commit)
      getRemoteCommitSpy.mockResolvedValue(null)

      const result = await gittar(config)

      // Branch should still be returned (from download fallback)
      expect(result.branch).toBe('main')
      expect(result.commit).toBeUndefined()

      // Metadata file should still be created with branch
      const metaPath = `${cacheDir}/.gittar-meta.json`
      const metaFile = Bun.file(metaPath)
      expect(await metaFile.exists()).toBe(true)

      const metadata = await metaFile.json()
      expect(metadata.branch).toBe('main')
      expect(metadata.commit).toBeUndefined()
      expect(metadata.timestamp).toBeGreaterThan(0)
    })

    test('returns branch from cache when commit was unavailable during initial download', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'never',
      }

      // First download with commit unavailable
      getRemoteCommitSpy.mockResolvedValue(null)
      const result1 = await gittar(config)
      expect(result1.branch).toBe('main')
      expect(result1.commit).toBeUndefined()
      expect(result1.fromCache).toBe(false)

      // Second call should use cache and still return branch
      const result2 = await gittar(config)
      expect(result2.branch).toBe('main')
      expect(result2.commit).toBeUndefined()
      expect(result2.fromCache).toBe(true)
    })

    test('cache is considered stale when commit is unknown (triggers re-download)', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'commit', // Default strategy
      }

      // First download with commit unavailable
      getRemoteCommitSpy.mockResolvedValue(null)
      const result1 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.commit).toBeUndefined()
      expect(result1.branch).toBe('main')

      // Now make commit available
      getRemoteCommitSpy.mockResolvedValue('newcommit123')

      // Second call should re-download because cached commit is unknown
      const result2 = await gittar(config)
      expect(fetchMock).toHaveBeenCalledTimes(2) // Should fetch again
      expect(result2.commit).toBe('newcommit123')
      expect(result2.branch).toBe('main')
      expect(result2.fromCache).toBe(false)
    })
  })

  describe('branch resolution', () => {
    test('uses branch from URL when specified in tree format', async () => {
      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop',
        cacheDir: `${testDir}/cache`,
        outDir: testDir,
      }

      const result = await gittar(config)

      // Should fetch using the branch from URL
      expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/develop.tar.gz')
      expect(result.branch).toBe('develop')
      expect(result.commit).toBe('abc123def456')
    })

    test('config.branch overrides branch from URL', async () => {
      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop',
        branch: 'feature',
        cacheDir: `${testDir}/cache`,
        outDir: testDir,
      }

      const result = await gittar(config)

      // config.branch takes priority
      expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/archive/feature.tar.gz')
      expect(result.branch).toBe('feature')
      expect(result.commit).toBe('abc123def456')
    })

    test('config.branch overrides URL branch for commit check', async () => {
      // Mock getRemoteCommit to return different commits for different branches
      getRemoteCommitSpy.mockImplementation((_url: string, branch: string) => {
        if (branch === 'feature') return Promise.resolve('feature-commit-123')
        if (branch === 'develop') return Promise.resolve('develop-commit-456')
        return Promise.resolve(null)
      })

      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop',
        branch: 'feature',
        cacheDir: `${testDir}/cache`,
        outDir: testDir,
      }

      const result = await gittar(config)

      // Should use feature branch commit, not develop
      expect(result.branch).toBe('feature')
      expect(result.commit).toBe('feature-commit-123')
    })

    test('config.branch overrides URL branch in metadata', async () => {
      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop/src',
        branch: 'release',
        cacheDir: cacheDir,
        update: 'never',
      }

      await gittar(config)

      // Verify metadata stores config.branch, not URL branch
      const metaPath = `${cacheDir}/.gittar-meta.json`
      const metadata = await Bun.file(metaPath).json()
      expect(metadata.branch).toBe('release')
    })

    test('config.branch overrides URL branch when checking cache staleness', async () => {
      const cacheDir = `${testDir}/cache`

      // First download with config.branch overriding URL branch
      getRemoteCommitSpy.mockResolvedValue('commit-v1')
      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop',
        branch: 'release',
        cacheDir: cacheDir,
        update: 'commit',
      }

      const result1 = await gittar(config)
      expect(result1.branch).toBe('release')
      expect(result1.commit).toBe('commit-v1')
      expect(result1.fromCache).toBe(false)

      // Second call - should check staleness using 'release', not 'develop'
      const result2 = await gittar(config)
      expect(result2.branch).toBe('release')
      expect(result2.commit).toBe('commit-v1')
      expect(result2.fromCache).toBe(true)

      // Change commit for release branch
      getRemoteCommitSpy.mockResolvedValue('commit-v2')

      // Third call - should detect stale and re-download using release branch
      const result3 = await gittar(config)
      expect(result3.branch).toBe('release')
      expect(result3.commit).toBe('commit-v2')
      expect(result3.fromCache).toBe(false)
    })

    test('config.branch takes precedence even with subpath in URL', async () => {
      // Create a mock tar with subdirectories for subpath test
      const tempSourceDir = `${tmpdir()}/gittar-branch-subpath-${Date.now()}-${Math.random().toString(36).slice(2)}`
      await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/lib`.quiet()
      await Bun.write(`${tempSourceDir}/test-repo-main/lib/index.ts`, 'export default {}')

      const tarPath = `${tempSourceDir}/test.tar.gz`
      await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

      const tarFile = Bun.file(tarPath)
      const subpathTarData = await tarFile.arrayBuffer()
      await Bun.$`rm -rf ${tempSourceDir}`.quiet()

      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(subpathTarData),
        } as Response)
      )

      const config: Config = {
        url: 'https://github.com/owner/repo/tree/develop/lib',
        branch: 'main',
        cacheDir: `${testDir}/cache`,
        outDir: testDir,
      }

      const result = await gittar(config)

      // config.branch (main) should override URL branch (develop)
      expect(result.branch).toBe('main')
      // subpath should still be extracted from URL
      expect(result.subpath).toBe('lib')
    })

    test('uses fallback main -> master when no branch specified and main fails', async () => {
      // Mock fetch to fail for main, succeed for master
      const fetchMockFallback = mock((url: string) => {
        if (url.includes('/main.tar.gz')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockTarData),
        } as Response)
      })
      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = fetchMockFallback

      const config: Config = {
        url: 'owner/repo',
        cacheDir: `${testDir}/cache`,
        outDir: testDir,
      }

      const result = await gittar(config)

      // Should have tried main first, then master
      expect(fetchMockFallback).toHaveBeenCalledTimes(2)
      expect(fetchMockFallback).toHaveBeenNthCalledWith(1, 'https://github.com/owner/repo/archive/main.tar.gz')
      expect(fetchMockFallback).toHaveBeenNthCalledWith(2, 'https://github.com/owner/repo/archive/master.tar.gz')
      expect(result.branch).toBe('master')
    })

    test('returns correct branch from cache after fallback download', async () => {
      // Mock fetch to fail for main, succeed for master
      const fetchMockFallback = mock((url: string) => {
        if (url.includes('/main.tar.gz')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockTarData),
        } as Response)
      })
      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = fetchMockFallback

      // Mock getRemoteCommit to return null for main, valid for master
      getRemoteCommitSpy.mockImplementation((_url: string, branch: string) => {
        if (branch === 'master') {
          return Promise.resolve('master123commit')
        }
        return Promise.resolve(null)
      })

      const cacheDir = `${testDir}/cache`
      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'never',
      }

      // First download - should fallback to master
      const result1 = await gittar(config)
      expect(result1.branch).toBe('master')
      expect(result1.commit).toBe('master123commit')
      expect(result1.fromCache).toBe(false)

      // Second call - should use cache with master branch
      const result2 = await gittar(config)
      expect(result2.branch).toBe('master')
      expect(result2.commit).toBe('master123commit')
      expect(result2.fromCache).toBe(true)

      // Verify metadata stores correct branch
      const metaPath = `${cacheDir}/.gittar-meta.json`
      const metadata = await Bun.file(metaPath).json()
      expect(metadata.branch).toBe('master')
      expect(metadata.commit).toBe('master123commit')
    })

    test('explicit branch in URL prevents fallback', async () => {
      // Mock fetch to fail for the explicit branch
      const fetchMockNoFallback = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)
      )
      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = fetchMockNoFallback

      const config: Config = {
        url: 'https://github.com/owner/repo/tree/nonexistent',
        outDir: testDir,
      }

      // Should throw because explicit branch doesn't exist and no fallback
      await expect(gittar(config)).rejects.toThrow(URLError)
      // Should only try the explicit branch once
      expect(fetchMockNoFallback).toHaveBeenCalledTimes(1)
      expect(fetchMockNoFallback).toHaveBeenCalledWith('https://github.com/owner/repo/archive/nonexistent.tar.gz')
    })

    test('config.branch prevents fallback', async () => {
      // Mock fetch to fail
      const fetchMockNoFallback = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)
      )
      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = fetchMockNoFallback

      const config: Config = {
        url: 'owner/repo',
        branch: 'nonexistent',
        outDir: testDir,
      }

      // Should throw because explicit branch doesn't exist and no fallback
      await expect(gittar(config)).rejects.toThrow(URLError)
      // Should only try the explicit branch once
      expect(fetchMockNoFallback).toHaveBeenCalledTimes(1)
      expect(fetchMockNoFallback).toHaveBeenCalledWith('https://github.com/owner/repo/archive/nonexistent.tar.gz')
    })

    test('commit check uses correct branch from stale check', async () => {
      const cacheDir = `${testDir}/cache`

      // First, create a cache with master branch
      const fetchMockMaster = mock((url: string) => {
        if (url.includes('/main.tar.gz')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response)
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockTarData),
        } as Response)
      })
      // @ts-expect-error - mock doesn't match full fetch signature
      globalThis.fetch = fetchMockMaster

      getRemoteCommitSpy.mockImplementation((_url: string, branch: string) => {
        if (branch === 'master') return Promise.resolve('commit1')
        return Promise.resolve(null)
      })

      const config: Config = {
        url: 'owner/repo',
        cacheDir: cacheDir,
        update: 'commit',
      }

      const result1 = await gittar(config)
      expect(result1.branch).toBe('master')
      expect(result1.commit).toBe('commit1')

      // Now change the commit for master
      getRemoteCommitSpy.mockImplementation((_url: string, branch: string) => {
        if (branch === 'master') return Promise.resolve('commit2')
        return Promise.resolve(null)
      })

      // Should detect stale and re-download
      const result2 = await gittar(config)
      expect(result2.branch).toBe('master')
      expect(result2.commit).toBe('commit2')
      expect(result2.fromCache).toBe(false)
    })
  })
})
