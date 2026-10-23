/**
 * dsh-chart — Client Remote contribution and typed namespace face.
 *
 * `TypertRemoteNamespace$6368617274` is the hex encoding of the service key
 * "chart" (c=63 h=68 a=61 r=72 t=74). Keep this name and the TypertRemoteMap
 * keys in sync with the `id`s in contract.ts.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ChartDraft, SaveRequest, SaveResult, SkillLibrary } from '../schema.ts'
import { DSH_CHART_INVOCATIONS } from '../contract.ts'

/** Client contribution for the chart Remote. */
export const DSH_CHART_REMOTE: TypertRemoteContribution = { package: 'dsh-chart', descriptors: DSH_CHART_INVOCATIONS }

declare module '@deepseek-ai/dsh-typert-protocol' {
  /** The mounted chart namespace face. */
  interface TypertRemoteNamespace$6368617274 {
    build: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<ChartDraft>>
    library: () => Promise<RemoteResult<SkillLibrary>>
    save: (request: SaveRequest) => Promise<RemoteResult<SaveResult>>
  }
  interface TypertRemoteMap {
    'chart/build': TypertRemoteNamespace$6368617274['build']
    'chart/library': TypertRemoteNamespace$6368617274['library']
    'chart/save': TypertRemoteNamespace$6368617274['save']
  }
  interface TypertRemoteNamespaceMap { chart: TypertRemoteNamespace$6368617274 }
}
