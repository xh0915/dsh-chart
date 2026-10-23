/**
 * dsh-chart — The local skill library.
 *
 * Skills live where the harness already looks for them: `<dshHome>/skills`, the
 * documented writable user root (`~/.dsh/skills` by default). This module lists
 * what is there and writes one bundle at a time, with three rules:
 *
 *   - the slug is the directory name and must be kebab-case;
 *   - an existing skill is never replaced unless the caller asked for it, and the
 *     old file is copied to a timestamped backup first;
 *   - the markdown is redacted again at write time, not just when it was built.
 *
 * Writes go to a temporary file and are renamed into place so the harness
 * watcher never reads a half-written SKILL.md.
 */
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import { redact } from './redact.ts'
import type { ChartRedaction, LibrarySkill, SaveRequest, SaveResult, SkillLibrary } from './schema.ts'

/** The name grammar the harness itself enforces. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The writable user skill root and how to name it in the UI. */
export interface SkillsRoot {
  /** Absolute path on this machine. */
  readonly root: string
  /** `~/.dsh/skills` or `$DSH_HOME/skills`. */
  readonly display: string
}

/** Expand only the tilde forms the harness documents: `~`, `~/…`, `~\…`. */
function expandHome(value: string, home: string): string {
  if (value === '~') return home
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2))
  return value
}

/**
 * Resolve the user skill root.
 * @param env - process environment, injectable for tests.
 * @param home - the OS home directory, injectable for tests.
 */
export function resolveSkillsRoot(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): SkillsRoot {
  const configured = env.DSH_HOME?.trim() ?? ''
  const base = configured === '' ? join(home, '.dsh') : resolve(expandHome(configured, home))
  return {
    root: join(base, 'skills'),
    display: configured === '' ? '~/.dsh/skills' : '$DSH_HOME/skills',
  }
}

/** Why a markdown file cannot be saved as a skill. */
export type FrontmatterProblem = 'no-frontmatter' | 'bad-yaml' | 'missing-name' | 'missing-description' | 'bad-name'

/** A parsed SKILL.md, with the fields the harness requires. */
export interface ParsedSkill {
  readonly name: string
  readonly description: string
  readonly body: string
}

/** Parse outcome; the save path needs the reason, listing does not. */
export type ParseOutcome = { readonly ok: true; readonly skill: ParsedSkill } | { readonly ok: false; readonly reason: FrontmatterProblem }

/** Read the YAML frontmatter and body out of a skill file. */
export function parseSkillMarkdown(markdown: string): ParseOutcome {
  const text = markdown.replace(/^\uFEFF/, '')
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (match === null) return { ok: false, reason: 'no-frontmatter' }
  let data: unknown
  try {
    data = parse(match[1] ?? '')
  } catch {
    return { ok: false, reason: 'bad-yaml' }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, reason: 'missing-name' }
  const record = data as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  if (name === '') return { ok: false, reason: 'missing-name' }
  if (!SKILL_NAME.test(name)) return { ok: false, reason: 'bad-name' }
  if (description === '') return { ok: false, reason: 'missing-description' }
  return { ok: true, skill: { name, description, body: text.slice(match[0].length) } }
}

/** One readable skill row, or undefined when the file is not a valid skill. */
function toRow(skill: ParsedSkill): LibrarySkill {
  return { name: skill.name, description: skill.description.length <= 400 ? skill.description : `${skill.description.slice(0, 399)}…` }
}

/** List the user skill root; a missing root is an empty library, not an error. */
export async function readLibrary(paths: SkillsRoot): Promise<SkillLibrary> {
  let entries
  try {
    entries = await readdir(paths.root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { root: paths.root, displayRoot: paths.display, skills: [] }
    throw new Error(`CHART_LIBRARY_FAILED|${error instanceof Error ? error.message : String(error)}`)
  }

  const skills: LibrarySkill[] = []
  for (const entry of entries) {
    if (skills.length >= 500) break
    if (entry.name.startsWith('.')) continue
    let file: string | undefined
    if (entry.isDirectory()) file = join(paths.root, entry.name, 'SKILL.md')
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) file = join(paths.root, entry.name)
    if (file === undefined) continue
    try {
      const parsed = parseSkillMarkdown(await readFile(file, 'utf8'))
      if (parsed.ok) skills.push(toRow(parsed.skill))
    } catch {
      // One unreadable entry must not hide the rest of the library.
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return { root: paths.root, displayRoot: paths.display, skills }
}

/** The symbolic path of a file under the skill root. */
function displayPath(paths: SkillsRoot, slug: string, file = 'SKILL.md'): string {
  return `${paths.display}/${slug}/${file}`
}

/** Whether a path is a regular file. */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** A free backup name next to `target`, never overwriting an older backup. */
async function backupName(target: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  let candidate = `${target}.${stamp}.bak`
  for (let index = 1; await isFile(candidate); index += 1) candidate = `${target}.${stamp}-${index}.bak`
  return candidate
}

/** Normalize line endings and guarantee a trailing newline. */
function finish(markdown: string): string {
  return `${markdown.replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`
}

/**
 * Write one skill bundle into the user library.
 * @param paths - resolved root and its symbolic display name.
 * @param request - slug, edited markdown, and whether replacing is allowed.
 * @param redactSecrets - re-redact the final markdown when true.
 * @returns where the file landed and what was backed up.
 * @throws Error with a `CHART_…|detail` message the view can translate.
 */
export async function saveSkill(paths: SkillsRoot, request: SaveRequest, redactSecrets: boolean): Promise<SaveResult> {
  if (!SKILL_NAME.test(request.slug)) throw new Error('CHART_BAD_NAME|')
  const parsed = parseSkillMarkdown(request.markdown)
  if (!parsed.ok) throw new Error(`CHART_BAD_FRONTMATTER|${parsed.reason}`)
  if (parsed.skill.name !== request.slug) throw new Error('CHART_NAME_MISMATCH|')
  if (parsed.skill.description === '') throw new Error('CHART_NO_DESCRIPTION|')

  const outcome = redactSecrets ? redact(request.markdown) : { text: request.markdown, hits: 0, kinds: [] as string[] }
  const redaction: ChartRedaction = { count: outcome.hits, kinds: [...outcome.kinds].sort(), enabled: redactSecrets }
  const content = finish(outcome.text)

  const target = resolve(paths.root, request.slug, 'SKILL.md')
  const relativePath = relative(paths.root, target)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('CHART_BAD_NAME|')

  const directory = resolve(paths.root, request.slug)
  const exists = await isFile(target)
  const shownPath = displayPath(paths, request.slug)
  if (exists && !request.overwrite) throw new Error(`CHART_EXISTS|${shownPath}|${request.slug}`)

  let backup: string | undefined
  try {
    await mkdir(directory, { recursive: true })
    if (exists) {
      backup = await backupName(target)
      await copyFile(target, backup)
    }
    const temp = join(directory, `.SKILL.md.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
    try {
      await writeFile(temp, content, 'utf8')
      if (exists) await rm(target, { force: true })
      await rename(temp, target)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CHART_')) throw error
    throw new Error(`CHART_WRITE_FAILED|${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    path: target,
    displayPath: shownPath,
    overwritten: exists,
    ...(backup === undefined ? {} : {
      backupPath: backup,
      backupDisplayPath: displayPath(paths, request.slug, backup.slice(backup.lastIndexOf('SKILL.md'))),
    }),
    redaction,
  }
}
