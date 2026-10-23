# Chart · dsh-chart

[中文](README.zh.md) | English

A DeepSeek Harness tab that **turns one real session into a reusable skill.**

A conversation is a route you already walked: the commands that worked, the file that finally fixed it, the check that proved it, and the dead end you backed out of. Usually all of that scrolls away. Chart reads the session log, keeps what worked, and drafts a standard `SKILL.md` — the same kind of skill file DSH loads for future sessions.

No new model calls, no guessing. Every step in the draft traces back to an event in that session.

## What you see once installed

Open any conversation with history and pick the **Chart** tab at the top. The page has two halves: evidence on the left, the skill draft on the right.

### Seven numbers

Turns, usable steps, checks, failed commands, files changed, commands run, and raw events.

All of them are counted from the log. Nothing is estimated.

### What the session left behind

- **Goal** — what you asked for in the first prompt, plus the session title and the agent preset.
- **Steps** — commands that actually succeeded, in order. Housekeeping like `cd`, `ls` and `pwd` is dropped, duplicates are merged, and each step shows which turn it came from. At most `maxSteps` (30 by default).
- **Checks** — commands that verify the work: tests, lint, typecheck, build, e2e, plus reachability checks such as `curl` or `git ls-remote`. A command lands here only when it succeeded, and only when *every* chained part is a real check (`npm run lint && tsc --noEmit` counts; `rm -rf dist && npm test` does not).
- **Files changed** — only files a successful edit or write touched, with how many times.
- **Pitfalls** — commands that failed, the error they gave, and whether a later retry worked. If it never worked, the draft says so instead of pretending it was fixed.
- **Before you start** — OS, shell, package manager, whether git was used, and the workspace path. All read from the log; missing facts stay missing.

### The draft

The right column holds a normal Markdown skill file you can review before anything is saved:

- **Name** — this becomes the folder name. Chart picks a free name automatically, so saving a second draft never silently replaces the first.
- **Include switches** — steps, checks, files, pitfalls, before-you-start notes, the goal. Turning one off regenerates the draft.
- **Editor** — edit the Markdown directly. Once you type, the draft stops regenerating by itself; the **Regenerate** button is there when you want it, and warns that it will replace your edits. The frontmatter `name` stays in sync with the folder name.
- **Copy** — puts the Markdown on your clipboard.
- **Download** — saves `SKILL.md` to your downloads folder.
- **Save to skill library** — writes the file into the local skill library. The dialog shows the exact path first. If a skill with that name already exists, saving stays disabled until you tick **overwrite**, and the old file is backed up before it is replaced.

After saving, the tab shows where the file went, where the backup went, and whether anything was masked again at write time.

## Where the skill goes

```text
~/.dsh/skills/<name>/SKILL.md          # default
$DSH_HOME/skills/<name>/SKILL.md       # when DSH_HOME is set
```

That is the user skill root DSH already scans. Skills written there are discovered automatically, so a new session can use them. Chart writes nowhere else, and never writes a half-finished file — content goes to a temporary file and is renamed into place.

## Privacy: it will not leak your keys

Sessions often contain keys, tokens and email addresses. Everything is cleaned up **on your machine, before it reaches the page**:

- Private key blocks, JWTs, GitHub / AWS / Google / Slack / npm / PyPI / Stripe / DeepSeek-shaped keys, `Bearer` headers, credentials inside URLs, `api_key = …` assignments and email addresses become `«已脱敏»`.
- The tab reports how many spans were masked and which families fired. It does not show the secrets.
- The file is **redacted a second time at write time**, so hand edits cannot accidentally reintroduce a key.
- Things that only look secret are left alone: `process.env.X`, `${TEMPLATE}`, `foo.bar.baz`, `ALL_CAPS_CONSTANTS`, and short strings.
- Automatic redaction is on by default. If you turn it off, the page and the save dialog both say so instead of pretending it ran.

Nothing is uploaded. The plugin reads the current session through Harness's own `sessionQuery` and writes only under the skill root.

## Install

Requires Node.js 22.19+ (or 24+) and DeepSeek Harness 0.1.0-rc.6+.

```sh
git clone https://github.com/xh0915/dsh-chart
cd dsh-chart
pnpm install
pnpm run build
dsh plugin --profile web add .
```

Restart the Web Harness. Open a conversation with history and the **Chart** tab is there.

**`pnpm run build` must run before `add`.** The package ships no install-time build script (pnpm 10 blocks unapproved `prepare` scripts); skip this step and the plugin installs but fails to load.

Remove it with:

```sh
dsh plugin --profile web remove dsh-chart
```

## Settings

```yaml
dsh-chart:
  redactSecrets: true   # mask secrets before they reach the page (default)
  maxSteps: 30          # commands kept as reusable steps, 5–200
```

When a session has more successful commands than the budget, the draft keeps the first `maxSteps` in order and adds a note saying some were omitted. Nothing is dropped silently. Checks, pitfalls, and changed files have their own fixed caps (12, 12, and 24); the same note appears when one of them is reached.

## Boundaries

- **Only real evidence.** A step exists because a tool call succeeded; a pitfall exists because one failed; a file exists because an edit or write was applied. Nothing is inferred from prose.
- **No failure text, no pitfall row.** If a failed command left no error text at all, it is still counted as a failure but not written into the skill, rather than invented.
- **No checks that did not pass.** Verification commands that failed are not offered as checks.
- **No skill discovery fiction.** The skill is saved to the user skill root DSH actually scans; preset-local folders are left alone.
- **The plugin itself stays offline.** No model request, no shell call, no telemetry. It is UI over your own data.
- **No cost figure.** The log has no price, so the plugin does not guess one.
- The UI follows Harness light and dark themes, and speaks Chinese and English.

## Technical details

<details>
<summary>For people changing the code</summary>

### Layout

```text
package.json           # dsh.bundle.patch + dsh.client, scripts, peer deps
cordis.patch.yml       # mounts the host plugin row into a profile
dsh.plugin.json        # registry manifest
src/index.ts           # host entry: Config schema, ChartRuntime, Typert manifest
src/runtime.ts         # chart.build / chart.library / chart.save
src/distill.ts         # session log -> goal, steps, checks, files, pitfalls, env
src/library.ts         # local skill root: parse, list, save, backup
src/redact.ts          # local secret redaction
src/schema.ts          # Zod wire authority (types inferred, nothing drifts)
src/contract.ts        # strict InvocationDescriptor shared by host and client
src/typert.ts          # host reflection manifest
src/client/index.tsx   # client entry: mounts the Remote, registers the tab
src/client/view.tsx    # the Chart view
src/client/skill.ts    # SKILL.md markdown builder + frontmatter sync
src/client/styles.ts   # theme-token stylesheet (follows Harness light/dark)
src/client/locales.ts  # zh / en copy
tests/                 # distillation, library, markdown, contract, client-entry tests
build.mjs              # esbuild dual build: host ESM + client wrapped for the web loader
```

The client half contributes **no** prompt, tool, or session event — `ctx.typert.register()` only publishes reflection metadata. The plugin is UI over your own data.

### Development

```sh
pnpm run check   # typecheck + lint + test + build
```

### Renaming

If you fork this and rename it, keep these in sync: `package.json` → `name`, `exports`, `files`; `build.mjs` → the `__ModuleLoader__.load` id; `src/index.ts` → `name`; `src/client/remote.ts` → the hex-encoded `TypertRemoteNamespace$…` name; `src/client/locales.ts` → the locale namespace; `src/client/index.tsx` → the slot id; `src/typert.ts` → `package`; `src/contract.ts` → the invocation id; `cordis.patch.yml` → `id` and `name`; `dsh.plugin.json` → `id`.

</details>

## License

MIT

Built by [里卡多 / xh0915](https://xh0915.github.io)
