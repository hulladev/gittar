import { test, expect, describe } from 'bun:test'
import { homedir } from 'os'
import { parseRepoInfo, getCacheDir } from '../src/utils'
import { URLError } from '../src/errors'
import type { Config } from '../src/types.public'

describe('parseRepoInfo', () => {
  test('parses GitHub URL', () => {
    const result = parseRepoInfo('https://github.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('parses short format', () => {
    const result = parseRepoInfo('owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('parses SSH format', () => {
    const result = parseRepoInfo('git@github.com:owner/repo.git')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('parses GitLab URL', () => {
    const result = parseRepoInfo('https://gitlab.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('parses tree URL', () => {
    const result = parseRepoInfo('https://github.com/owner/repo/tree/branch')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('throws URLError for invalid input', () => {
    expect(() => parseRepoInfo('invalid')).toThrow(URLError)
    expect(() => parseRepoInfo('invalid')).toThrow('Failed to parse repository URL: invalid')
  })

  test('throws URLError for single segment', () => {
    expect(() => parseRepoInfo('owner')).toThrow(URLError)
  })

  test('handles repo names with special characters', () => {
    const result = parseRepoInfo('owner/my-awesome_repo.js')
    expect(result).toEqual({ owner: 'owner', repo: 'my-awesome_repo.js' })
  })
})

describe('getCacheDir', () => {
  test('uses cachedir when provided', () => {
    const config: Config = {
      url: 'owner/repo',
      cachedir: '/custom/cache',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    expect(result).toBe('/custom/cache')
  })

  test('uses outdir when cachedir not provided', () => {
    const config: Config = {
      url: 'owner/repo',
      outdir: '/custom/output',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    expect(result).toBe('/custom/output')
  })

  test('uses default path when neither cachedir nor outdir provided', () => {
    const config: Config = {
      url: 'owner/repo',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    expect(result).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)
  })

  test('prioritizes cachedir over outdir', () => {
    const config: Config = {
      url: 'owner/repo',
      cachedir: '/custom/cache',
      outdir: '/custom/output',
    }
    const result = getCacheDir(config, 'owner', 'repo')
    expect(result).toBe('/custom/cache')
  })

  test('handles different owner/repo combinations', () => {
    const config: Config = {
      url: 'owner/repo',
    }

    const result1 = getCacheDir(config, 'user1', 'project1')
    expect(result1).toBe(`${homedir()}/.cache/hulla/gittar/user1/project1`)

    const result2 = getCacheDir(config, 'user2', 'project2')
    expect(result2).toBe(`${homedir()}/.cache/hulla/gittar/user2/project2`)
  })

  test('uses empty strings for cachedir and outdir', () => {
    const config1: Config = {
      url: 'owner/repo',
      cachedir: '',
    }
    const result1 = getCacheDir(config1, 'owner', 'repo')
    expect(result1).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)

    const config2: Config = {
      url: 'owner/repo',
      outdir: '',
    }
    const result2 = getCacheDir(config2, 'owner', 'repo')
    expect(result2).toBe(`${homedir()}/.cache/hulla/gittar/owner/repo`)
  })
})
