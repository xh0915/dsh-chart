/**
 * dsh-chart — Client plugin entry (browser half).
 *
 * Mounts the chart Remote namespace, registers the dictionaries, injects one tab
 * into the conversation view ring, and paints the styles the tab needs.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DSH_CHART_REMOTE } from './remote.ts'
import { NS, en, zh } from './locales.ts'
import { ChartView, type ChartActions, type ChartViewSlotProps } from './view.tsx'
import type { ChartDraft, SaveRequest, SaveResult, SkillLibrary } from '../schema.ts'
import { adoptStyles } from './styles.ts'

/** Required services: the Remote gateway, locale, and slots. */
export const inject = ['slots', 'remote', 'locale']

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** Compose the chart tab. @param ctx - client root context. */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chart: dictionaries')

  let chart: unknown
  const t = ctx.locale.bind(NS)

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(DSH_CHART_REMOTE)
    chart = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.chart')
    if (chart === undefined) throw new Error('dsh-chart: the chart Remote namespace did not mount')
    return () => { chart = undefined; void dispose() }
  }, 'dsh-chart: remote')

  /** Fetch one method off the mounted face, or report the honest state. */
  function method<K extends keyof ChartActions>(name: K): ChartActions[K] | undefined {
    if (chart === undefined) return undefined
    const fn = (chart as Record<string, unknown>)[name]
    return typeof fn === 'function' ? (fn as ChartActions[K]) : undefined
  }

  const actions: ChartActions = {
    build: (sessionId: string) => {
      const fn = method('build')
      if (fn === undefined) {
        return Promise.resolve<RemoteResult<ChartDraft>>({ ok: false, error: { message: t('state.notMounted') } })
      }
      return fn(sessionId)
    },
    library: () => {
      const fn = method('library')
      if (fn === undefined) {
        return Promise.resolve<RemoteResult<SkillLibrary>>({ ok: false, error: { message: t('state.notMounted') } })
      }
      return fn()
    },
    save: (request: SaveRequest) => {
      const fn = method('save')
      if (fn === undefined) {
        return Promise.resolve<RemoteResult<SaveResult>>({ ok: false, error: { message: t('save.failed', { message: t('state.notMounted') }) } })
      }
      return fn(request)
    },
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'chart',
    order: 31,
    label: () => t('view.label'),
    inject: () => ({ actions, t }),
  }, (props: ChartViewSlotProps) => <ChartView {...props} />))
}
