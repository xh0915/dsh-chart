import { describe, expect, it } from 'vitest'
import { buildSkillMarkdown, draftTitle, skillFileName, stamp, syncFrontmatterName, type DraftOptions } from '../src/client/skill.ts'
import { en, zh, type Translate } from '../src/client/locales.ts'
import { parseSkillMarkdown } from '../src/library.ts'
import { distillSession } from '../src/distill.ts'
import { BASE, GITHUB_TOKEN, RELAY_KEY, distillSample, sampleOptions, t } from './sample.ts'

const ALL: DraftOptions = {
  name: 'chart-demo',
  includeGoal: true,
  includeBefore: true,
  includeSteps: true,
  includeChecks: true,
  includeFiles: true,
  includePitfalls: true,
}

/** English translator with the same interpolation as the client. */
const tEn: Translate = (key, params) => {
  const template = (en as unknown as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
}

describe('buildSkillMarkdown', () => {
  const draft = distillSample()
  const markdown = buildSkillMarkdown(draft, t, ALL)

  it('writes frontmatter the harness can parse', () => {
    const parsed = parseSkillMarkdown(markdown)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.skill.name).toBe('chart-demo')
    expect(parsed.skill.description).toContain('相似时使用')
    expect(parsed.skill.description).toContain('把构建检查和测试修好')
    expect(parsed.skill.body.trimStart().startsWith('# 给航图插件补测试')).toBe(true)
  })

  it('carries every section the user asked for', () => {
    for (const heading of ['## 目标', '## 开始之前', '## 步骤', '## 验证', '## 改过的文件', '## 踩过的坑']) {
      expect(markdown).toContain(heading)
    }
  })

  it('turns real steps into readable instructions', () => {
    expect(markdown).toContain('1. **装依赖** — `pnpm install` — 第 1 轮')
    expect(markdown).toContain('2. `echo done > out.txt` — 第 2 轮')
  })

  it('lists checks with the evidence that they passed', () => {
    expect(markdown).toContain('> 这些命令在会话里都执行成功。')
    expect(markdown).toContain('- `pnpm run build` — 第 2 轮')
    expect(markdown).toContain('- `npm run lint && tsc --noEmit` — 第 2 轮')
  })

  it('reports the files and the turns that changed them', () => {
    expect(markdown).toContain('- `src/a.ts` — 1 次编辑 · 第 1 轮')
    expect(markdown).toContain('- `src/b.ts` — 1 次写入 · 第 2 轮')
  })

  it('keeps each pitfall with its retry outcome', () => {
    expect(markdown).toContain('- `pnpm test` 在第 1 轮失败：`1 failed: expected 2, got 3`')
    expect(markdown).toContain('  - 第 2 轮重试成功')
    expect(markdown).toContain('- `git push origin main` 在第 2 轮失败：`fatal: The current branch main has no upstream branch`')
    expect(markdown).toContain('  - 后面没看到它成功')
  })

  it('ends with a provenance line that points back at the session', () => {
    expect(markdown).toContain('整理自会话 `session-01hchart` · 共 2 轮 · 到事件 #33 · ')
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('never re-introduces a secret that the host removed', () => {
    expect(markdown).not.toContain(RELAY_KEY)
    expect(markdown).not.toContain(GITHUB_TOKEN)
  })

  it('honours the include switches', () => {
    const lean = buildSkillMarkdown(draft, t, {
      ...ALL,
      includeGoal: false,
      includeBefore: false,
      includePitfalls: false,
    })
    expect(lean).not.toContain('## 目标')
    expect(lean).not.toContain('## 开始之前')
    expect(lean).not.toContain('## 踩过的坑')
    expect(lean).toContain('## 步骤')
    expect(lean).toContain('## 验证')
    expect(lean).toContain('## 改过的文件')
  })

  it('localizes the whole document, headings included', () => {
    const english = buildSkillMarkdown(draft, tEn, ALL)
    expect(english).toContain('## Steps')
    expect(english).toContain('## Checks')
    expect(english).toContain('> These commands all succeeded in the session.')
    expect(english).toContain('worked on retry in turn 2')
    expect(english).toContain('never seen succeeding afterwards')
  })

  it('says plainly when a section is empty instead of inventing rows', () => {
    const empty = distillSession(
      { id: 'session-empty', createdAt: BASE, cwd: '', agentPreset: '' },
      [],
      sampleOptions,
    )
    const text = buildSkillMarkdown(empty, t, { ...ALL, name: 'empty-skill' })
    expect(text).toContain('# 未命名会话')
    expect(text).toContain('- 没找到可以复用的命令。')
    expect(text).toContain('- 这次会话没有跑过验证命令。')
    expect(text).toContain('- 这次会话没有改过文件。')
    expect(text).toContain('- 没有失败的命令。')
    expect(parseSkillMarkdown(text).ok).toBe(true)
  })

  it('fences a multi-line command with the shell the session used', () => {
    const multiline = {
      ...draft,
      steps: [{ command: 'pnpm install\npnpm run build', turn: 1, seq: 5, time: BASE }],
    }
    const text = buildSkillMarkdown(multiline, t, ALL)
    expect(text).toContain('1. 第 1 轮')
    expect(text).toContain('   ```powershell')
    expect(text).toContain('   pnpm install')
    expect(text).toContain('   pnpm run build')
  })

  it('leaves the fence unlabelled when the session used two shells', () => {
    const mixed = {
      ...draft,
      environment: { ...draft.environment, shells: ['pwsh', 'bash'] },
      steps: [{ command: 'pnpm install\npnpm build', turn: 1, seq: 5, time: BASE }],
    }
    const text = buildSkillMarkdown(mixed, t, ALL)
    expect(text).toContain('   ```\n   pnpm install')
    expect(text).not.toContain('```powershell')
  })

  it('wraps commands that contain backticks without breaking the markdown', () => {
    const withTicks = {
      ...draft,
      steps: [{ command: 'echo `date` > when.txt', turn: 1, seq: 5, time: BASE }],
    }
    const text = buildSkillMarkdown(withTicks, t, ALL)
    expect(text).toContain('``echo `date` > when.txt``')
  })
})

describe('draftTitle', () => {
  it('uses the session title when there is one', () => {
    expect(draftTitle(distillSample(), t)).toBe('给航图插件补测试')
  })

  it('falls back to localized copy, not to Chinese on the host', () => {
    const draft = { ...distillSample(), title: '' }
    expect(draftTitle(draft, t)).toBe(zh['draft.untitled'])
    expect(draftTitle(draft, tEn)).toBe(en['draft.untitled'])
  })
})

describe('syncFrontmatterName', () => {
  it('rewrites only the frontmatter name line', () => {
    const source = '---\nname: alpha\ndescription: "x: y"\n---\n\n# Body\n\nname: body\n'
    const next = syncFrontmatterName(source, 'beta')
    const parsed = parseSkillMarkdown(next)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.skill.name).toBe('beta')
    expect(parsed.skill.description).toBe('x: y')
    expect(next).toContain('# Body')
    expect(next).toContain('name: body')
    expect(next).toContain('description: "x: y"')
  })

  it('adds a name when the block has none', () => {
    const next = syncFrontmatterName('---\ndescription: x\n---\nbody\n', 'gamma')
    const parsed = parseSkillMarkdown(next)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.skill.name).toBe('gamma')
  })

  it('works on CRLF input', () => {
    const next = syncFrontmatterName('---\r\nname: alpha\r\ndescription: x\r\n---\r\n\r\nbody', 'beta')
    const parsed = parseSkillMarkdown(next)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.skill.name).toBe('beta')
      expect(parsed.skill.description).toBe('x')
    }
  })

  it('leaves a document without frontmatter alone', () => {
    expect(syncFrontmatterName('# Just markdown\n', 'alpha')).toBe('# Just markdown\n')
  })
})

describe('small helpers', () => {
  it('names a download after the folder', () => {
    expect(skillFileName('deploy-plugin')).toBe('deploy-plugin-SKILL.md')
    expect(skillFileName('')).toBe('SKILL.md')
  })

  it('stamps a local minute', () => {
    expect(stamp(BASE)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
