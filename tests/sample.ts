/**
 * Shared chart fixture shaped like the events `sessionQuery.readSession`
 * returns: `user/message` carries `data.content`, `session/title` carries
 * `data.title`, and `tool/result` answers a `tool/call` by `callId`.
 */
import { distillSession, type DistillOptions, type RawEvent, type RawHeader } from '../src/distill.ts'
import type { ChartDraft } from '../src/schema.ts'
import { zh, type Translate } from '../src/client/locales.ts'

export const BASE = 1_700_000_000_000
export const GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz01234567'
export const RELAY_KEY = 'sk_abcdefghijklmnopqrstuvwx'

export const sampleHeader: RawHeader = {
  id: 'session-01hchart',
  createdAt: BASE,
  cwd: 'E:/proj/chart-demo',
  agentPreset: 'standard',
}

/** One `tool/call` line. */
export function toolCall(seq: number, callId: string, name: string, args: Record<string, unknown>): RawEvent {
  return {
    type: 'tool/call',
    seq,
    time: BASE + seq * 1_000,
    data: { callId, name, arguments: JSON.stringify(args) },
  }
}

/** One `tool/result` line, successful unless an error is given. */
export function toolResult(seq: number, callId: string, text: string, error?: { name?: string; code?: string }): RawEvent {
  return {
    type: 'tool/result',
    seq,
    time: BASE + seq * 1_000,
    data: {
      message: {
        source: { callId },
        content: [{
          type: 'tool_result',
          ...(error === undefined ? {} : { isError: true }),
          content: [{ type: 'text', text }],
        }],
      },
      ...(error === undefined ? {} : { error }),
    },
  }
}

/** A successful one-command shell call plus its answer. */
export function shell(seq: number, callId: string, command: string, description?: string): RawEvent[] {
  return [
    toolCall(seq, callId, 'pwsh', { command, ...(description === undefined ? {} : { description }) }),
    toolResult(seq + 1, callId, 'ok'),
  ]
}

export const sampleEvents: readonly RawEvent[] = [
  { type: 'session', seq: 1, time: BASE, data: {} },
  { type: 'turn/start', seq: 2, time: BASE + 1_000, data: { turn: 1 } },
  {
    type: 'user/message', seq: 3, time: BASE + 1_000,
    data: { content: [{ type: 'text', text: `把构建检查和测试修好，顺便把 key = ${RELAY_KEY} 记一下` }] },
  },
  {
    type: 'assistant/message', seq: 4, time: BASE + 2_000,
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '先看一下现状。' }] } },
  },

  ...shell(5, 'c1', 'cd E:/proj/chart-demo'),
  toolCall(7, 'c2', 'edit', { file_path: 'E:/proj/chart-demo/src/a.ts', old_string: 'a', new_string: 'b' }),
  toolResult(8, 'c2', 'updated'),
  ...shell(9, 'c3', 'pnpm install', '装依赖'),

  toolCall(11, 'c4', 'pwsh', { command: 'pnpm test' }),
  toolResult(12, 'c4', '1 failed: expected 2, got 3', { name: 'ToolError', code: 'EXIT_1' }),

  { type: 'turn/start', seq: 13, time: BASE + 13_000, data: { turn: 2 } },
  ...shell(14, 'c5', 'pnpm run build'),
  ...shell(16, 'c6', 'pnpm test'),

  toolCall(18, 'c7', 'write', { file_path: 'E:/proj/chart-demo/src/b.ts', content: 'export const b = 2' }),
  toolResult(19, 'c7', 'wrote 21 bytes'),

  toolCall(20, 'c8', 'pwsh', { command: 'git push origin main' }),
  toolResult(21, 'c8', 'fatal: The current branch main has no upstream branch', { name: 'ToolError', code: 'EXIT_128' }),

  ...shell(22, 'c9', `curl -H "Authorization: Bearer ${GITHUB_TOKEN}" https://example.com/api`),
  ...shell(24, 'c10', 'echo done > out.txt'),

  toolCall(26, 'c11', 'edit', { file_path: 'E:/proj/chart-demo/src/missing.ts', old_string: 'x', new_string: 'y' }),
  toolResult(27, 'c11', 'file not found', { name: 'ToolError', code: 'ENOENT' }),

  ...shell(28, 'c12', 'ls'),
  ...shell(30, 'c13', 'npm run lint && tsc --noEmit'),

  { type: 'session/title', seq: 32, time: BASE + 32_000, data: { title: '给航图插件补测试' } },
  { type: 'turn/end', seq: 33, time: BASE + 33_000, data: { reason: { kind: 'completed' } } },
]

export const sampleOptions: DistillOptions = {
  redactSecrets: true,
  maxSteps: 30,
  platform: 'win32',
  now: BASE + 40_000,
}

/** Distill the sample with the given overrides. */
export function distillSample(
  events: readonly RawEvent[] = sampleEvents,
  options: Partial<DistillOptions> = {},
  header: RawHeader = sampleHeader,
): ChartDraft {
  return distillSession(header, events, { ...sampleOptions, ...options })
}

/** Minimal translator for the pure Markdown builders. */
export const t: Translate = (key, params) => {
  const template = (zh as unknown as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
}
