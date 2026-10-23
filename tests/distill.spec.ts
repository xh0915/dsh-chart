import { describe, expect, it } from 'vitest'
import { distillSession, suggestName, workspacePath, type RawEvent } from '../src/distill.ts'
import { MASK } from '../src/redact.ts'
import {
  BASE, GITHUB_TOKEN, RELAY_KEY, distillSample, sampleEvents, sampleHeader, shell, toolCall, toolResult,
} from './sample.ts'

/** One turn marker. */
function turn(seq: number, index: number): RawEvent {
  return { type: 'turn/start', seq, time: BASE + seq * 1_000, data: { turn: index } }
}

describe('the distiller keeps real evidence', () => {
  const draft = distillSample()

  it('reads the header and the last event', () => {
    expect(draft.sessionId).toBe('session-01hchart')
    expect(draft.startedAt).toBe(BASE)
    expect(draft.cwd).toBe('E:/proj/chart-demo')
    expect(draft.agentPreset).toBe('standard')
    expect(draft.generatedAt).toBe(BASE + 40_000)
    expect(draft.throughSeq).toBe(33)
    expect(draft.endedAt).toBe(BASE + 33_000)
  })

  it('uses the session title and the first prompt as its goal', () => {
    expect(draft.title).toBe('给航图插件补测试')
    expect(draft.goal).toBe(`把构建检查和测试修好，顺便把 key = ${MASK} 记一下`)
  })

  it('never ships a secret across the wire', () => {
    const wire = JSON.stringify(draft)
    expect(wire).not.toContain(RELAY_KEY)
    expect(wire).not.toContain(GITHUB_TOKEN)
    expect(draft.redaction).toEqual({ count: 2, kinds: ['github-token', 'provider-key'], enabled: true })
  })

  it('keeps successful, non-noise commands as steps and drops look-arounds', () => {
    expect(draft.steps.map((step) => step.command)).toEqual(['pnpm install', 'echo done > out.txt'])
    expect(draft.steps[0]).toMatchObject({ command: 'pnpm install', description: '装依赖', turn: 1 })
    expect(draft.steps[1]).toMatchObject({ command: 'echo done > out.txt', turn: 2 })
    expect(draft.counts.steps).toBe(2)
    expect(draft.counts.commands).toBe(10)
  })

  it('separates verification commands from ordinary steps', () => {
    expect(draft.checks.map((check) => check.command)).toEqual([
      'pnpm run build',
      'pnpm test',
      `curl -H "Authorization: Bearer ${MASK}" https://example.com/api`,
      'npm run lint && tsc --noEmit',
    ])
    expect(draft.checks.every((check) => check.turn === 2)).toBe(true)
  })

  it('records failures as pitfalls and proves a later retry', () => {
    expect(draft.pitfalls).toHaveLength(2)
    expect(draft.pitfalls[0]).toMatchObject({
      command: 'pnpm test',
      error: '1 failed: expected 2, got 3',
      turn: 1,
      fixedInTurn: 2,
    })
    expect(draft.pitfalls[1]).toMatchObject({ command: 'git push origin main', turn: 2 })
    expect(draft.pitfalls[1]?.error).toContain('no upstream branch')
    expect(draft.pitfalls[1]?.fixedInTurn).toBeUndefined()
    expect(draft.counts.failures).toBe(2)
  })

  it('lists only files the session really edited or wrote', () => {
    expect(draft.files).toEqual([
      { path: 'src/a.ts', edits: 1, writes: 0, firstTurn: 1, lastTurn: 1 },
      { path: 'src/b.ts', edits: 0, writes: 1, firstTurn: 2, lastTurn: 2 },
    ])
    expect(draft.counts.filesChanged).toBe(2)
  })

  it('reports the environment the commands themselves showed', () => {
    expect(draft.environment).toEqual({
      platform: 'win32',
      shells: ['pwsh'],
      packageManagers: ['pnpm', 'npm'],
      usesGit: true,
    })
  })

  it('proposes a name the harness accepts', () => {
    expect(draft.suggestedName).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(draft.suggestedName.length).toBeLessThanOrEqual(60)
  })

  it('counts every raw event, including the ones it ignores', () => {
    expect(draft.counts.rawEvents).toBe(sampleEvents.length)
    expect(draft.counts.turns).toBe(2)
    expect(draft.truncated).toBe(false)
  })
})

describe('the distiller stays honest when told not to redact', () => {
  const draft = distillSample(sampleEvents, { redactSecrets: false })

  it('leaves the text alone but still reports that redaction is off', () => {
    expect(draft.goal).toContain(RELAY_KEY)
    expect(draft.checks[2]?.command).toContain(GITHUB_TOKEN)
    expect(draft.redaction).toEqual({ count: 0, kinds: [], enabled: false })
  })
})

describe('the distiller respects the step cap', () => {
  const draft = distillSample(sampleEvents, { maxSteps: 1 })

  it('keeps the first step and says content was omitted', () => {
    expect(draft.steps.map((step) => step.command)).toEqual(['pnpm install'])
    expect(draft.counts.steps).toBe(2)
    expect(draft.truncated).toBe(true)
  })
})

describe('the distiller handles unusual logs', () => {
  it('falls back to one turn when the log has calls but no turn markers', () => {
    const events: RawEvent[] = [
      ...shell(1, 's1', 'pnpm install'),
      ...shell(3, 's2', 'pnpm run build'),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.counts.turns).toBe(1)
    expect(draft.steps[0]?.turn).toBe(1)
    expect(draft.checks[0]?.turn).toBe(1)
  })

  it('dedupes a repeated command across turns', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      ...shell(2, 's1', 'pnpm install'),
      turn(4, 2),
      ...shell(5, 's2', 'pnpm   install'),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.steps).toHaveLength(1)
    expect(draft.steps[0]?.turn).toBe(1)
    expect(draft.counts.steps).toBe(1)
  })

  it('treats a chain as a check only when every segment verifies', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      ...shell(2, 's1', 'pnpm test && pnpm run build'),
      ...shell(4, 's2', 'pnpm test && echo ok'),
      ...shell(6, 's3', 'pnpm test ; pnpm run lint'),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.checks.map((check) => check.command)).toEqual([
      'pnpm test && pnpm run build',
      'pnpm test ; pnpm run lint',
    ])
    expect(draft.steps.map((step) => step.command)).toEqual(['pnpm test && echo ok'])
  })

  it('keeps an echo only when it redirects into a file', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      ...shell(2, 's1', 'echo hello'),
      ...shell(4, 's2', 'echo hello > out.txt'),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.steps.map((step) => step.command)).toEqual(['echo hello > out.txt'])
  })

  it('does not call an earlier success a fix for a later failure', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      ...shell(2, 's1', 'pnpm test'),
      turn(4, 2),
      toolCall(5, 's2', 'pwsh', { command: 'pnpm test' }),
      toolResult(6, 's2', 'now it broke', { name: 'ToolError' }),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.pitfalls).toHaveLength(1)
    expect(draft.pitfalls[0]?.fixedInTurn).toBeUndefined()
  })

  it('drops a failure that carried no error text at all', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      toolCall(2, 's1', 'pwsh', { command: 'pnpm test' }),
      toolResult(3, 's1', '', { name: 'ToolError' }),
      toolCall(4, 's2', 'pwsh', { command: 'pnpm run build' }),
      toolResult(5, 's2', '', {}),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.counts.failures).toBe(2)
    expect(draft.pitfalls).toHaveLength(1)
    expect(draft.pitfalls[0]?.error).toBe('ToolError')
  })

  it('marks a run with no reusable content as empty, without inventing a title', () => {
    const events: RawEvent[] = [
      { type: 'user/message', seq: 1, time: BASE, data: { content: [{ type: 'text', text: '你好' }] } },
      { type: 'turn/start', seq: 2, time: BASE, data: { turn: 1 } },
    ]
    const draft = distillSession({ ...sampleHeader, agentPreset: undefined }, events, { redactSecrets: true, maxSteps: 30, platform: 'linux', now: BASE })
    expect(draft.title).toBe('你好')
    expect(draft.goal).toBe('你好')
    expect(draft.steps).toEqual([])
    expect(draft.checks).toEqual([])
    expect(draft.files).toEqual([])
    expect(draft.agentPreset).toBe('')
    expect(draft.counts.turns).toBe(1)
  })

  it('keeps a file outside the workspace as logged', () => {
    const events: RawEvent[] = [
      toolCall(1, 'e1', 'edit', { file_path: 'C:/Users/xh/notes.md' }),
      toolResult(2, 'e1', 'ok'),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.files[0]?.path).toBe('C:/Users/xh/notes.md')
  })

  it('does not count a tool call that never got an answer', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      toolCall(2, 's1', 'pwsh', { command: 'pnpm install' }),
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.steps).toEqual([])
    expect(draft.pitfalls).toEqual([])
    expect(draft.counts.commands).toBe(1)
  })

  it('ignores an unknown turn marker and keeps its own count', () => {
    const events: RawEvent[] = [
      turn(1, 1),
      ...shell(2, 's1', 'pnpm install'),
      { type: 'turn/start', seq: 4, time: BASE, data: {} },
    ]
    const draft = distillSession(sampleHeader, events, { redactSecrets: true, maxSteps: 30, platform: 'win32', now: BASE })
    expect(draft.counts.turns).toBe(2)
    expect(draft.steps[0]?.turn).toBe(1)
  })
})

describe('workspacePath', () => {
  it('makes paths inside the workspace relative', () => {
    expect(workspacePath('E:/proj/demo', 'E:/proj/demo/src/a.ts', 'win32')).toBe('src/a.ts')
    expect(workspacePath('E:/proj/demo', 'E:\\proj\\demo\\src\\a.ts', 'win32')).toBe('src/a.ts')
    expect(workspacePath('/home/xh/demo', '/home/xh/demo/src/a.ts', 'linux')).toBe('src/a.ts')
  })

  it('leaves paths outside the workspace alone', () => {
    expect(workspacePath('E:/proj/demo', 'E:/proj/other/a.ts', 'win32')).toBe('E:/proj/other/a.ts')
    expect(workspacePath('', 'E:/proj/demo/a.ts', 'win32')).toBe('E:/proj/demo/a.ts')
    expect(workspacePath('E:/proj/demo', 'E:/proj/demo', 'win32')).toBe('.')
  })

  it('folds case only on Windows', () => {
    expect(workspacePath('E:/Proj/Demo', 'e:/proj/demo/src/a.ts', 'win32')).toBe('src/a.ts')
    expect(workspacePath('/Home/xh/demo', '/home/xh/demo/a.ts', 'linux')).toBe('/home/xh/demo/a.ts')
  })
})

describe('suggestName', () => {
  it('builds a kebab name from meaningful words', () => {
    expect(suggestName('Fix the deploy pipeline', 'Update GitHub Actions workflow for pages', 'session-1')).toBe('fix-deploy-pipeline-update')
  })

  it('drops stopwords and duplicates', () => {
    expect(suggestName('Add plugin tests', 'add plugin tests with vitest', 'session-2')).toBe('plugin-tests-vitest')
  })

  it('falls back to the session id when the words are not usable', () => {
    expect(suggestName('修好构建', '顺便看一下', 'session-01hchart')).toMatch(/^session-\d{6}-01hchart$/)
    expect(suggestName('修好构建', '顺便看一下', 'x')).toMatch(/^session-\d{6}-x$/)
  })

  it('never exceeds the harness limit', () => {
    expect(suggestName('a'.repeat(80), 'b'.repeat(80), 'x').length).toBeLessThanOrEqual(60)
  })
})
