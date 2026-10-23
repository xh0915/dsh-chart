/**
 * dsh-chart — The chart view.
 *
 * One tab in the conversation view ring. It asks the host to distill the
 * *current* session, shows everything that was found with its evidence, and
 * turns the result into a SKILL.md the user can edit, copy, download, and save
 * into the local skill library. Every line on the left traces to a real session
 * event; the right side is the file the user is about to keep.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChartDraft, SaveRequest, SaveResult, SkillLibrary } from '../schema.ts'
import type { Translate } from './locales.ts'
import { buildSkillMarkdown, draftTitle, skillFileName, stamp, syncFrontmatterName, type DraftOptions } from './skill.ts'
import { localizeBuildError, localizeSaveError } from './errors.ts'

/** Re-declare the view seat so this plugin types its registration without importing ui-conversation. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.view': {
      kind: 'list'
      scope: 'session'
      owner: { inspect?: { callId: string } | null; onInspectDone?: () => void }
    }
  }
}

/** Runtime shape the mounted chart namespace returns. */
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** The host Remote face passed into the view. */
export interface ChartActions {
  build: (sessionId: string) => Promise<RemoteResult<ChartDraft>>
  library: () => Promise<RemoteResult<SkillLibrary>>
  save: (request: SaveRequest) => Promise<RemoteResult<SaveResult>>
}

/** Props the view-tab slot component receives (slot runtime + inject face). */
export type ChartViewSlotProps = PropsRuntime<'conversation.view'> & {
  actions: ChartActions
  t: Translate
}

type Phase = 'loading' | 'ready' | 'error'

/** Which sections the draft should carry; the name is edited separately. */
type Includes = Omit<DraftOptions, 'name'>

/** The same grammar the harness and the host enforce. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const ALL_INCLUDES: Includes = {
  includeGoal: true,
  includeBefore: true,
  includeSteps: true,
  includeChecks: true,
  includeFiles: true,
  includePitfalls: true,
}

const MARK = (
  <svg className="c-mark" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M7.4 15.6l3.1-4.1 2.4 2 3.7-4.8" />
    <circle cx="7.4" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="16.6" cy="8.7" r="1.15" fill="currentColor" stroke="none" />
  </svg>
)

/** Copy text, falling back to a selection when the async clipboard is unavailable. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Save the draft through a local object URL; nothing leaves the machine. */
function downloadMarkdown(markdown: string, name: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => { URL.revokeObjectURL(url) }, 30_000)
}

/** Keep a host suggestion usable as a folder name. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Pick a free folder name, so the suggestion never silently collides. */
function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const stem = base === '' ? 'session-skill' : base
  if (!taken.has(stem)) return stem
  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`
    const candidate = `${stem.slice(0, 60 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return stem
}

/** Localized platform name, falling back to the raw value. */
function platformLabel(platform: string, t: Translate): string {
  if (platform === 'win32') return t('platform.win32')
  if (platform === 'darwin') return t('platform.darwin')
  if (platform === 'linux') return t('platform.linux')
  return platform
}

/** Localized shell name, falling back to the raw value. */
function shellLabel(shell: string, t: Translate): string {
  if (shell === 'pwsh') return t('shell.pwsh')
  if (shell === 'bash') return t('shell.bash')
  return shell
}

/** The `edits · writes · turns` readout for one changed file. */
function fileReadout(file: ChartDraft['files'][number], t: Translate): string {
  const operations = [
    file.edits > 0 ? t('step.edits', { count: String(file.edits) }) : '',
    file.writes > 0 ? t('step.writes', { count: String(file.writes) }) : '',
  ].filter((part) => part !== '').join(' · ')
  const turns = file.firstTurn === file.lastTurn
    ? t('step.turnOne', { turn: String(file.firstTurn) })
    : t('step.turns', { first: String(file.firstTurn), last: String(file.lastTurn) })
  return `${operations} · ${turns}`
}

/** The chart tab body. */
export function ChartView({ sessionId, actions, t }: ChartViewSlotProps) {
  const [draft, setDraft] = useState<ChartDraft | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [failure, setFailure] = useState('')
  const [nonce, setNonce] = useState(0)

  const [library, setLibrary] = useState<SkillLibrary | null>(null)
  const [libraryError, setLibraryError] = useState('')
  const [libraryNonce, setLibraryNonce] = useState(0)

  const [typedSlug, setTypedSlug] = useState<string | null>(null)
  const [options, setOptions] = useState<Includes>(ALL_INCLUDES)
  const [markdown, setMarkdown] = useState('')
  const [edited, setEdited] = useState(false)

  const [saveOpen, setSaveOpen] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (sessionId === undefined || sessionId === '') {
      setDraft(null)
      setMarkdown('')
      setPhase('ready')
      setFailure('')
      return
    }
    let cancelled = false
    setPhase('loading')
    setFailure('')
    void actions.build(sessionId).then(
      (result) => {
        if (cancelled) return
        if (result.ok) {
          setDraft(result.value)
          setEdited(false)
          setTypedSlug(null)
          setSaveOpen(false)
          setSaveError('')
          setPhase('ready')
        } else {
          setFailure(localizeBuildError(result.error.message, t))
          setPhase('error')
        }
      },
      (reason: unknown) => {
        if (cancelled) return
        setFailure(localizeBuildError(reason instanceof Error ? reason.message : String(reason), t))
        setPhase('error')
      },
    )
    return () => { cancelled = true }
  }, [sessionId, actions, t, nonce])

  const loadLibrary = useCallback(() => {
    setLibraryError('')
    void actions.library().then(
      (result) => {
        if (result.ok) setLibrary(result.value)
        else setLibraryError(localizeSaveError(result.error.message, t))
      },
      (reason: unknown) => {
        setLibraryError(localizeSaveError(reason instanceof Error ? reason.message : String(reason), t))
      },
    )
  }, [actions, t])

  useEffect(() => { loadLibrary() }, [loadLibrary, libraryNonce])

  const say = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToast('') }, 3600)
  }, [])

  useEffect(() => () => { if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current) }, [])

  useEffect(() => {
    if (!saveOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSaveOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [saveOpen])

  const taken = useMemo(() => new Set((library?.skills ?? []).map((skill) => skill.name)), [library])
  const autoSlug = useMemo(() => uniqueSlug(slugify(draft?.suggestedName ?? ''), taken), [draft, taken])
  const slug = typedSlug ?? autoSlug
  const slugOk = SLUG.test(slug)

  const existing = library !== null && library.skills.some((skill) => skill.name === slug)
  const targetPath = library === null ? '' : `${library.displayRoot}/${slug}/SKILL.md`
  const draftOptions = useMemo<DraftOptions>(() => ({ name: slug, ...options }), [slug, options])

  useEffect(() => {
    if (draft === null || edited) return
    setMarkdown(buildSkillMarkdown(draft, t, draftOptions))
  }, [draft, edited, draftOptions, t])

  /** The name input and the folder must agree; only that line is rewritten. */
  useEffect(() => {
    if (!edited) return
    setMarkdown((previous) => syncFrontmatterName(previous, slug))
  }, [slug, edited])

  const regenerate = useCallback(() => {
    if (draft === null) return
    setMarkdown(buildSkillMarkdown(draft, t, draftOptions))
    setEdited(false)
    say(t('action.regenerated'))
  }, [draft, draftOptions, say, t])

  const canSave = draft !== null && library !== null && slugOk && markdown.trim() !== ''

  const onCopy = useCallback(() => {
    if (markdown.trim() === '') return
    void writeClipboard(markdown).then((ok) => { say(ok ? t('action.copied') : t('action.copyFailed')) })
  }, [markdown, say, t])

  const onDownload = useCallback(() => {
    if (markdown.trim() === '') return
    downloadMarkdown(markdown, skillFileName(slugOk ? slug : ''))
    say(t('action.downloaded'))
  }, [markdown, say, slug, slugOk, t])

  const openSave = useCallback(() => {
    if (!canSave) return
    setSaveError('')
    setOverwrite(false)
    setSaveOpen(true)
  }, [canSave])

  const confirmSave = useCallback(() => {
    if (!canSave || saving) return
    const request: SaveRequest = { slug, markdown: syncFrontmatterName(markdown, slug), overwrite }
    setSaving(true)
    setSaveError('')
    void actions.save(request).then(
      (result) => {
        setSaving(false)
        if (!result.ok) {
          setSaveError(t('save.failed', { message: localizeSaveError(result.error.message, t) }))
          return
        }
        setSaveOpen(false)
        setOverwrite(false)
        setTypedSlug(slug)
        loadLibrary()
        const backup = result.value.backupDisplayPath === undefined
          ? ''
          : ` · ${t('save.backup', { path: result.value.backupDisplayPath })}`
        const redacted = result.value.redaction.count > 0
          ? ` · ${t('save.redactedOnWrite', { count: String(result.value.redaction.count) })}`
          : ''
        say(t('save.done', { path: result.value.displayPath }) + backup + redacted)
      },
      (reason: unknown) => {
        setSaving(false)
        setSaveError(t('save.failed', {
          message: localizeSaveError(reason instanceof Error ? reason.message : String(reason), t),
        }))
      },
    )
  }, [actions, canSave, loadLibrary, markdown, overwrite, say, saving, slug, t])

  if (phase === 'loading' && draft === null) {
    return (
      <div className="c-root">
        <div className="c-inner">
          <div className="c-state"><span className="c-spin" />{t('state.loading')}</div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="c-root">
        <div className="c-inner">
          <div className="c-bar">
            <button type="button" className="c-btn primary" onClick={() => { setNonce((value) => value + 1) }}>{t('action.refresh')}</button>
            <span className="c-spacer" />
          </div>
          <div className="c-empty">{t('state.error', { message: failure })}</div>
        </div>
      </div>
    )
  }

  if (draft === null) {
    return (
      <div className="c-root">
        <div className="c-inner"><div className="c-empty">{t('state.noSession')}</div></div>
      </div>
    )
  }

  const chips: ReactNode[] = [
    <span className="c-chip" key="gen">{t('hero.generated', { time: stamp(draft.generatedAt) })}</span>,
    <span className="c-chip" key="seq">{t('hero.throughSeq', { seq: String(draft.throughSeq) })}</span>,
  ]
  if (draft.redaction.enabled && draft.redaction.count > 0) {
    chips.push(<span className="c-chip" key="rd" title={draft.redaction.kinds.join(', ')}>{t('note.redacted', { count: String(draft.redaction.count) })}</span>)
  } else if (!draft.redaction.enabled) {
    chips.push(<span className="c-chip warn" key="rdoff">{t('note.redactOff')}</span>)
  }
  if (draft.truncated) chips.push(<span className="c-chip warn" key="tr">{t('note.truncated')}</span>)

  const metrics: Array<[string, string, string]> = [
    [t('metric.turns'), String(draft.counts.turns), ''],
    [t('metric.steps'), String(draft.steps.length), ''],
    [t('metric.checks'), String(draft.checks.length), ''],
    [t('metric.pitfalls'), String(draft.pitfalls.length), draft.pitfalls.length > 0 ? 'warn' : ''],
    [t('metric.files'), String(draft.files.length), ''],
    [t('metric.commands'), String(draft.counts.commands), ''],
    [t('metric.rawEvents'), String(draft.counts.rawEvents), ''],
  ]

  const nothingFound = draft.goal === '' && draft.steps.length === 0 && draft.checks.length === 0
    && draft.files.length === 0 && draft.pitfalls.length === 0

  const nameBad = slug === '' || !slugOk
  const includeRows: Array<[keyof Includes, string]> = [
    ['includeGoal', t('filter.goal')],
    ['includeBefore', t('filter.before')],
    ['includeSteps', t('filter.steps')],
    ['includeChecks', t('filter.checks')],
    ['includeFiles', t('filter.files')],
    ['includePitfalls', t('filter.pitfalls')],
  ]

  const facts: Array<[string, ReactNode]> = []
  if (draft.cwd !== '') facts.push([t('prereq.cwd'), <code className="c-code">{draft.cwd}</code>])
  facts.push([t('prereq.platform'), platformLabel(draft.environment.platform, t)])
  if (draft.environment.shells.length > 0) {
    facts.push([t('prereq.shell'), draft.environment.shells.map((shell) => shellLabel(shell, t)).join(', ')])
  }
  if (draft.environment.packageManagers.length > 0) {
    facts.push([t('prereq.pm'), draft.environment.packageManagers.join(', ')])
  }
  if (draft.environment.usesGit) facts.push([t('prereq.git'), t('prereq.gitYes')])

  return (
    <div className="c-root">
      <div className="c-inner">
        <div className="c-bar">
          <button type="button" className="c-btn" onClick={() => { setNonce((value) => value + 1) }} disabled={phase === 'loading'}>
            {phase === 'loading' ? t('action.refreshing') : t('action.refresh')}
          </button>
          <button type="button" className="c-btn" onClick={onCopy} disabled={markdown.trim() === ''}>{t('action.copy')}</button>
          <button type="button" className="c-btn" onClick={onDownload} disabled={markdown.trim() === ''}>{t('action.download')}</button>
          <span className="c-spacer" />
          {phase === 'loading' ? <span className="c-chip">{t('action.refreshing')}</span> : null}
          <button type="button" className="c-btn primary" onClick={openSave} disabled={!canSave}>{t('action.save')}</button>
        </div>

        <header className="c-hero">
          {MARK}
          <div>
            <h2>{draftTitle(draft, t)}</h2>
            <p className="c-sub">
              {t('meta.session')}：{draft.sessionId}
              {draft.agentPreset === '' ? null : <> · {t('meta.preset')}：{draft.agentPreset}</>}
            </p>
            <div className="c-chips">{chips}</div>
          </div>
        </header>

        <div className="c-grid">
          {metrics.map(([label, value, tone]) => (
            <div className={tone === '' ? 'c-cell' : `c-cell ${tone}`} key={label}><b>{value}</b><span>{label}</span></div>
          ))}
        </div>

        <div className="c-cols">
          <div>
            <h3 className="c-h">{t('section.found')}</h3>

            {nothingFound ? <div className="c-empty inline">{t('state.empty')}</div> : null}

            {draft.goal !== '' ? (
              <section className="c-panel">
                <h4>{t('section.goal')}</h4>
                <p className="c-goal">{draft.goal}</p>
              </section>
            ) : null}

            <section className="c-panel">
              <h4>{t('section.steps')} <span className="c-count">{draft.steps.length}</span></h4>
              {draft.steps.length === 0 ? <p className="c-hint">{t('empty.steps')}</p> : (
                <ol className="c-steps">
                  {draft.steps.map((step, index) => (
                    <li className="c-step" key={`${step.seq}-${index}`}>
                      <span className="c-step-n">{index + 1}</span>
                      <div className="c-step-b">
                        {step.description === undefined ? null : <p className="c-step-d">{step.description}</p>}
                        {step.command.includes('\n') || step.command.length > 120
                          ? <pre className="c-pre">{step.command}</pre>
                          : <code className="c-code">{step.command}</code>}
                        <span className="c-turn">{t('step.turn', { turn: String(step.turn) })}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="c-panel">
              <h4>{t('section.checks')} <span className="c-count">{draft.checks.length}</span></h4>
              {draft.checks.length === 0 ? <p className="c-hint">{t('empty.checks')}</p> : (
                <>
                  <p className="c-hint">{t('step.checkNote')}</p>
                  <ul className="c-rows-list">
                    {draft.checks.map((check, index) => (
                      <li key={`${check.seq}-${index}`}>
                        <code className="c-code">{check.command}</code>
                        <span className="c-turn">{t('step.turn', { turn: String(check.turn) })}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="c-panel">
              <h4>{t('section.files')} <span className="c-count">{draft.files.length}</span></h4>
              {draft.files.length === 0 ? <p className="c-hint">{t('empty.files')}</p> : (
                <ul className="c-rows-list">
                  {draft.files.map((file) => (
                    <li key={file.path}>
                      <code className="c-code">{file.path}</code>
                      <span className="c-sub">{fileReadout(file, t)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="c-panel">
              <h4>{t('section.pitfalls')} <span className="c-count">{draft.pitfalls.length}</span></h4>
              {draft.pitfalls.length === 0 ? <p className="c-hint">{t('empty.pitfalls')}</p> : (
                <ul className="c-rows-list">
                  {draft.pitfalls.map((pitfall, index) => (
                    <li className="c-pit" key={`${pitfall.seq}-${index}`}>
                      <code className="c-code">{pitfall.command}</code>
                      <p className="c-err-text">{pitfall.error}</p>
                      <div className="c-pit-meta">
                        <span className={pitfall.fixedInTurn === undefined ? 'c-chip warn' : 'c-chip ok'}>
                          {pitfall.fixedInTurn === undefined
                            ? t('step.unfixed')
                            : t('step.fixed', { turn: String(pitfall.fixedInTurn) })}
                        </span>
                        <span className="c-turn">{t('step.turn', { turn: String(pitfall.turn) })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="c-panel">
              <h4>{t('section.before')}</h4>
              <dl className="c-facts">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <p className="c-local">{t('note.evidence')}</p>
          </div>

          <aside className="c-side">
            <div className="c-panel">
              <h3 className="c-h">{t('section.draft')}</h3>

              <div className="c-field">
                <label className="c-flabel" htmlFor="dsh-chart-name">{t('draft.name')}</label>
                <input
                  id="dsh-chart-name"
                  className={nameBad ? 'c-input bad' : 'c-input'}
                  value={slug}
                  maxLength={60}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={nameBad}
                  onChange={(event) => { setTypedSlug(event.target.value) }}
                />
                <p className={nameBad ? 'c-hint bad' : 'c-hint'}>{nameBad ? t('draft.nameBad') : t('draft.nameHint')}</p>
                {existing ? <p className="c-hint warn">{t('draft.exists', { name: slug })}</p> : null}
              </div>

              <div className="c-field">
                <span className="c-flabel">{t('filter.title')}</span>
                <div className="c-checks">
                  {includeRows.map(([key, label]) => (
                    <label className="c-check" key={key}>
                      <input
                        type="checkbox"
                        checked={options[key]}
                        onChange={() => { setOptions((previous) => ({ ...previous, [key]: !previous[key] })) }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="c-hint">{t('filter.hint')}</p>
              </div>

              <div className="c-editor-h">
                <span className="c-flabel">{t('draft.editorLabel')}</span>
                {edited ? <span className="c-chip warn">{t('draft.edited')}</span> : null}
                <span className="c-spacer" />
                <span className="c-hint">{t('draft.length', { count: String(markdown.length) })}</span>
                {edited ? <button type="button" className="c-btn" onClick={regenerate}>{t('action.regenerate')}</button> : null}
              </div>
              <textarea
                id="dsh-chart-markdown"
                className="c-editor"
                value={markdown}
                rows={24}
                spellCheck={false}
                aria-label={t('draft.editorLabel')}
                onChange={(event) => {
                  setMarkdown(event.target.value)
                  if (!edited) setEdited(true)
                }}
              />
              <p className="c-hint">{edited ? t('draft.regenerateHint') : t('draft.editorHint')}</p>

              {libraryError === '' ? null : (
                <p className="c-warn">
                  {libraryError}
                  {' '}
                  <button type="button" className="c-link" onClick={() => { setLibraryNonce((value) => value + 1) }}>{t('action.retry')}</button>
                </p>
              )}

              <div className="c-actions start">
                <button type="button" className="c-btn" onClick={onCopy} disabled={markdown.trim() === ''}>{t('action.copy')}</button>
                <button type="button" className="c-btn" onClick={onDownload} disabled={markdown.trim() === ''}>{t('action.download')}</button>
                <button type="button" className="c-btn primary" onClick={openSave} disabled={!canSave}>{t('action.save')}</button>
              </div>

              <p className="c-local">{t('note.local')}</p>
            </div>
          </aside>
        </div>
      </div>

      {saveOpen ? (
        <div className="c-veil" role="dialog" aria-modal="true" aria-label={t('save.title')} onClick={() => { if (!saving) setSaveOpen(false) }}>
          <div className="c-modal" onClick={(event) => { event.stopPropagation() }}>
            <h3>{t('save.title')}</h3>
            <p className="hint">{t('save.hint')}</p>

            <div className="c-field">
              <span className="c-flabel">{t('save.path')}</span>
              <code className="c-path">{targetPath}</code>
            </div>

            {existing ? (
              <div className="c-warn">
                <p>{t('save.exists', { name: slug })}</p>
                <label className="c-check">
                  <input type="checkbox" checked={overwrite} onChange={() => { setOverwrite((value) => !value) }} />
                  <span>{t('save.overwrite')}</span>
                </label>
              </div>
            ) : null}

            <p className="c-hint">{draft.redaction.enabled ? t('save.note') : t('save.noteOff')}</p>
            {saveError === '' ? null : <p className="c-warn">{saveError}</p>}

            <div className="c-actions">
              <button type="button" className="c-btn" onClick={() => { setSaveOpen(false) }} disabled={saving}>{t('action.cancel')}</button>
              <button
                type="button"
                className="c-btn primary"
                onClick={confirmSave}
                disabled={saving || (existing && !overwrite) || !canSave}
              >
                {saving ? t('action.saving') : t('save.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast === '' ? null : <div className="c-toast" role="status">{toast}</div>}
    </div>
  )
}
