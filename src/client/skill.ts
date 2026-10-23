/**
 * dsh-chart — The draft writer.
 *
 * Turns a ChartDraft into a real SKILL.md: YAML frontmatter the harness can
 * parse, then plain Markdown a person can read and edit. The builder never adds
 * a claim the draft does not carry — an empty section says it is empty.
 */
import type { ChartDraft } from '../schema.ts'
import type { Translate } from './locales.ts'

/** Which sections the user wants in the generated file. */
export interface DraftOptions {
  readonly name: string
  readonly includeGoal: boolean
  readonly includeBefore: boolean
  readonly includeSteps: boolean
  readonly includeChecks: boolean
  readonly includeFiles: boolean
  readonly includePitfalls: boolean
}

/** Collapse line breaks for a heading or a one-line label. */
function oneLine(value: string, limit: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(0, limit - 1))}…`
}

/** Inline code that survives backticks inside the value. */
function code(value: string): string {
  const runs = value.match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  const fence = '`'.repeat(longest + 1)
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${value}${pad}${fence}`
}

/** A fence longer than any backtick run inside the block. */
function fenceFor(value: string): string {
  const runs = value.match(/`+/g) ?? []
  return '`'.repeat(Math.max(2, ...runs.map((run) => run.length)) + 1)
}

/** Language tag for a fenced command block, when the session used one shell. */
function shellTag(draft: ChartDraft): string {
  const pwsh = draft.environment.shells.includes('pwsh')
  const bash = draft.environment.shells.includes('bash')
  if (pwsh && !bash) return 'powershell'
  if (bash && !pwsh) return 'bash'
  return ''
}

/** A local wall clock, stable enough for a provenance line. */
export function stamp(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The heading title, localized when the session left none. */
export function draftTitle(draft: ChartDraft, t: Translate): string {
  return draft.title === '' ? t('draft.untitled') : draft.title
}

/** Build the complete SKILL.md the user will edit and save. */
export function buildSkillMarkdown(draft: ChartDraft, t: Translate, options: DraftOptions): string {
  const basis = oneLine(draft.goal !== '' ? draft.goal : draftTitle(draft, t), 120)
  const description = oneLine(t('draft.description', { goal: basis }), 600)
  const lines: string[] = [
    '---',
    `name: ${options.name}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    `# ${draftTitle(draft, t)}`,
    '',
    `> ${t('draft.intro', {
      session: draft.sessionId,
      turns: String(draft.counts.turns),
      events: String(draft.counts.rawEvents),
    })}`,
    ...(draft.truncated ? [`> ${t('note.truncated')}`] : []),
    '',
  ]

  if (options.includeGoal && draft.goal !== '') {
    lines.push(`## ${t('section.goal')}`, '', draft.goal, '')
  }

  if (options.includeBefore) {
    const facts: string[] = []
    if (draft.cwd !== '') facts.push(`- **${t('prereq.cwd')}** — ${code(draft.cwd)}`)
    const platformKey = draft.environment.platform === 'win32'
      ? 'platform.win32'
      : draft.environment.platform === 'darwin'
        ? 'platform.darwin'
        : draft.environment.platform === 'linux' ? 'platform.linux' : undefined
    facts.push(`- **${t('prereq.platform')}** — ${platformKey === undefined ? draft.environment.platform : t(platformKey)}`)
    if (draft.environment.shells.length > 0) {
      facts.push(`- **${t('prereq.shell')}** — ${draft.environment.shells.map((shell) => (shell === 'pwsh' ? t('shell.pwsh') : shell === 'bash' ? t('shell.bash') : shell)).join(', ')}`)
    }
    if (draft.environment.packageManagers.length > 0) {
      facts.push(`- **${t('prereq.pm')}** — ${draft.environment.packageManagers.join(', ')}`)
    }
    if (draft.environment.usesGit) facts.push(`- **${t('prereq.git')}** — ${t('prereq.gitYes')}`)
    lines.push(`## ${t('section.before')}`, '', ...facts, '')
  }

  if (options.includeSteps) {
    lines.push(`## ${t('section.steps')}`, '')
    if (draft.steps.length === 0) {
      lines.push(`- ${t('empty.steps')}`, '')
    } else {
      const lang = shellTag(draft)
      for (const [index, step] of draft.steps.entries()) {
        const turn = t('step.turn', { turn: String(step.turn) })
        const label = step.description === undefined ? '' : `**${oneLine(step.description, 120)}**`
        const single = !step.command.includes('\n') && step.command.length <= 120
        if (single) {
          lines.push(`${index + 1}. ${label === '' ? '' : `${label} — `}${code(step.command)} — ${turn}`)
        } else {
          const fence = fenceFor(step.command)
          lines.push(`${index + 1}. ${label === '' ? turn : `${label} — ${turn}`}`, '', `   ${fence}${lang}`, ...step.command.split('\n').map((line) => `   ${line}`), `   ${fence}`)
        }
      }
      lines.push('')
    }
  }

  if (options.includeChecks) {
    lines.push(`## ${t('section.checks')}`, '')
    if (draft.checks.length === 0) {
      lines.push(`- ${t('empty.checks')}`, '')
    } else {
      lines.push(`> ${t('step.checkNote')}`, '')
      for (const check of draft.checks) {
        lines.push(`- ${code(check.command)} — ${t('step.turn', { turn: String(check.turn) })}`)
      }
      lines.push('')
    }
  }

  if (options.includeFiles) {
    lines.push(`## ${t('section.files')}`, '')
    if (draft.files.length === 0) {
      lines.push(`- ${t('empty.files')}`, '')
    } else {
      for (const file of draft.files) {
        const operations = [
          file.edits > 0 ? t('step.edits', { count: String(file.edits) }) : '',
          file.writes > 0 ? t('step.writes', { count: String(file.writes) }) : '',
        ].filter((part) => part !== '').join(' · ')
        const turns = file.firstTurn === file.lastTurn
          ? t('step.turnOne', { turn: String(file.firstTurn) })
          : t('step.turns', { first: String(file.firstTurn), last: String(file.lastTurn) })
        lines.push(`- ${code(file.path)} — ${operations} · ${turns}`)
      }
      lines.push('')
    }
  }

  if (options.includePitfalls) {
    lines.push(`## ${t('section.pitfalls')}`, '')
    if (draft.pitfalls.length === 0) {
      lines.push(`- ${t('empty.pitfalls')}`, '')
    } else {
      for (const pitfall of draft.pitfalls) {
        lines.push(`- ${t('draft.failedLine', {
          command: code(pitfall.command),
          turn: String(pitfall.turn),
          error: code(pitfall.error),
        })}`)
        lines.push(`  - ${pitfall.fixedInTurn === undefined ? t('step.unfixed') : t('step.fixed', { turn: String(pitfall.fixedInTurn) })}`)
      }
      lines.push('')
    }
  }

  lines.push(
    '---',
    '',
    t('draft.provenance', {
      session: draft.sessionId,
      turns: String(draft.counts.turns),
      seq: String(draft.throughSeq),
      time: stamp(draft.generatedAt),
    }),
    '',
  )
  return lines.join('\n')
}

/**
 * Keep the frontmatter `name` equal to the folder the user chose.
 * The rest of the document is left byte-for-byte alone.
 */
export function syncFrontmatterName(markdown: string, slug: string): string {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown)
  if (match === null) return markdown
  const block = match[1] ?? ''
  const next = /^name:.*$/m.test(block)
    ? block.replace(/^name:.*$/m, `name: ${slug}`)
    : `name: ${slug}\n${block}`
  return `${markdown.slice(0, match.index)}---\n${next}\n---\n${markdown.slice(match.index + match[0].length)}`
}

/** A download name that keeps the skill folder visible. */
export function skillFileName(slug: string): string {
  return slug === '' ? 'SKILL.md' : `${slug}-SKILL.md`
}
