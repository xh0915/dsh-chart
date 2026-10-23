/**
 * dsh-chart — Host error codes, translated in the browser.
 *
 * The host answers in stable `CHART_…|detail` codes instead of prose, so the
 * view can show the same failure in the user's language while still surfacing
 * the raw detail for anything unexpected.
 */
import type { Translate } from './locales.ts'

/** Split `CODE|detail|detail` without losing pipes inside the detail. */
function parts(message: string): { code: string; rest: string[] } {
  const [code = '', ...rest] = message.split('|')
  return { code, rest }
}

/** Translate a `chart.build` failure; unknown messages pass through. */
export function localizeBuildError(message: string, t: Translate): string {
  const { code } = parts(message)
  switch (code) {
    case 'CHART_NO_LOG': return t('error.noLog')
    case 'CHART_ABORTED': return t('error.aborted')
    case 'CHART_BAD_LOG': return t('error.badLog')
    case 'CHART_UNREADABLE': return t('error.unreadable')
    default: return message
  }
}

/** Translate a `chart.save` failure; unknown messages pass through. */
export function localizeSaveError(message: string, t: Translate): string {
  const { code, rest } = parts(message)
  switch (code) {
    case 'CHART_EXISTS': return t('error.exists', { name: rest[1] ?? '' })
    case 'CHART_BAD_NAME': return t('error.badName')
    case 'CHART_BAD_FRONTMATTER': {
      switch (rest[0]) {
        case 'no-frontmatter': return t('error.noFrontmatter')
        case 'bad-yaml': return t('error.badYaml')
        case 'missing-name': return t('error.missingName')
        case 'missing-description': return t('error.missingDescription')
        case 'bad-name': return t('error.badNameInFile')
        default: return t('error.unknown', { message: message })
      }
    }
    case 'CHART_NAME_MISMATCH': return t('error.nameMismatch')
    case 'CHART_NO_DESCRIPTION': return t('error.missingDescription')
    case 'CHART_WRITE_FAILED': return t('error.writeFailed', { message: rest.join('|') })
    case 'CHART_LIBRARY_FAILED': return t('error.library', { message: rest.join('|') })
    default: return message
  }
}
