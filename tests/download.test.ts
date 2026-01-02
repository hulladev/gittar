import { test, expect, describe, mock, beforeEach } from 'bun:test'
import { downloadTar } from '../src/download'
import { URLError } from '../src/errors'
import type { Config } from '../src/types.public'

describe('downloadTar', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  test('downloads successfully with specified branch', async () => {
    const mockData = new ArrayBuffer(8)
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
      branch: 'develop',
    }

    const result = await downloadTar(config)

    expect(result).toBe(mockData)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith('https://github.com/owner/repo/archive/develop.tar.gz')

    globalThis.fetch = originalFetch
  })

  test('falls back from main to master on 404', async () => {
    const mockData = new ArrayBuffer(8)
    let callCount = 0

    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      } as Response)
    })

    const config: Config = {
      url: 'owner/repo',
    }

    const result = await downloadTar(config)

    expect(result).toBe(mockData)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'https://github.com/owner/repo/archive/main.tar.gz')
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://github.com/owner/repo/archive/master.tar.gz')

    globalThis.fetch = originalFetch
  })

  test('succeeds on first branch attempt', async () => {
    const mockData = new ArrayBuffer(8)
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
    }

    const result = await downloadTar(config)

    expect(result).toBe(mockData)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    globalThis.fetch = originalFetch
  })

  test('throws URLError when all branches fail', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
    }

    await expect(downloadTar(config)).rejects.toThrow(URLError)
    await expect(downloadTar(config)).rejects.toThrow('Failed to download tar: 404 Not Found')

    globalThis.fetch = originalFetch
  })

  test('throws URLError on non-404 HTTP error', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
      branch: 'develop',
    }

    await expect(downloadTar(config)).rejects.toThrow(URLError)
    await expect(downloadTar(config)).rejects.toThrow('Failed to download tar: 500')

    globalThis.fetch = originalFetch
  })

  test('throws URLError on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')))

    const config: Config = {
      url: 'owner/repo',
    }

    await expect(downloadTar(config)).rejects.toThrow(URLError)
    await expect(downloadTar(config)).rejects.toThrow('Network error downloading tar')

    globalThis.fetch = originalFetch
  })

  test('throws URLError for unsupported platform', async () => {
    const config: Config = {
      url: 'https://dev.azure.com/owner/project/_git/repo',
    }

    await expect(downloadTar(config)).rejects.toThrow(URLError)
    await expect(downloadTar(config)).rejects.toThrow('Unsupported platform for URL')
  })

  test('handles custom branch without fallback', async () => {
    const mockData = new ArrayBuffer(8)
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      } as Response)
    )

    const config: Config = {
      url: 'https://gitlab.com/owner/repo',
      branch: 'feature-branch',
    }

    const result = await downloadTar(config)

    expect(result).toBe(mockData)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://gitlab.com/owner/repo/-/archive/feature-branch/repo-feature-branch.tar.gz'
    )

    globalThis.fetch = originalFetch
  })

  test('throws URLError when custom branch not found', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
      branch: 'nonexistent-branch',
    }

    await expect(downloadTar(config)).rejects.toThrow(URLError)
    await expect(downloadTar(config)).rejects.toThrow('404 Not Found (branch: nonexistent-branch)')

    globalThis.fetch = originalFetch
  })

  test('preserves URLError when re-thrown', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response)
    )

    const config: Config = {
      url: 'owner/repo',
    }

    try {
      await downloadTar(config)
    } catch (error) {
      expect(error).toBeInstanceOf(URLError)
      expect((error as URLError).message).toContain('403 Forbidden')
    }

    globalThis.fetch = originalFetch
  })
})
