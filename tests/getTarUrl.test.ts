import { test, expect, describe } from 'bun:test'
import { getTarUrl, parseInput } from '../src/getTarUrl'

describe('getTarUrl', () => {
  describe('GitHub', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://github.com/owner/repo')
      expect(url).toBe('https://github.com/owner/repo/archive/main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://github.com/owner/repo', 'develop')
      expect(url).toBe('https://github.com/owner/repo/archive/develop.tar.gz')
    })

    test('tree URL extracts branch from path', () => {
      const url = getTarUrl('https://github.com/owner/repo/tree/feature-branch')
      expect(url).toBe('https://github.com/owner/repo/archive/feature-branch.tar.gz')
    })

    test('blob URL extracts branch from path', () => {
      const url = getTarUrl('https://github.com/owner/repo/blob/dev/src/file.ts')
      expect(url).toBe('https://github.com/owner/repo/archive/dev.tar.gz')
    })

    test('short format defaults to github', () => {
      const url = getTarUrl('owner/repo')
      expect(url).toBe('https://github.com/owner/repo/archive/main.tar.gz')
    })

    test('short format with custom branch', () => {
      const url = getTarUrl('owner/repo', 'master')
      expect(url).toBe('https://github.com/owner/repo/archive/master.tar.gz')
    })

    test('SSH format', () => {
      const url = getTarUrl('git@github.com:owner/repo.git')
      expect(url).toBe('https://github.com/owner/repo/archive/main.tar.gz')
    })

    test('SSH format with custom branch', () => {
      const url = getTarUrl('git@github.com:owner/repo.git', 'develop')
      expect(url).toBe('https://github.com/owner/repo/archive/develop.tar.gz')
    })
  })

  describe('GitLab', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://gitlab.com/owner/repo')
      expect(url).toBe('https://gitlab.com/owner/repo/-/archive/main/repo-main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://gitlab.com/owner/repo', 'develop')
      expect(url).toBe('https://gitlab.com/owner/repo/-/archive/develop/repo-develop.tar.gz')
    })

    test('tree URL extracts branch from path', () => {
      const url = getTarUrl('https://gitlab.com/owner/repo/tree/feature')
      expect(url).toBe('https://gitlab.com/owner/repo/-/archive/feature/repo-feature.tar.gz')
    })

    test('SSH format', () => {
      const url = getTarUrl('git@gitlab.com:owner/repo.git')
      expect(url).toBe('https://gitlab.com/owner/repo/-/archive/main/repo-main.tar.gz')
    })
  })

  describe('Bitbucket', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://bitbucket.org/owner/repo')
      expect(url).toBe('https://bitbucket.org/owner/repo/get/main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://bitbucket.org/owner/repo', 'develop')
      expect(url).toBe('https://bitbucket.org/owner/repo/get/develop.tar.gz')
    })

    test('src URL extracts branch from path', () => {
      const url = getTarUrl('https://bitbucket.org/owner/repo/src/feature')
      expect(url).toBe('https://bitbucket.org/owner/repo/get/feature.tar.gz')
    })

    test('SSH format', () => {
      const url = getTarUrl('git@bitbucket.org:owner/repo.git')
      expect(url).toBe('https://bitbucket.org/owner/repo/get/main.tar.gz')
    })
  })

  describe('Codeberg', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://codeberg.org/owner/repo')
      expect(url).toBe('https://codeberg.org/owner/repo/archive/main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://codeberg.org/owner/repo', 'develop')
      expect(url).toBe('https://codeberg.org/owner/repo/archive/develop.tar.gz')
    })

    test('SSH format', () => {
      const url = getTarUrl('git@codeberg.org:owner/repo.git')
      expect(url).toBe('https://codeberg.org/owner/repo/archive/main.tar.gz')
    })
  })

  describe('Gitea', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://gitea.example.com/owner/repo')
      expect(url).toBe('https://gitea.example.com/owner/repo/archive/main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://gitea.example.com/owner/repo', 'develop')
      expect(url).toBe('https://gitea.example.com/owner/repo/archive/develop.tar.gz')
    })
  })

  describe('Forgejo', () => {
    test('full URL with default branch', () => {
      const url = getTarUrl('https://forgejo.example.com/owner/repo')
      expect(url).toBe('https://forgejo.example.com/owner/repo/archive/main.tar.gz')
    })

    test('full URL with custom branch', () => {
      const url = getTarUrl('https://forgejo.example.com/owner/repo', 'develop')
      expect(url).toBe('https://forgejo.example.com/owner/repo/archive/develop.tar.gz')
    })
  })

  describe('Azure DevOps', () => {
    test('returns null for unsupported platform', () => {
      const url = getTarUrl('https://dev.azure.com/owner/project/_git/repo')
      expect(url).toBe(null)
    })
  })

  describe('Invalid inputs', () => {
    test('returns null for invalid format', () => {
      const url = getTarUrl('invalid')
      expect(url).toBe(null)
    })

    test('returns null for unknown platform', () => {
      const url = getTarUrl('https://unknown-git-host.com/owner/repo')
      expect(url).toBe(null)
    })
  })
})

describe('parseInput', () => {
  describe('SSH format', () => {
    test('parses valid SSH format', () => {
      const parsed = parseInput('git@github.com:owner/repo.git')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('parses SSH format with custom branch', () => {
      const parsed = parseInput('git@github.com:owner/repo.git', 'develop')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'develop',
      })
    })

    test('handles SSH format without .git extension', () => {
      const parsed = parseInput('git@github.com:owner/repo')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('returns null for invalid SSH format', () => {
      const parsed = parseInput('git@invalid')
      expect(parsed).toBe(null)
    })
  })

  describe('Short format', () => {
    test('parses valid short format', () => {
      const parsed = parseInput('owner/repo')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('parses short format with custom branch', () => {
      const parsed = parseInput('owner/repo', 'develop')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'develop',
      })
    })

    test('returns null for single segment', () => {
      const parsed = parseInput('owner')
      expect(parsed).toBe(null)
    })
  })

  describe('URL format', () => {
    test('parses basic URL', () => {
      const parsed = parseInput('https://github.com/owner/repo')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('parses URL with custom branch', () => {
      const parsed = parseInput('https://github.com/owner/repo', 'develop')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'develop',
      })
    })

    test('extracts branch from tree URL', () => {
      const parsed = parseInput('https://github.com/owner/repo/tree/feature-branch')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'feature-branch',
      })
    })

    test('extracts branch from blob URL', () => {
      const parsed = parseInput('https://github.com/owner/repo/blob/dev/src/file.ts')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'dev',
        subpath: 'src/file.ts',
      })
    })

    test('extracts branch from src URL (Bitbucket)', () => {
      const parsed = parseInput('https://bitbucket.org/owner/repo/src/feature')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'bitbucket.org',
        ref: 'feature',
      })
    })

    test('extracts branch from browse URL', () => {
      const parsed = parseInput('https://bitbucket.org/owner/repo/browse/feature')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'bitbucket.org',
        ref: 'feature',
      })
    })

    test('returns null for URL with insufficient path segments', () => {
      const parsed = parseInput('https://github.com/owner')
      expect(parsed).toBe(null)
    })
  })

  describe('Edge cases', () => {
    test('handles repo names with hyphens', () => {
      const parsed = parseInput('owner/my-awesome-repo')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'my-awesome-repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('handles repo names with underscores', () => {
      const parsed = parseInput('owner/my_repo')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'my_repo',
        hostname: 'github.com',
        ref: 'main',
      })
    })

    test('handles branch names with slashes', () => {
      const parsed = parseInput('https://github.com/owner/repo/tree/feature/subfeature')
      expect(parsed).toEqual({
        owner: 'owner',
        repo: 'repo',
        hostname: 'github.com',
        ref: 'feature',
        subpath: 'subfeature',
      })
    })
  })
})
