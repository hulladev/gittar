import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { tmpdir } from 'os'
import { extractTar } from '../src/extract'
import { FSError } from '../src/errors'

describe('extractTar', () => {
  let testDir: string
  let tarData: ArrayBuffer

  beforeEach(async () => {
    testDir = `${tmpdir()}/gittar-extract-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const tempSourceDir = `${tmpdir()}/gittar-source-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/file1.txt`, 'content1')
    await Bun.write(`${tempSourceDir}/test-repo-main/file2.txt`, 'content2')
    await Bun.$`mkdir -p ${tempSourceDir}/test-repo-main/subdir`.quiet()
    await Bun.write(`${tempSourceDir}/test-repo-main/subdir/file3.txt`, 'content3')

    const tarPath = `${tempSourceDir}/test.tar.gz`
    await Bun.$`tar -czf ${tarPath} -C ${tempSourceDir} test-repo-main`.quiet()

    const tarFile = Bun.file(tarPath)
    tarData = await tarFile.arrayBuffer()

    await Bun.$`rm -rf ${tempSourceDir}`.quiet()
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet()
  })

  test('extracts sorted paths and intact contents without the archive root', async () => {
    const result = await extractTar(tarData, testDir)

    expect(result).toEqual([`${testDir}/file1.txt`, `${testDir}/file2.txt`, `${testDir}/subdir/file3.txt`])
    expect(await Bun.file(`${testDir}/file1.txt`).text()).toBe('content1')
    expect(await Bun.file(`${testDir}/file2.txt`).text()).toBe('content2')
    expect(await Bun.file(`${testDir}/subdir/file3.txt`).text()).toBe('content3')
    expect(await Bun.file(`${testDir}/test-repo-main`).exists()).toBe(false)
  })

  test('creates output directory if it does not exist', async () => {
    const nestedDir = `${testDir}/nested/path/to/output`
    await extractTar(tarData, nestedDir)

    const file1Exists = await Bun.file(`${nestedDir}/file1.txt`).exists()
    expect(file1Exists).toBe(true)
  })

  test('throws FSError on invalid tar data', async () => {
    const invalidData = new ArrayBuffer(8)

    await expect(extractTar(invalidData, testDir)).rejects.toThrow(FSError)
    await expect(extractTar(invalidData, testDir)).rejects.toThrow(`Failed to extract tar to ${testDir}`)
  })

  test('handles extraction to existing directory', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/existing.txt`, 'existing content')

    const result = await extractTar(tarData, testDir)

    expect(result.length).toBe(4)

    const existingFileExists = await Bun.file(`${testDir}/existing.txt`).exists()
    expect(existingFileExists).toBe(true)

    const extractedFileExists = await Bun.file(`${testDir}/file1.txt`).exists()
    expect(extractedFileExists).toBe(true)
  })

  test('overwrites existing files with same name', async () => {
    await Bun.$`mkdir -p ${testDir}`.quiet()
    await Bun.write(`${testDir}/file1.txt`, 'old content')

    await extractTar(tarData, testDir)

    const content = await Bun.file(`${testDir}/file1.txt`).text()
    expect(content).toBe('content1')
  })

  test('cleans up temporary file on success', async () => {
    await extractTar(tarData, testDir)

    const tmpFiles = await Bun.$`ls ${tmpdir()} | grep gittar-`.text()
    const hasTarFiles = tmpFiles.includes('.tar.gz')

    expect(hasTarFiles).toBe(false)
  })
})
