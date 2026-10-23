/**
 * dsh-chart — The single wire authority.
 *
 * Everything that crosses the host/client Remote boundary is declared here as a
 * strict Zod schema, and the TypeScript types are inferred from it, so the host
 * distiller, the Typert descriptors, the save path, and the browser view cannot
 * drift. The browser imports these types only, so Zod stays on the host.
 */
import { z } from 'zod'

/** What the redactor touched while building the draft or writing a skill. */
export const ChartRedactionSchema = z.object({
  count: z.number().int().min(0),
  kinds: z.array(z.string().max(40)),
  enabled: z.boolean(),
}).readonly()
export type ChartRedaction = z.infer<typeof ChartRedactionSchema>

/** One reusable command that really ran in the session. */
export const ChartStepSchema = z.object({
  /** The command as the tool received it, redacted and capped. */
  command: z.string().min(1).max(1200),
  /** The agent's own description of the step, when it supplied one. */
  description: z.string().max(200).optional(),
  /** Conversation turn the command belongs to. */
  turn: z.number().int().min(0),
  /** Raw log seq — the evidence pointer for this step. */
  seq: z.number().int().min(0),
  /** Source event timestamp, Unix epoch ms. */
  time: z.number().int().min(0),
}).readonly()
export type ChartStep = z.infer<typeof ChartStepSchema>

/** A command that failed in the session, and whether a retry later worked. */
export const ChartPitfallSchema = z.object({
  command: z.string().min(1).max(1200),
  /** Error excerpt the tool returned, redacted and capped. */
  error: z.string().min(1).max(400),
  turn: z.number().int().min(0),
  seq: z.number().int().min(0),
  /** Turn where the same command succeeded again, when that happened. */
  fixedInTurn: z.number().int().min(0).optional(),
}).readonly()
export type ChartPitfall = z.infer<typeof ChartPitfallSchema>

/** One file the session actually edited or wrote. */
export const ChartFileSchema = z.object({
  /** Workspace-relative when inside cwd, otherwise the path as logged. */
  path: z.string().min(1).max(400),
  edits: z.number().int().min(0),
  writes: z.number().int().min(0),
  firstTurn: z.number().int().min(0),
  lastTurn: z.number().int().min(0),
}).readonly()
export type ChartFile = z.infer<typeof ChartFileSchema>

/** Facts the session actually showed about the machine and tooling. */
export const ChartEnvironmentSchema = z.object({
  /** Host platform, e.g. `win32`, `darwin`, `linux`. */
  platform: z.string().max(20),
  /** Shell tools seen in the log, in first-use order. */
  shells: z.array(z.string().max(20)),
  /** Package managers the commands themselves named. */
  packageManagers: z.array(z.string().max(20)),
  /** True when a git command was part of the session. */
  usesGit: z.boolean(),
}).readonly()
export type ChartEnvironment = z.infer<typeof ChartEnvironmentSchema>

/** Honest counters for the hero strip. */
export const ChartCountsSchema = z.object({
  turns: z.number().int().min(0),
  /** Successful commands that became steps, before the cap. */
  steps: z.number().int().min(0),
  /** Every command call seen, successful or not. */
  commands: z.number().int().min(0),
  failures: z.number().int().min(0),
  filesChanged: z.number().int().min(0),
  rawEvents: z.number().int().min(0),
}).readonly()
export type ChartCounts = z.infer<typeof ChartCountsSchema>

/** The distilled draft returned by `chart.build`. */
export const ChartDraftSchema = z.object({
  sessionId: z.string().min(1).max(200),
  /** Session title or the first prompt, capped for a heading. */
  title: z.string().max(120),
  /** The first user prompt, redacted; what the session set out to do. */
  goal: z.string().max(600),
  cwd: z.string().max(400),
  agentPreset: z.string().max(40),
  startedAt: z.number().int().min(0),
  endedAt: z.number().int().min(0),
  generatedAt: z.number().int().min(0),
  throughSeq: z.number().int().min(0),
  environment: ChartEnvironmentSchema,
  steps: z.array(ChartStepSchema),
  checks: z.array(ChartStepSchema),
  files: z.array(ChartFileSchema),
  pitfalls: z.array(ChartPitfallSchema),
  /** A kebab-case name proposed from the session; the user can change it. */
  suggestedName: z.string().max(60),
  counts: ChartCountsSchema,
  redaction: ChartRedactionSchema,
  /** True when a list hit its cap and the rest was omitted. */
  truncated: z.boolean(),
}).readonly()
export type ChartDraft = z.infer<typeof ChartDraftSchema>

/** The name grammar the harness enforces for skill folders. */
export const SkillNameSchema = z.string().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** One skill already present in the local skill library. */
export const LibrarySkillSchema = z.object({
  name: SkillNameSchema,
  description: z.string().max(400),
}).readonly()
export type LibrarySkill = z.infer<typeof LibrarySkillSchema>

/** What `chart.library` reports about the writable user skill root. */
export const SkillLibrarySchema = z.object({
  /** Absolute root on this machine. */
  root: z.string().max(400),
  /** Symbolic display path, e.g. `~/.dsh/skills`. */
  displayRoot: z.string().max(200),
  skills: z.array(LibrarySkillSchema),
}).readonly()
export type SkillLibrary = z.infer<typeof SkillLibrarySchema>

/** What the browser asks `chart.save` to write. */
export const SaveRequestSchema = z.object({
  /** Directory name; also the frontmatter `name` the host re-checks. */
  slug: SkillNameSchema,
  /** The complete SKILL.md the user edited, re-redacted on the host. */
  markdown: z.string().min(1).max(30_000),
  /** Replace an existing skill only when the user said so. */
  overwrite: z.boolean(),
}).readonly()
export type SaveRequest = z.infer<typeof SaveRequestSchema>

/** Where a skill landed, and what was done to keep the old one safe. */
export const SaveResultSchema = z.object({
  path: z.string().max(400),
  displayPath: z.string().max(300),
  /** True when a previous SKILL.md was replaced. */
  overwritten: z.boolean(),
  /** Backup of the replaced file, when one was made. */
  backupPath: z.string().max(400).optional(),
  /** Symbolic backup path for display, e.g. `~/.dsh/skills/x/SKILL.md.…bak`. */
  backupDisplayPath: z.string().max(300).optional(),
  /** Redaction the host applied to the markdown at write time. */
  redaction: ChartRedactionSchema,
}).readonly()
export type SaveResult = z.infer<typeof SaveResultSchema>
