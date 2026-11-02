import { test, expect, describe } from 'bun:test'
import { homedir } from 'os'
import { parseRepoInfo, getCacheDir } from '../src/utils'
import { URLError } from '../src/errors'
import type { Config } from '../src/types.public'

describe('parseRepoInfo', () => {
  test('parses GitHub URL (no explicit branch)', () => {
    const result = parseRepoInfo('https://github.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined })
  })

  test('parses short format (no explicit branch)', () => {
    const result = parseRepoInfo('owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined })
  })

  test('parses SSH format (no explicit branch)', () => {
    const result = parseRepoInfo('git@github.com:owner/repo.git')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined })
  })

  test('parses GitLab URL (no explicit branch)', () => {
    const result = parseRepoInfo('https://gitlab.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined })
  })

  test('parses tree URL with branch', () => {
    const result = parseRepoInfo('https://github.com/owner/repo/tree/develop')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'develop', subpath: undefined })
  })

  test('parses tree URL with branch and subpath', () => {
    const result = parseRepoInfo('https://github.com/owner/repo/tree/master/src/components')
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'master', subpath: 'src/components' })
  })

  test('throws URLError for invalid input', () => {
    expect(() => parseRepoInfo('invalid')).toThrow(URLError)
    expect(() => parseRepoInfo('invalid')).toThrow('Failed to parse repository URL: invalid')
  })

  test('handles repo names with special characters (no explicit branch)', () => {
    const result = parseRepoInfo('owner/my-awesome_repo.js')
    expect(result).toEqual({ owner: 'owner', repo: 'my-awesome_repo.js', branch: undefined, subpath: undefined })
  })
})

describe('getCacheDir', () => {
  test('uses default path when only outDir provided (outDir does not affect cacheDir)', () => {
    const config: Config = {
      url: 'owner/repo',
      outDir: '/custom/output',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    // getCacheDir only uses cacheDir, not outDir
    expect(result).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)
  })

  test('prioritizes cachedir over outdir', () => {
    const config: Config = {
      url: 'owner/repo',
      cacheDir: '/custom/cache',
      outDir: '/custom/output',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    expect(result).toBe('/custom/cache')
  })

  test('uses empty strings for cachedir and outdir', () => {
    const config1: Config = {
      url: 'owner/repo',
      cacheDir: '',
    }
    const result1 = getCacheDir(config1, 'owner', 'repo')
    expect(result1).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)

    const config2: Config = {
      url: 'owner/repo',
      outDir: '',
    }
    const result2 = getCacheDir(config2, 'owner', 'repo')
    expect(result2).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)
  })
})
