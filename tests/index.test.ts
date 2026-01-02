import { test, expect, describe } from 'bun:test'
import gittar from '../src/index'
import { getTarUrl, URLError, FSError, GittarError } from '../src/index'
import type { Config } from '../src/index'

describe('index exports', () => {
  test('exports gittar as default', () => {
    expect(gittar).toBeDefined()
    expect(typeof gittar).toBe('function')
  })

  test('exports getTarUrl as named export', () => {
    expect(getTarUrl).toBeDefined()
    expect(typeof getTarUrl).toBe('function')
  })

  test('exports error classes as named exports', () => {
    expect(URLError).toBeDefined()
    expect(FSError).toBeDefined()
    expect(GittarError).toBeDefined()
  })

  test('Config type is available', () => {
    const config: Config = {
      url: 'owner/repo',
    }
    expect(config).toBeDefined()
    expect(config.url).toBe('owner/repo')
  })

  test('default export is the gittar function', () => {
    expect(gittar.name).toBe('gittar')
  })
})
