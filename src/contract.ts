/**
 * dsh-chart — Shared strict Typert wire contract.
 *
 * One InvocationDescriptor per Remote method, pointed at by BOTH the host
 * manifest (typert.ts) and the client contribution (client/remote.ts), so the
 * two halves can never drift.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { ChartDraftSchema, SaveRequestSchema, SaveResultSchema, SkillLibrarySchema } from './schema.ts'

/** Wire codec for the target session id. */
export const sessionIdSchema = z.string().trim().min(1).max(200)

const parameter = (name: string, wire: string, typeSymbol: string, schema: z.ZodType) => ({
  name, wire, source: 'json' as const, codec: { mode: 'strict' as const, typeSymbol, schema },
})

const result = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })

const sessionIdParameter = parameter('sessionId', 'sessionId', 'dsh-chart#SessionId', sessionIdSchema)
const requestParameter = parameter('request', 'request', 'dsh-chart#SaveRequest', SaveRequestSchema)

/** Strict Typert descriptors shared by the host and browser halves. */
export const DSH_CHART_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-chart#chart/build', service: 'chart', namespace: 'chart', method: 'build', invocation: { kind: 'direct' },
    parameters: [sessionIdParameter], cancellation: { parameter: 'signal' },
    result: result('dsh-chart#ChartDraft', ChartDraftSchema),
  },
  {
    id: 'dsh-chart#chart/library', service: 'chart', namespace: 'chart', method: 'library', invocation: { kind: 'direct' },
    parameters: [],
    result: result('dsh-chart#SkillLibrary', SkillLibrarySchema),
  },
  {
    id: 'dsh-chart#chart/save', service: 'chart', namespace: 'chart', method: 'save', invocation: { kind: 'direct' },
    parameters: [requestParameter],
    result: result('dsh-chart#SaveResult', SaveResultSchema),
  },
]
