import { describe, expect, it } from 'vitest'
import { DSH_CHART_INVOCATIONS, sessionIdSchema } from '../src/contract.ts'
import { TYPERT_MANIFEST } from '../src/typert.ts'
import { DSH_CHART_REMOTE } from '../src/client/remote.ts'
import { ChartDraftSchema, SaveRequestSchema, SaveResultSchema, SkillLibrarySchema } from '../src/schema.ts'
import { distillSample } from './sample.ts'

const build = DSH_CHART_INVOCATIONS[0]
const library = DSH_CHART_INVOCATIONS[1]
const save = DSH_CHART_INVOCATIONS[2]

describe('the shared wire contract', () => {
  it('exposes the three methods on the chart namespace', () => {
    expect(DSH_CHART_INVOCATIONS).toHaveLength(3)
    expect(build).toMatchObject({
      id: 'dsh-chart#chart/build',
      service: 'chart',
      namespace: 'chart',
      method: 'build',
      invocation: { kind: 'direct' },
    })
    expect(library).toMatchObject({ id: 'dsh-chart#chart/library', method: 'library' })
    expect(save).toMatchObject({ id: 'dsh-chart#chart/save', method: 'save' })
  })

  it('build takes one JSON session id and a transport cancellation', () => {
    expect(build?.parameters).toHaveLength(1)
    expect(build?.parameters[0]).toMatchObject({ name: 'sessionId', wire: 'sessionId', source: 'json' })
    expect(build?.parameters[0]?.acceptsUndefined).toBeUndefined()
    expect(build?.parameters[0]?.codec.mode).toBe('strict')
    expect(build?.cancellation).toEqual({ parameter: 'signal' })
    expect(build?.result.mode).toBe('strict')
  })

  it('library takes nothing and still declares a strict result', () => {
    expect(library?.parameters).toEqual([])
    expect(library?.cancellation).toBeUndefined()
    expect(library?.result.mode).toBe('strict')
  })

  it('save takes one strict SaveRequest object', () => {
    expect(save?.parameters).toHaveLength(1)
    expect(save?.parameters[0]).toMatchObject({ name: 'request', wire: 'request', source: 'json' })
    expect(save?.parameters[0]?.codec.mode).toBe('strict')
    expect(save?.result.mode).toBe('strict')
  })

  it('shares one descriptor array between the host manifest and the client contribution', () => {
    expect(TYPERT_MANIFEST.invocations).toBe(DSH_CHART_INVOCATIONS)
    expect(DSH_CHART_REMOTE.descriptors).toBe(DSH_CHART_INVOCATIONS)
    expect(TYPERT_MANIFEST.package).toBe(DSH_CHART_REMOTE.package)
    expect(TYPERT_MANIFEST.package).toBe('dsh-chart')
    expect(TYPERT_MANIFEST.face).toBe('host')
  })

  it('describes the service the host actually registers', () => {
    const service = TYPERT_MANIFEST.model.services.find((entry) => entry.key === 'chart')
    expect(service).toMatchObject({ key: 'chart', exportName: 'ChartRuntime' })
    expect(service?.members).toEqual([
      { kind: 'method', name: 'build', signature: 'build(sessionId: string, signal?: AbortSignal): Promise<ChartDraft>' },
      { kind: 'method', name: 'library', signature: 'library(): Promise<SkillLibrary>' },
      { kind: 'method', name: 'save', signature: 'save(request: SaveRequest): Promise<SaveResult>' },
    ])
    expect(TYPERT_MANIFEST.model.events).toEqual([])
    expect(TYPERT_MANIFEST.model.objects).toEqual([])
    expect(TYPERT_MANIFEST.schemas).toEqual([])
  })

  it('derives the reflected remote key from the same service and method', () => {
    expect(`${build?.service}/${build?.method}`).toBe('chart/build')
    expect(`${library?.service}/${library?.method}`).toBe('chart/library')
    expect(`${save?.service}/${save?.method}`).toBe('chart/save')
  })
})

describe('the session id codec guards the boundary', () => {
  it('accepts a real id and trims surrounding space', () => {
    expect(sessionIdSchema.parse('session-01hchart')).toBe('session-01hchart')
    expect(sessionIdSchema.parse('  session-01hchart  ')).toBe('session-01hchart')
  })

  it('rejects a missing, blank, or absurdly long id', () => {
    expect(sessionIdSchema.safeParse('').success).toBe(false)
    expect(sessionIdSchema.safeParse('   ').success).toBe(false)
    expect(sessionIdSchema.safeParse('x'.repeat(201)).success).toBe(false)
    expect(sessionIdSchema.safeParse(undefined).success).toBe(false)
    expect(sessionIdSchema.safeParse(42).success).toBe(false)
  })

  it('is the codec the parameter actually carries', () => {
    const codec = build?.parameters[0]?.codec
    expect(codec?.mode === 'strict' && codec.schema === sessionIdSchema).toBe(true)
  })
})

describe('the result codecs are strict about the host payload', () => {
  it('accepts what the distiller really produces', () => {
    expect(ChartDraftSchema.safeParse(distillSample()).success).toBe(true)
    expect(build?.result.mode === 'strict' && build.result.schema === ChartDraftSchema).toBe(true)
    expect(library?.result.mode === 'strict' && library.result.schema === SkillLibrarySchema).toBe(true)
    expect(save?.result.mode === 'strict' && save.result.schema === SaveResultSchema).toBe(true)
  })

  it('rejects a draft with invented numbers or a missing session', () => {
    const honest = distillSample()
    const forge = <K extends keyof typeof honest>(key: K, value: unknown) => ({ ...honest, [key]: value })
    expect(ChartDraftSchema.safeParse(forge('counts', { ...honest.counts, turns: -1 })).success).toBe(false)
    expect(ChartDraftSchema.safeParse(forge('counts', { ...honest.counts, steps: 1.5 })).success).toBe(false)
    expect(ChartDraftSchema.safeParse(forge('sessionId', '')).success).toBe(false)
    expect(ChartDraftSchema.safeParse(forge('steps', [{ command: '', turn: 1, seq: 1, time: 1 }])).success).toBe(false)
    expect(ChartDraftSchema.safeParse(forge('redaction', { count: 0, kinds: [], enabled: 'yes' })).success).toBe(false)
  })

  it('accepts a real skill library and rejects an incomplete one', () => {
    const libraryResult = { root: 'C:/Users/xh/.dsh/skills', displayRoot: '~/.dsh/skills', skills: [{ name: 'alpha', description: 'A.' }] }
    expect(SkillLibrarySchema.safeParse(libraryResult).success).toBe(true)
    expect(SkillLibrarySchema.safeParse({ root: 'x', skills: [] }).success).toBe(false)
    expect(SkillLibrarySchema.safeParse({ ...libraryResult, skills: [{ name: 'Alpha', description: 'x' }] }).success).toBe(false)
  })

  it('rejects a save request the host could not honor', () => {
    const good = { slug: 'alpha', markdown: '---\nname: alpha\ndescription: x\n---\n', overwrite: false }
    expect(SaveRequestSchema.safeParse(good).success).toBe(true)
    expect(SaveRequestSchema.safeParse({ ...good, slug: '' }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, slug: 'Alpha' }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, slug: '../evil' }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, slug: 'x'.repeat(61) }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, markdown: '' }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, markdown: 'x'.repeat(30_001) }).success).toBe(false)
    expect(SaveRequestSchema.safeParse({ ...good, overwrite: 'no' }).success).toBe(false)
  })

  it('accepts a save result with or without a backup', () => {
    const redaction = { count: 0, kinds: [], enabled: true }
    expect(SaveResultSchema.safeParse({ path: 'p', displayPath: 'd', overwritten: false, redaction }).success).toBe(true)
    expect(SaveResultSchema.safeParse({
      path: 'p', displayPath: 'd', overwritten: true, backupPath: 'b', backupDisplayPath: 'bd', redaction,
    }).success).toBe(true)
    expect(SaveResultSchema.safeParse({ path: 'p', displayPath: 'd', redaction }).success).toBe(false)
  })
})

describe('the save request descriptor carries the same schema the host validates', () => {
  it('points at SaveRequestSchema', () => {
    const codec = save?.parameters[0]?.codec
    expect(codec?.mode === 'strict' && codec.schema === SaveRequestSchema).toBe(true)
  })
})
