/**
 * dsh-chart — Host Remote service.
 *
 * `chart.build(sessionId)` reads one real session log through the harness
 * session-query service and distills a skill draft. `chart.library()` lists the
 * user's existing skills, and `chart.save()` writes one SKILL.md into
 * `<dshHome>/skills` after re-redacting it. Nothing here invents a step: every
 * row points back at a real log event.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionLogSnapshot } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import { sessionIdSchema } from './contract.ts'
import { distillSession, type RawEvent, type RawHeader } from './distill.ts'
import { readLibrary, resolveSkillsRoot, saveSkill } from './library.ts'
import type { ChartDraft, SaveRequest, SaveResult, SkillLibrary } from './schema.ts'
import type { ResolvedConfig } from './types.ts'

/** Failure codes this service can forward from the query engine. */
const NOT_FOUND = 'SESSION_QUERY_SESSION_NOT_FOUND'
const ABORTED = 'SESSION_QUERY_ABORTED'
const CORRUPT = 'SESSION_QUERY_CORRUPT_SESSION'
const INVALID_SURFACE = 'SESSION_QUERY_INVALID_SURFACE'
const PERSISTENCE = 'SESSION_QUERY_PERSISTENCE_FAILED'

/** Map a query-engine failure onto copy the view can show honestly. */
function chartFailure(reason: unknown): Error {
  const code = (reason as { code?: unknown }).code
  if (typeof code === 'string') {
    if (code === NOT_FOUND) return new Error('CHART_NO_LOG|')
    if (code === ABORTED) return new Error('CHART_ABORTED|')
    if (code === CORRUPT || code === INVALID_SURFACE) return new Error('CHART_BAD_LOG|')
    if (code === PERSISTENCE) return new Error('CHART_UNREADABLE|')
  }
  return reason instanceof Error ? reason : new Error(String(reason))
}

/** Host-side service backing the `chart` Remote namespace. */
export class ChartRuntime extends TypertRemoteService {
  /** @param ctx - owning Cordis context. @param config - resolved plugin config. */
  constructor(ctx: Context, private readonly config: ResolvedConfig) { super(ctx, 'chart') }

  /**
   * Distill the session log of `sessionId` into a skill draft.
   * @param sessionId - the session the view is currently showing.
   * @param signal - transport cancellation from the browser.
   * @returns the redacted, evidence-backed draft.
   */
  @Remote
  async build(sessionId: string, signal?: AbortSignal): Promise<ChartDraft> {
    const id = sessionIdSchema.parse(sessionId)
    let snapshot: SessionLogSnapshot
    try {
      snapshot = await this.ctx.sessionQuery.readSession(id as unknown as SessionId)
    } catch (reason) {
      throw chartFailure(reason)
    }
    if (signal?.aborted) throw new Error('CHART_ABORTED|')

    const header = snapshot.session as unknown as RawHeader
    return distillSession(
      { id: String(header.id), createdAt: header.createdAt, cwd: header.cwd, agentPreset: header.agentPreset },
      snapshot.events as unknown as RawEvent[],
      {
        redactSecrets: this.config.redactSecrets,
        maxSteps: this.config.maxSteps,
        platform: process.platform,
        now: Date.now(),
      },
    )
  }

  /** List the skills already in the user library, so the view can warn about names. */
  @Remote
  async library(): Promise<SkillLibrary> {
    return readLibrary(resolveSkillsRoot())
  }

  /**
   * Write one SKILL.md into the user skill library.
   * @param request - slug, edited markdown, and the overwrite decision.
   * @returns the path, any backup, and the write-time redaction count.
   */
  @Remote
  async save(request: SaveRequest): Promise<SaveResult> {
    return saveSkill(resolveSkillsRoot(), request, this.config.redactSecrets)
  }
}
