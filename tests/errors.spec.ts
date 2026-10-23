import { describe, expect, it } from 'vitest'
import { localizeBuildError, localizeSaveError } from '../src/client/errors.ts'
import { zh } from '../src/client/locales.ts'
import { t } from './sample.ts'

describe('localizeBuildError', () => {
  it('translates the host codes', () => {
    expect(localizeBuildError('CHART_NO_LOG|', t)).toBe(zh['error.noLog'])
    expect(localizeBuildError('CHART_ABORTED|', t)).toBe(zh['error.aborted'])
    expect(localizeBuildError('CHART_BAD_LOG|', t)).toBe(zh['error.badLog'])
    expect(localizeBuildError('CHART_UNREADABLE|', t)).toBe(zh['error.unreadable'])
  })

  it('passes an unexpected message through untouched', () => {
    expect(localizeBuildError('EACCES: permission denied', t)).toBe('EACCES: permission denied')
  })
})

describe('localizeSaveError', () => {
  it('names the existing skill and its path', () => {
    expect(localizeSaveError('CHART_EXISTS|~/.dsh/skills/alpha/SKILL.md|alpha', t))
      .toBe(zh['error.exists'].replace('{name}', 'alpha'))
  })

  it('explains each frontmatter problem in plain words', () => {
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|no-frontmatter', t)).toBe(zh['error.noFrontmatter'])
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|bad-yaml', t)).toBe(zh['error.badYaml'])
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|missing-name', t)).toBe(zh['error.missingName'])
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|missing-description', t)).toBe(zh['error.missingDescription'])
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|bad-name', t)).toBe(zh['error.badNameInFile'])
    expect(localizeSaveError('CHART_BAD_FRONTMATTER|something-new', t)).toBe(zh['error.unknown'].replace('{message}', 'CHART_BAD_FRONTMATTER|something-new'))
  })

  it('keeps the remaining host codes readable', () => {
    expect(localizeSaveError('CHART_BAD_NAME|', t)).toBe(zh['error.badName'])
    expect(localizeSaveError('CHART_NAME_MISMATCH|', t)).toBe(zh['error.nameMismatch'])
    expect(localizeSaveError('CHART_NO_DESCRIPTION|', t)).toBe(zh['error.missingDescription'])
    expect(localizeSaveError('CHART_WRITE_FAILED|EACCES|denied', t))
      .toBe(zh['error.writeFailed'].replace('{message}', 'EACCES|denied'))
    expect(localizeSaveError('CHART_LIBRARY_FAILED|EIO', t))
      .toBe(zh['error.library'].replace('{message}', 'EIO'))
  })

  it('passes an unexpected message through untouched', () => {
    expect(localizeSaveError('spawn failed', t)).toBe('spawn failed')
  })
})
