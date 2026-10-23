/**
 * dsh-chart — The distiller.
 *
 * Turns one raw DSH session log into a ChartDraft: the commands that actually
 * worked, the checks that passed, the files that changed, and the failures worth
 * remembering. Pure and dependency-free so it can be tested against captured
 * events. Nothing here guesses intent: a step exists because a tool call
 * succeeded, a pitfall exists because a tool call failed, and a file exists
 * because the session edited it.
 */
import { Redactor } from './redact.ts'
import type { ChartDraft, ChartEnvironment, ChartPitfall, ChartStep } from './schema.ts'

/** The shape of a raw log line as it arrives from `sessionQuery.readSession`. */
export interface RawEvent {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
}

/** The session header line. */
export interface RawHeader {
  readonly id: string
  readonly createdAt: number
  readonly cwd?: string
  readonly agentPreset?: string
}

/** Distillation knobs resolved from the plugin Config. */
export interface DistillOptions {
  readonly redactSecrets: boolean
  readonly maxSteps: number
  /** Host platform, passed in so the distiller stays pure. */
  readonly platform: string
  /** Clock; injected by tests. */
  readonly now: number
}

const LIMIT = {
  title: 100,
  goal: 600,
  command: 1200,
  description: 160,
  error: 400,
  path: 400,
  preset: 40,
  cwd: 400,
  name: 60,
} as const

const MAX_CHECKS = 12
const MAX_PITFALLS = 12
const MAX_FILES = 24

/** Commands that only look around; they are not steps worth repeating. */
const NOISE: readonly RegExp[] = [
  /^(?:cd|pushd|popd|pwd|ls|dir|cat|type|head|tail|less|more|clear|cls|whoami|which|where|whereis)\b/i,
  /^(?:get-location|set-location|get-childitem|get-content|write-output|write-host|test-path|resolve-path)\b/i,
  /^(?:echo|printf)\b/i,
  /^(?:git\s+(?:status|log|diff|show|branch|remote|rev-parse|describe|config\s+--get))\b/i,
]

/** A command is a check only when every chained segment is a verification. */
const CHECK_SEGMENT: readonly RegExp[] = [
  /^(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|tests|check|typecheck|lint|build|verify|e2e)\b/i,
  /^(?:pnpm|npm|yarn|bun)\s+(?:exec\s+)?(?:tsc|eslint|vitest|jest)\b/i,
  /^(?:npx\s+)?(?:vitest|jest|pytest|playwright|cypress)\b/i,
  /^tsc\b/i,
  /^eslint\b/i,
  /^make\s+(?:test|check|build|lint)\b/i,
  /^cargo\s+(?:test|check|build)\b/i,
  /^go\s+(?:test|vet|build)\b/i,
  /^dotnet\s+(?:test|build)\b/i,
  /^python(?:3)?\s+-m\s+(?:pytest|unittest|compileall)\b/i,
  /^git\s+ls-remote\b/i,
  /^curl\b/i,
  /^Invoke-(?:WebRequest|RestMethod)\b/i,
]

const PACKAGE_MANAGER = /\b(pnpm|yarn|bun|npm|npx|corepack)\s+/i
const GIT = /\bgit\s+\S+/i
const SHELLS = new Set(['pwsh', 'bash'])

/** Words that make a bad skill name on their own. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'from', 'into', 'onto', 'via',
  'this', 'that', 'these', 'those', 'then', 'than', 'there', 'here', 'when', 'what',
  'how', 'why', 'you', 'your', 'yours', 'our', 'ours', 'we', 'are', 'was', 'were',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'have', 'has',
  'had', 'please', 'help', 'let', 'lets', 'make', 'made', 'get', 'got', 'put', 'run',
  'running', 'use', 'using', 'used', 'need', 'needs', 'want', 'wants', 'now', 'also',
  'just', 'only', 'very', 'some', 'any', 'all', 'not', 'yes', 'new', 'old', 'more',
  'most', 'it', 'its', 'is', 'be', 'do', 'does', 'did', 'to', 'of', 'on', 'in', 'at',
  'as', 'so', 'such', 'too', 'my', 'me', 'i', 'we', 'up', 'out', 'off', 'over', 'add',
])

function dict(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** Trim to an exact length budget, counting the ellipsis inside it. */
function hard(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

/** Collapse whitespace runs so a one-line label stays on one line. */
function inline(value: string, limit: number): string {
  return hard(value.replace(/\s+/g, ' ').trim(), limit)
}

/** Concatenate the `text` blocks of a message content array. */
function textOf(content: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of content) {
    const record = dict(block)
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n').trim()
}

/** Pull the printable body and error flag out of a `tool/result` payload. */
function resultBody(data: Record<string, unknown>): { text: string; isError: boolean } {
  const blocks = list(dict(data.message).content)
  const parts: string[] = []
  let isError = false
  for (const block of blocks) {
    const record = dict(block)
    for (const inner of list(record.content)) {
      const item = dict(inner)
      if (typeof item.text === 'string') parts.push(item.text)
    }
    if (record.isError === true) isError = true
  }
  return { text: parts.join('\n').trim(), isError }
}

/** Parse a tool call's `arguments` JSON defensively. */
function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw === '') return {}
  try {
    return dict(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

/** Normalize a command for dedupe without changing what it does. */
function normalize(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

/** Split a shell line into the parts chained with `&&`, `||`, `;`, or newlines. */
function segments(command: string): string[] {
  return command.split(/\r?\n|&&|\|\||;/).map((part) => part.trim()).filter((part) => part !== '')
}

/** Whether a whole command only inspects state. */
function isNoise(command: string): boolean {
  const parts = segments(command)
  if (parts.length === 0) return true
  return parts.every((part) => {
    const text = part.trim()
    // A redirect writes a file; that is not a look-around, whatever the command.
    if (/>>?/.test(text)) return false
    return NOISE.some((rule) => rule.test(text))
  })
}

/** Whether every chained segment is a verification command. */
function isCheck(command: string): boolean {
  const parts = segments(command)
  if (parts.length === 0) return false
  return parts.every((part) => CHECK_SEGMENT.some((rule) => rule.test(part)))
}

/** Display a logged path relative to the workspace when it sits inside it. */
export function workspacePath(cwd: string, path: string, platform: string): string {
  if (cwd === '' || path === '') return path
  const normalizeSlash = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const root = normalizeSlash(cwd)
  const full = normalizeSlash(path)
  const fold = (value: string) => (platform === 'win32' ? value.toLowerCase() : value)
  if (fold(full) === fold(root)) return '.'
  if (fold(full).startsWith(`${fold(root)}/`)) return full.slice(root.length + 1)
  return path
}

/** Propose a kebab-case skill name from the session's own words. */
export function suggestName(title: string, goal: string, sessionId: string): string {
  const words = `${title} ${goal}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word))
  const seen = new Set<string>()
  const kept: string[] = []
  for (const word of words) {
    if (seen.has(word)) continue
    seen.add(word)
    kept.push(word)
    if (kept.length === 4) break
  }
  const joined = kept.join('-').slice(0, LIMIT.name).replace(/-+$/, '')
  if (kept.length >= 2 && joined.length >= 6) return joined
  const cleaned = sessionId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const tail = cleaned.slice(cleaned.lastIndexOf('-') + 1).slice(-12)
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `session-${stamp}-${tail === '' ? 'skill' : tail}`
}

/** Mutable file accumulator; the wire type is readonly. */
interface FileAccumulator {
  path: string
  edits: number
  writes: number
  firstTurn: number
  lastTurn: number
}

/** A command call and the result that answered it. */
interface Call {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly turn: number
  readonly seq: number
  readonly time: number
  readonly result?: { text: string; isError: boolean; errorName?: string; errorCode?: string }
}

/** Distill one session log into a reusable skill draft. */
export function distillSession(header: RawHeader, events: readonly RawEvent[], options: DistillOptions): ChartDraft {
  const redactor = new Redactor(options.redactSecrets)
  const clip = (value: string | undefined, limit: number): string => redactor.clip(value, limit) ?? ''
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  // Pair each tool result with its call before the main pass needs it.
  const results = new Map<string, { text: string; isError: boolean; errorName?: string; errorCode?: string }>()
  for (const event of ordered) {
    if (event.type !== 'tool/result') continue
    const data = dict(event.data)
    const callId = str(dict(dict(data.message).source).callId)
    if (callId === undefined) continue
    const body = resultBody(data)
    const error = dict(data.error)
    results.set(callId, {
      text: body.text,
      isError: body.isError,
      ...(Object.keys(error).length === 0
        ? {}
        : { errorName: str(error.name), errorCode: str(error.code) }),
    })
  }

  const calls: Call[] = []
  let firstPrompt = ''
  let sessionTitle = ''
  let turn = 1
  let turns = 0
  let endedAt = header.createdAt
  let throughSeq = 0

  for (const event of ordered) {
    const at = event.time ?? endedAt
    if (at > endedAt) endedAt = at
    if ((event.seq ?? 0) > throughSeq) throughSeq = event.seq ?? 0
    const data = dict(event.data)
    if (event.type === 'turn/start') {
      turns += 1
      turn = num(data.turn) ?? turn + 1
      continue
    }
    if (event.type === 'user/message') {
      if (firstPrompt === '') firstPrompt = textOf(list(data.content))
      continue
    }
    if (event.type === 'session/title') {
      const title = str(data.title)
      if (title !== undefined && title.trim() !== '') sessionTitle = title
      continue
    }
    if (event.type !== 'tool/call') continue
    const name = str(data.name) ?? ''
    if (name === '') continue
    const callId = str(data.callId)
    const answered = callId === undefined ? undefined : results.get(callId)
    calls.push({
      name,
      args: parseArgs(str(data.arguments)),
      turn,
      seq: event.seq ?? 0,
      time: at,
      ...(answered === undefined ? {} : { result: answered }),
    })
  }

  const steps: ChartStep[] = []
  const checks: ChartStep[] = []
  const pitfalls: ChartPitfall[] = []
  const files = new Map<string, FileAccumulator>()
  const shells: string[] = []
  const packageManagers: string[] = []
  let usesGit = false
  let commands = 0
  let failures = 0
  let stepsSeen = 0
  let truncated = false

  /** First successful call for each normalized command; used to prove a retry worked. */
  const firstSuccess = new Map<string, number>()
  const successful: Array<{ call: Call; command: string; index: number }> = []
  for (const [index, call] of calls.entries()) {
    if (!SHELLS.has(call.name)) continue
    const command = str(call.args.command)
    if (command === undefined || command.trim() === '') continue
    if (call.result === undefined || call.result.isError || call.result.errorName !== undefined) continue
    const key = normalize(command)
    if (!firstSuccess.has(key)) firstSuccess.set(key, index)
    successful.push({ call, command, index })
  }

  for (const call of calls) {
    if (SHELLS.has(call.name)) {
      commands += 1
      const command = str(call.args.command) ?? ''
      const manager = PACKAGE_MANAGER.exec(command)
      if (manager !== null && manager[1] !== undefined) {
        const found = manager[1].toLowerCase()
        if (!packageManagers.includes(found)) packageManagers.push(found)
      }
      if (GIT.test(command)) usesGit = true
      if (!shells.includes(call.name)) shells.push(call.name)
      if (call.result !== undefined && (call.result.isError || call.result.errorName !== undefined)) failures += 1
    }
    if (call.name === 'edit' || call.name === 'write') {
      const result = call.result
      if (result === undefined || result.isError || result.errorName !== undefined) continue
      const path = str(call.args.file_path)
      if (path === undefined || path.trim() === '') continue
      const display = workspacePath(header.cwd ?? '', path, options.platform)
      const seen = files.get(display)
      if (seen === undefined) {
        files.set(display, {
          path: hard(display, LIMIT.path),
          edits: call.name === 'edit' ? 1 : 0,
          writes: call.name === 'write' ? 1 : 0,
          firstTurn: call.turn,
          lastTurn: call.turn,
        })
      } else {
        if (call.name === 'edit') seen.edits += 1
        else seen.writes += 1
        seen.lastTurn = call.turn
      }
    }
  }

  const stepKeys = new Set<string>()
  for (const entry of successful) {
    const { call, command } = entry
    const key = normalize(command)
    if (isNoise(command)) continue
    const description = clip(str(call.args.description), LIMIT.description)
    const step: ChartStep = {
      command: clip(command, LIMIT.command),
      ...(description === '' ? {} : { description: inline(description, LIMIT.description) }),
      turn: call.turn,
      seq: call.seq,
      time: call.time,
    }
    if (isCheck(command)) {
      if (!stepKeys.has(`check:${key}`) && checks.length < MAX_CHECKS) {
        checks.push(step)
        stepKeys.add(`check:${key}`)
      } else if (checks.length >= MAX_CHECKS) {
        truncated = true
      }
      continue
    }
    if (stepKeys.has(`step:${key}`)) continue
    stepsSeen += 1
    stepKeys.add(`step:${key}`)
    if (steps.length < options.maxSteps) steps.push(step)
    else truncated = true
  }

  const seenPitfalls = new Set<string>()
  for (const [index, call] of calls.entries()) {
    if (!SHELLS.has(call.name) || call.result === undefined) continue
    const result = call.result
    if (!result.isError && result.errorName === undefined) continue
    const command = str(call.args.command) ?? ''
    if (command.trim() === '' || isNoise(command)) continue
    const error = clip(result.text, LIMIT.error)
    const fallback = [result.errorName, result.errorCode].filter((part) => part !== undefined).join(' · ')
    const message = inline(error === '' ? fallback : error, LIMIT.error)
    // Without any error text there is nothing to remember; the failure still counts.
    if (message === '') continue
    const key = normalize(command)
    if (seenPitfalls.has(`${key}\u0000${message}`)) continue
    seenPitfalls.add(`${key}\u0000${message}`)
    if (pitfalls.length >= MAX_PITFALLS) {
      truncated = true
      continue
    }
    const fixIndex = firstSuccess.get(key)
    const fix = fixIndex !== undefined && fixIndex > index ? successful.find((entry) => entry.index === fixIndex) : undefined
    pitfalls.push({
      command: clip(command, LIMIT.command),
      error: message,
      turn: call.turn,
      seq: call.seq,
      ...(fix === undefined ? {} : { fixedInTurn: fix.call.turn }),
    })
  }

  const firstPromptClipped = clip(firstPrompt, LIMIT.goal)
  const titleSource = sessionTitle !== '' ? sessionTitle : firstPrompt
  const title = titleSource === '' ? '' : inline(clip(titleSource, LIMIT.goal), LIMIT.title)
  const goal = inline(firstPromptClipped, LIMIT.goal)
  const fileList = [...files.values()].sort((a, b) => b.edits + b.writes - (a.edits + a.writes) || a.path.localeCompare(b.path))
  if (fileList.length > MAX_FILES) truncated = true

  const environment: ChartEnvironment = {
    platform: options.platform,
    shells,
    packageManagers,
    usesGit,
  }

  return {
    sessionId: header.id,
    title,
    goal,
    cwd: hard(header.cwd ?? '', LIMIT.cwd),
    agentPreset: hard(header.agentPreset ?? '', LIMIT.preset),
    startedAt: header.createdAt,
    endedAt,
    generatedAt: options.now,
    throughSeq,
    environment,
    steps,
    checks,
    files: fileList.slice(0, MAX_FILES),
    pitfalls,
    suggestedName: suggestName(title, firstPromptClipped, header.id),
    counts: {
      turns: turns === 0 && calls.length > 0 ? 1 : turns,
      steps: stepsSeen,
      commands,
      failures,
      filesChanged: files.size,
      rawEvents: ordered.length,
    },
    redaction: redactor.summary(),
    truncated,
  }
}
