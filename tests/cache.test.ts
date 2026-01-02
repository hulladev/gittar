import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { tmpdir } from 'os'
import { checkCache, copyFiles } from '../src/cache'

describe('checkCache', () => {
  let testDir: string

  beforeEach(() => {
    testDir = `${tmpdir()}/gittar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet()
  })

  test('returns null when cache directory does not exist', async () => {
    const result = await checkCache(`${testDir}/nonexistent`)
    expect(result).toBe(null)
  })

  test('returns empty array when cache directory exists but is empty', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    const result = await checkCache(testDir)
    expect(result).toEqual([])
  })

  test('returns sorted list of files when cache exists', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/file1.txt`, 'content1')
    await Bun.write(`${testDir}/file2.txt`, 'content2')
    await Bun.$`mkdir -p ${testDir}/subdir`.quiet()
    await Bun.write(`${testDir}/subdir/file3.txt`, 'content3')

    const result = await checkCache(testDir)

    expect(result).toEqual([`${testDir}/file1.txt`, `${testDir}/file2.txt`, `${testDir}/subdir/file3.txt`])
  })

  test('only includes files, not directories', async () => {
    await Bun.$`mkdir -p ${testDir}/dir1/dir2`.quiet()
    await Bun.write(`${testDir}/file.txt`, 'content')
    await Bun.write(`${testDir}/dir1/file.txt`, 'content')

    const result = await checkCache(testDir)

    expect(result).toEqual([`${testDir}/dir1/file.txt`, `${testDir}/file.txt`])
  })

  test('handles nested directory structures', async () => {
    await Bun.$`mkdir -p ${testDir}/a/b/c`.quiet()
    await Bun.write(`${testDir}/a/file1.txt`, 'content')
    await Bun.write(`${testDir}/a/b/file2.txt`, 'content')
    await Bun.write(`${testDir}/a/b/c/file3.txt`, 'content')

    const result = await checkCache(testDir)

    expect(result).toEqual([`${testDir}/a/b/c/file3.txt`, `${testDir}/a/b/file2.txt`, `${testDir}/a/file1.txt`])
  })

  test('returns sorted results', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/z.txt`, 'content')
    await Bun.write(`${testDir}/a.txt`, 'content')
    await Bun.write(`${testDir}/m.txt`, 'content')

    const result = await checkCache(testDir)

    expect(result).toEqual([`${testDir}/a.txt`, `${testDir}/m.txt`, `${testDir}/z.txt`])
  })

  test('handles files with various extensions', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/file.js`, 'content')
    await Bun.write(`${testDir}/file.ts`, 'content')
    await Bun.write(`${testDir}/file.json`, 'content')
    await Bun.write(`${testDir}/README.md`, 'content')

    const result = await checkCache(testDir)

    expect(result?.length).toBe(4)
    expect(result?.every((f) => f.startsWith(testDir))).toBe(true)
  })

  test('does not include hidden files by default', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/.hidden`, 'content')
    await Bun.write(`${testDir}/visible.txt`, 'content')

    const result = await checkCache(testDir)

    expect(result).not.toContain(`${testDir}/.hidden`)
    expect(result).toContain(`${testDir}/visible.txt`)
    expect(result?.length).toBe(1)
  })
})

describe('copyFiles', () => {
  let testDir: string
  let sourceDir: string
  let destDir: string

  beforeEach(() => {
    testDir = `${tmpdir()}/gittar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sourceDir = `${testDir}/source`
    destDir = `${testDir}/dest`
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet()
  })

  test('copies all files from source to destination', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()
    await Bun.write(`${sourceDir}/file1.txt`, 'content1')
    await Bun.write(`${sourceDir}/file2.txt`, 'content2')

    const result = await copyFiles(sourceDir, destDir)

    expect(result).toEqual([`${destDir}/file1.txt`, `${destDir}/file2.txt`])

    const file1Content = await Bun.file(`${destDir}/file1.txt`).text()
    const file2Content = await Bun.file(`${destDir}/file2.txt`).text()

    expect(file1Content).toBe('content1')
    expect(file2Content).toBe('content2')
  })

  test('copies nested directory structures', async () => {
    await Bun.$`mkdir -p ${sourceDir}/a/b/c`.quiet()
    await Bun.write(`${sourceDir}/file1.txt`, 'root')
    await Bun.write(`${sourceDir}/a/file2.txt`, 'a')
    await Bun.write(`${sourceDir}/a/b/file3.txt`, 'b')
    await Bun.write(`${sourceDir}/a/b/c/file4.txt`, 'c')

    const result = await copyFiles(sourceDir, destDir)

    expect(result.length).toBe(4)
    expect(result).toContain(`${destDir}/file1.txt`)
    expect(result).toContain(`${destDir}/a/file2.txt`)
    expect(result).toContain(`${destDir}/a/b/file3.txt`)
    expect(result).toContain(`${destDir}/a/b/c/file4.txt`)

    const fileContent = await Bun.file(`${destDir}/a/b/c/file4.txt`).text()
    expect(fileContent).toBe('c')
  })

  test('creates destination directory if it does not exist', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()
    await Bun.write(`${sourceDir}/file.txt`, 'content')

    const result = await copyFiles(sourceDir, destDir)

    expect(result).toEqual([`${destDir}/file.txt`])

    const { exitCode } = await Bun.$`test -d ${destDir}`.nothrow().quiet()
    expect(exitCode).toBe(0)
  })

  test('overwrites existing files in destination', async () => {
    await Bun.$`mkdir -p ${sourceDir} ${destDir}`.quiet()
    await Bun.write(`${sourceDir}/file.txt`, 'new content')
    await Bun.write(`${destDir}/file.txt`, 'old content')

    await copyFiles(sourceDir, destDir)

    const content = await Bun.file(`${destDir}/file.txt`).text()
    expect(content).toBe('new content')
  })

  test('returns sorted list of destination file paths', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()
    await Bun.write(`${sourceDir}/z.txt`, 'z')
    await Bun.write(`${sourceDir}/a.txt`, 'a')
    await Bun.write(`${sourceDir}/m.txt`, 'm')

    const result = await copyFiles(sourceDir, destDir)

    expect(result).toEqual([`${destDir}/a.txt`, `${destDir}/m.txt`, `${destDir}/z.txt`])
  })

  test('handles empty source directory', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()

    const result = await copyFiles(sourceDir, destDir)

    expect(result).toEqual([])

    const { exitCode } = await Bun.$`test -d ${destDir}`.nothrow().quiet()
    expect(exitCode).toBe(0)
  })

  test('preserves file permissions and attributes', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()
    await Bun.write(`${sourceDir}/executable.sh`, '#!/bin/bash\necho "test"')
    await Bun.$`chmod +x ${sourceDir}/executable.sh`.quiet()

    await copyFiles(sourceDir, destDir)

    const { exitCode } = await Bun.$`test -x ${destDir}/executable.sh`.nothrow().quiet()
    expect(exitCode).toBe(0)
  })

  test('does not include hidden files by default', async () => {
    await Bun.$`mkdir -p ${sourceDir}`.quiet()
    await Bun.write(`${sourceDir}/.hidden`, 'hidden')
    await Bun.write(`${sourceDir}/visible.txt`, 'visible')

    const result = await copyFiles(sourceDir, destDir)

    expect(result).not.toContain(`${destDir}/.hidden`)
    expect(result).toContain(`${destDir}/visible.txt`)
    expect(result.length).toBe(1)
  })
})
