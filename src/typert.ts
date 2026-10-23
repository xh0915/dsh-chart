/**
 * dsh-chart — Host Typert manifest for the chart Remote.
 *
 * Reflection metadata only (the registry contributes no prompt, tool, or session
 * event). Keep `invocations` pointing at contract.ts, which the client half shares.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { DSH_CHART_INVOCATIONS } from './contract.ts'

/** Host manifest for the chart Remote. */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-chart', face: 'host', schemas: [],
  model: {
    services: [{
      key: 'chart', exportName: 'ChartRuntime',
      description: 'Distill one session log into a reusable skill draft and save it to the local skill library.',
      tags: [], members: [
        { kind: 'method', name: 'build', signature: 'build(sessionId: string, signal?: AbortSignal): Promise<ChartDraft>' },
        { kind: 'method', name: 'library', signature: 'library(): Promise<SkillLibrary>' },
        { kind: 'method', name: 'save', signature: 'save(request: SaveRequest): Promise<SaveResult>' },
      ], types: [],
    }], events: [], objects: [],
  },
  invocations: DSH_CHART_INVOCATIONS,
}
