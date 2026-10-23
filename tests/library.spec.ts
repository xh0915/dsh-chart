import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MASK } from '../src/redact.ts'
import { SKILL_NAME, parseSkillMarkdown, readLibrary, resolveSkillsRoot, saveSkill, type SkillsRoot } from '../src/library.ts'

const CLEAN = '---\nname: alpha\ndescription: Does alpha things.\n---\n\n# Alpha\n\nRun the alpha check.\n'
const GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz01234567'

describe('resolveSkillsRoot', () => {
  it('uses ~/.dsh/skills by default and shows it symbolically', () => {
    const home = join('E:', 'Users', 'xh')
    expect(resolveSkillsRoot({}, home)).toEqual({
      root: join(home, '.dsh', 'skills'),
      display: '~/.dsh/skills',
    })
  })

  it('honours DSH_HOME and shows that instead', () => {
    expect(resolveSkillsRoot({ DSH_HOME: 'D:/harness-home' }, 'E:/Users/xh')).toEqual({
      root: join(resolve('D:/harness-home'), 'skills'),
      display: '$DSH_HOME/skills',
    })
  })

  it('expands a tilde inside DSH_HOME', () => {
    const home = join('E:', 'Users', 'xh')
    expect(resolveSkillsRoot({ DSH_HOME: '~/custom-home' }, home).root).toBe(join(home, 'custom-home', 'skills'))
    expect(resolveSkillsRoot({ DSH_HOME: '~' }, home).root).toBe(join(home, 'skills'))
  })

  it('treats a blank DSH_HOME as unset', () => {
    expect(resolveSkillsRoot({ DSH_HOME: '   ' }, 'E:/Users/xh').display).toBe('~/.dsh/skills')
  })
})

describe('parseSkillMarkdown', () => {
  it('accepts the shape the harness requires', () => {
    const parsed = parseSkillMarkdown(CLEAN)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.skill.name).toBe('alpha')
      expect(parsed.skill.description).toBe('Does alpha things.')
      expect(parsed.skill.body).toContain('# Alpha')
    }
  })

  it('accepts a BOM and extra frontmatter fields', () => {
    const parsed = parseSkillMarkdown('\uFEFF---\nname: alpha\nwhenToUse: test\ndescription: "Quoted: yes"\n---\nbody\n')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.skill.description).toBe('Quoted: yes')
  })

  it('names the exact reason a file cannot be saved', () => {
    expect(parseSkillMarkdown('# just markdown\n')).toEqual({ ok: false, reason: 'no-frontmatter' })
    expect(parseSkillMarkdown('---\nname: [unclosed\n---\n')).toEqual({ ok: false, reason: 'bad-yaml' })
    expect(parseSkillMarkdown('---\ndescription: only\n---\n')).toEqual({ ok: false, reason: 'missing-name' })
    expect(parseSkillMarkdown('---\nname: Alpha Skill\ndescription: x\n---\n')).toEqual({ ok: false, reason: 'bad-name' })
    expect(parseSkillMarkdown('---\nname: alpha\n---\n')).toEqual({ ok: false, reason: 'missing-description' })
    expect(parseSkillMarkdown('---\nname: alpha\ndescription: "   "\n---\n')).toEqual({ ok: false, reason: 'missing-description' })
  })

  it('enforces the same name grammar as the harness', () => {
    expect(SKILL_NAME.test('deploy-plugin')).toBe(true)
    expect(SKILL_NAME.test('a1-b2')).toBe(true)
    expect(SKILL_NAME.test('Deploy')).toBe(false)
    expect(SKILL_NAME.test('deploy_plugin')).toBe(false)
    expect(SKILL_NAME.test('-deploy')).toBe(false)
    expect(SKILL_NAME.test('deploy-')).toBe(false)
  })
})

describe('the skill library on disk', () => {
  let root = ''
  let paths: SkillsRoot

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-chart-library-'))
    paths = { root, display: '~/.dsh/skills' }
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads folder skills and flat skills, skipping dot entries and invalid files', async () => {
    await mkdir(join(root, 'zeta'), { recursive: true })
    await writeFile(join(root, 'zeta', 'SKILL.md'), '---\nname: zeta\ndescription: Last.\n---\n')
    await writeFile(join(root, 'alpha.md'), '---\nname: alpha\ndescription: First.\n---\n')
    await mkdir(join(root, '.hidden'), { recursive: true })
    await writeFile(join(root, '.hidden', 'SKILL.md'), '---\nname: hidden\ndescription: Nope.\n---\n')
    await mkdir(join(root, 'empty'), { recursive: true })
    await writeFile(join(root, 'broken.md'), 'not a skill')
    await writeFile(join(root, 'notes.txt'), 'skip me')

    const library = await readLibrary(paths)
    expect(library.root).toBe(root)
    expect(library.displayRoot).toBe('~/.dsh/skills')
    expect(library.skills.map((skill) => skill.name)).toEqual(['alpha', 'zeta'])
  })

  it('treats a missing root as an empty library', async () => {
    const missing = await readLibrary({ root: join(root, 'nope'), display: '~/.dsh/skills' })
    expect(missing.skills).toEqual([])
  })

  it('caps a very long description at the wire limit', async () => {
    await writeFile(join(root, 'long.md'), `---\nname: long\ndescription: ${'x'.repeat(450)}\n---\n`)
    const library = await readLibrary(paths)
    expect(library.skills[0]?.description).toHaveLength(400)
    expect(library.skills[0]?.description.endsWith('…')).toBe(true)
  })

  it('writes a new skill into its own folder', async () => {
    const result = await saveSkill(paths, { slug: 'alpha', markdown: CLEAN, overwrite: false }, true)
    expect(result).toEqual({
      path: join(root, 'alpha', 'SKILL.md'),
      displayPath: '~/.dsh/skills/alpha/SKILL.md',
      overwritten: false,
      redaction: { count: 0, kinds: [], enabled: true },
    })
    await expect(readFile(join(root, 'alpha', 'SKILL.md'), 'utf8')).resolves.toBe(CLEAN)
    expect(parseSkillMarkdown(await readFile(result.path, 'utf8')).ok).toBe(true)
  })

  it('redacts the markdown again at write time', async () => {
    const markdown = `---\nname: alpha\ndescription: Alpha helper.\n---\n\ntoken: ${GITHUB_TOKEN}\n`
    const result = await saveSkill(paths, { slug: 'alpha', markdown, overwrite: false }, true)
    expect(result.redaction.count).toBe(1)
    expect(result.redaction.kinds).toEqual(['github-token'])
    const written = await readFile(result.path, 'utf8')
    expect(written).not.toContain(GITHUB_TOKEN)
    expect(written).toContain(MASK)
  })

  it('writes the markdown untouched when redaction is off', async () => {
    const markdown = `---\nname: alpha\ndescription: Alpha helper.\n---\n\ntoken: ${GITHUB_TOKEN}\n`
    const result = await saveSkill(paths, { slug: 'alpha', markdown, overwrite: false }, false)
    expect(result.redaction).toEqual({ count: 0, kinds: [], enabled: false })
    await expect(readFile(result.path, 'utf8')).resolves.toContain(GITHUB_TOKEN)
  })

  it('never replaces an existing skill without permission', async () => {
    await saveSkill(paths, { slug: 'alpha', markdown: CLEAN, overwrite: false }, true)
    await expect(saveSkill(paths, { slug: 'alpha', markdown: CLEAN, overwrite: false }, true))
      .rejects.toThrow('CHART_EXISTS|~/.dsh/skills/alpha/SKILL.md|alpha')
    await expect(readFile(join(root, 'alpha', 'SKILL.md'), 'utf8')).resolves.toBe(CLEAN)
  })

  it('backs up the old file before overwriting', async () => {
    await saveSkill(paths, { slug: 'alpha', markdown: CLEAN, overwrite: false }, true)
    const next = CLEAN.replace('Run the alpha check.', 'Run the beta check.')
    const result = await saveSkill(paths, { slug: 'alpha', markdown: next, overwrite: true }, true)

    expect(result.overwritten).toBe(true)
    expect(result.backupPath).toBeDefined()
    expect(result.backupDisplayPath).toMatch(/^~\/\.dsh\/skills\/alpha\/SKILL\.md\.\d{8}-\d{6}\.bak$/)
    await expect(readFile(result.backupPath ?? '', 'utf8')).resolves.toBe(CLEAN)
    await expect(readFile(result.path, 'utf8')).resolves.toBe(next)
  })

  it('keeps an older backup when the same skill is replaced twice', async () => {
    await saveSkill(paths, { slug: 'alpha', markdown: CLEAN, overwrite: false }, true)
    const first = await saveSkill(paths, { slug: 'alpha', markdown: CLEAN.replace('Alpha', 'Beta'), overwrite: true }, true)
    const second = await saveSkill(paths, { slug: 'alpha', markdown: CLEAN.replace('Alpha', 'Gamma'), overwrite: true }, true)
    expect(second.backupPath).not.toBe(first.backupPath)
    await expect(readFile(first.backupPath ?? '', 'utf8')).resolves.toBe(CLEAN)
    await expect(stat(second.backupPath ?? '')).resolves.toBeDefined()
  })

  it('rejects a bad folder name before touching disk', async () => {
    for (const slug of ['', 'Alpha', 'a/b', '../evil', 'a_b', '-a']) {
      await expect(saveSkill(paths, { slug, markdown: CLEAN, overwrite: false }, true))
        .rejects.toThrow('CHART_BAD_NAME|')
    }
  })

  it('reports the exact frontmatter problem', async () => {
    const cases: Array<[string, string]> = [
      ['# no frontmatter\n', 'no-frontmatter'],
      ['---\nname: [bad\n---\n', 'bad-yaml'],
      ['---\ndescription: only\n---\n', 'missing-name'],
      ['---\nname: Alpha\ndescription: x\n---\n', 'bad-name'],
      ['---\nname: alpha\n---\n', 'missing-description'],
    ]
    for (const [markdown, reason] of cases) {
      await expect(saveSkill(paths, { slug: 'alpha', markdown, overwrite: false }, true))
        .rejects.toThrow(`CHART_BAD_FRONTMATTER|${reason}`)
    }
  })

  it('requires the frontmatter name to match the folder', async () => {
    const markdown = CLEAN.replace('name: alpha', 'name: beta')
    await expect(saveSkill(paths, { slug: 'alpha', markdown, overwrite: false }, true))
      .rejects.toThrow('CHART_NAME_MISMATCH|')
  })
})
