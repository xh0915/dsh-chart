/**
 * Contract test for the browser half.
 *
 * A fake ClientContext stands in for the DSH web shell so the injected tab, the
 * dictionaries, the Remote mount and the action routing are pinned here instead
 * of being discovered at boot. The cast at `apply` is deliberate: this harness
 * implements only the members the entry touches.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { apply, inject } from '../src/client/index.tsx'
import { zh, type Translate } from '../src/client/locales.ts'
import { DSH_CHART_INVOCATIONS } from '../src/contract.ts'
import type { ChartActions } from '../src/client/view.tsx'
import type { SaveRequest, SaveResult, SkillLibrary } from '../src/schema.ts'
import { distillSample } from './sample.ts'

/** Slot payload the view is composed from. */
interface SlotPayload {
  actions: ChartActions
  t: Translate
}

/** Props the fake render accepts; the view reads `sessionId`, `actions` and `t`. */
interface RenderProps extends SlotPayload {
  sessionId?: string
  useSession?: unknown
  useProjection?: unknown
}

/** Registration recorded from the harness. */
interface Registration {
  def: { name: string; id: string; order: number; label: () => string; inject: () => SlotPayload }
  render: (props: RenderProps) => ReactElement
}

/** Locale dictionaries recorded from the harness. */
type Dictionaries = Record<'zh' | 'en', Record<string, string>>

interface StyleElement { id: string; textContent: string }
interface Effect { name: string; fn: () => unknown }
interface RemoteContribution { package: string; descriptors: readonly unknown[] }

/** Resolve whatever an effect returned, sync or async. */
async function settle(value: unknown): Promise<unknown> {
  return value
}

/** The bound translator the client locale service hands back: flat zh keys. */
function makeTranslator(): Translate {
  const translate = (key: string, params?: Record<string, string | number | undefined>): string =>
    (zh as unknown as Record<string, string>)[key]
      .replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
  return translate as unknown as Translate
}

const fakeDraft = distillSample()
const fakeLibrary: SkillLibrary = { root: 'C:/Users/xh/.dsh/skills', displayRoot: '~/.dsh/skills', skills: [] }
const fakeSave: SaveResult = {
  path: 'C:/Users/xh/.dsh/skills/alpha/SKILL.md',
  displayPath: '~/.dsh/skills/alpha/SKILL.md',
  overwritten: false,
  redaction: { count: 0, kinds: [], enabled: true },
}

/** Build a harness plus the context object the entry is handed. */
function makeHarness() {
  const styles: StyleElement[] = []
  const effects: Effect[] = []
  const mounts: RemoteContribution[] = []
  const injected: Array<{ name: string; factory: () => void }> = []
  const disposal: Array<() => void> = []
  let dictionaries: Dictionaries | undefined
  let registered: Registration | undefined
  const remoteFace = {
    build: async (sessionId: string) => ({ ok: true, value: { ...fakeDraft, sessionId } }),
    library: async () => ({ ok: true, value: fakeLibrary }),
    save: async (_request: SaveRequest) => ({ ok: true, value: fakeSave }),
  }
  let reflectHit: unknown = remoteFace

  const ctx = {
    effect(fn: () => unknown, name: string) {
      effects.push({ name, fn })
    },
    locale: {
      register: (ns: string, dicts: Dictionaries) => {
        dictionaries = dicts
        return `undo:${ns}`
      },
      bind: () => makeTranslator(),
    },
    reflect: { get: () => reflectHit },
    remote: {
      $mount: async (contribution: RemoteContribution) => {
        mounts.push(contribution)
        return () => { disposal.push(() => undefined) }
      },
    },
    slots: {
      inject: (name: string, factory: () => void) => { injected.push({ name, factory }) },
      register: (def: Registration['def'], render: Registration['render']) => {
        registered = { def, render }
        return 'undo-slot'
      },
    },
  }

  const document = {
    getElementById: (id: string) => styles.find((element) => element.id === id) ?? null,
    createElement: () => ({ id: '', textContent: '' }) as StyleElement,
    head: { appendChild: (element: StyleElement) => styles.push(element) },
  }

  return {
    ctx,
    styles,
    effects,
    mounts,
    injected,
    document,
    dictionaries: () => dictionaries,
    registered: () => registered,
    setReflect: (value: unknown) => { reflectHit = value },
    runAll: async () => { for (const effect of effects) await settle(effect.fn()) },
  }
}

type Harness = ReturnType<typeof makeHarness>

describe('client entry', () => {
  let harness: Harness
  let globalDocument: unknown

  beforeEach(() => {
    globalDocument = (globalThis as { document?: unknown }).document
    harness = makeHarness()
    ;(globalThis as { document?: unknown }).document = harness.document
    apply(harness.ctx as unknown as Parameters<typeof apply>[0])
  })

  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = globalDocument
  })

  it('declares exactly the services it injects', () => {
    expect(inject).toEqual(['slots', 'remote', 'locale'])
  })

  it('paints its own stylesheet once', () => {
    expect(harness.styles).toHaveLength(1)
    expect(harness.styles[0]?.id).toBe('dsh-chart-styles')
    const css = harness.styles[0]?.textContent ?? ''
    expect(css).toContain('.c-root')
    expect(css).toContain('.c-editor')
    expect(css).toContain('body[data-ds-dark-theme]')
    apply(harness.ctx as unknown as Parameters<typeof apply>[0])
    expect(harness.styles).toHaveLength(1)
  })

  it('registers both dictionaries with identical keys', async () => {
    await harness.runAll()
    const dicts = harness.dictionaries()
    expect(Object.keys(dicts ?? {}).sort()).toEqual(['en', 'zh'])
    const keys = Object.keys(dicts?.zh ?? {}).sort()
    expect(Object.keys(dicts?.en ?? {}).sort()).toEqual(keys)
    expect(keys.length).toBeGreaterThan(80)
  })

  it('injects exactly one chart tab into the conversation view ring', () => {
    expect(harness.injected.map((entry) => entry.name)).toEqual(['conversation.view'])
    expect(harness.registered()).toBeUndefined()
    harness.injected[0]?.factory()
    expect(harness.registered()?.def).toMatchObject({ name: 'conversation.view', id: 'chart', order: 31 })
    expect(harness.registered()?.def.label()).toBe(zh['view.label'])
  })

  it('mounts the remote through the descriptors shared with the host', async () => {
    await harness.runAll()
    expect(harness.mounts).toHaveLength(1)
    expect(harness.mounts[0]?.package).toBe('dsh-chart')
    expect(harness.mounts[0]?.descriptors).toBe(DSH_CHART_INVOCATIONS)
  })

  it('refuses to mount when the host contributed no chart namespace', async () => {
    harness.setReflect(undefined)
    await expect(settle(harness.effects[1]?.fn())).rejects.toThrow(/did not mount/)
  })

  it('routes every tab action onto the mounted remote', async () => {
    await harness.runAll()
    harness.injected[0]?.factory()
    const actions = harness.registered()!.def.inject().actions
    await expect(actions.build('session-01hchart')).resolves.toMatchObject({
      ok: true,
      value: { sessionId: 'session-01hchart' },
    })
    await expect(actions.library()).resolves.toEqual({ ok: true, value: fakeLibrary })
    await expect(actions.save({ slug: 'alpha', markdown: 'x', overwrite: false })).resolves.toEqual({ ok: true, value: fakeSave })
  })

  it('reports honestly while the remote namespace is not mounted yet', async () => {
    harness.injected[0]?.factory()
    const actions = harness.registered()!.def.inject().actions
    await expect(actions.build('session-01hchart')).resolves.toMatchObject({
      ok: false,
      error: { message: zh['state.notMounted'] },
    })
    await expect(actions.library()).resolves.toMatchObject({
      ok: false,
      error: { message: zh['state.notMounted'] },
    })
    await expect(actions.save({ slug: 'alpha', markdown: 'x', overwrite: false })).resolves.toMatchObject({
      ok: false,
      error: { message: zh['save.failed'].replace('{message}', zh['state.notMounted']) },
    })
  })

  it('renders the tab in its loading phase', async () => {
    await harness.runAll()
    harness.injected[0]?.factory()
    const { def, render } = harness.registered()!
    const markup = renderToStaticMarkup(render({ sessionId: 'session-01hchart', ...def.inject() }))
    expect(markup).toContain('c-root')
    expect(markup).toContain(zh['state.loading'])
  })
})
