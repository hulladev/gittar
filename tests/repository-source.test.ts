import { describe, expect, test } from 'bun:test'
import { parseRepository } from '../src/index'

describe('repository source identity', () => {
  test('changing the revision retains repository and subdirectory identity', () => {
    const branch = parseRepository('https://github.com/acme/components/tree/master/generated')!
    const tag = parseRepository('https://github.com/acme/components/tree/v1.2.3/generated')!
    expect(branch).toEqual({ repository: 'https://github.com/acme/components', subpath: 'generated', ref: 'master' })
    expect(tag.repository).toBe(branch.repository)
    expect(tag.subpath).toBe(branch.subpath)
    expect(tag.ref).toBe('v1.2.3')
    expect(parseRepository('https://github.com/acme/components/tree/v1.2.3/another')?.subpath).not.toBe(tag.subpath)
    expect(parseRepository('https://codeberg.org/acme/components/src/v1.2.3/generated')?.repository).not.toBe(
      tag.repository
    )
  })

  test('normalizes repository spellings and honours explicit source options', () => {
    const expected = { repository: 'https://github.com/acme/components', subpath: '', ref: 'main' }
    for (const source of [
      'acme/components',
      'git@github.com:acme/components.git',
      'https://github.com/acme/components.git',
    ])
      expect(parseRepository(source)).toEqual(expected)
    expect(
      parseRepository({
        url: 'https://gitlab.com/acme/components/tree/old/generated',
        branch: 'new',
        subpath: './other/',
      })
    ).toEqual({ repository: 'https://gitlab.com/acme/components', subpath: 'other', ref: 'new' })
    expect(parseRepository('invalid')).toBeNull()
  })
})
