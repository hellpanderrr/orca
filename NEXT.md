# Next

_Updated 2026-09-30 — branch quick-command-agent-resume_

## State
PR stablyai/orca#23995 is draft. Pushed head `61a55e1d`; local commits on top (review fixes,
general launcher linking `f5cc50dd`), nothing pushed. Broad renderer/store/lib suites pass
except palette timing (fails on `main` too); typecheck 0, quality gate 0. PR body draft at
`F:/temp/pr-23995-body.md` (general-launcher wording, not applied).
Local Orca shim (`~/bin/orca-claude-dispatch.js`) is live for the installed app.

## Open threads
- On user order: push, then `gh pr edit 23995 --repo stablyai/orca --title "Resume agent tabs through the Quick Command that launched them" --body-file F:/temp/pr-23995-body.md`.
- Follow-up PR (stacked): latest Quick Command per pane wins (design B: pane-pending ref from
  menu-run or exact typed match, consumed by the next new session; E = ask-on-restore fallback).
- Real-app check: restart Orca, confirm a `ccr` Quick Command tab resumes via the wrapper.
- Optional cleanup: `resolveAgentResumeFlag` (tui-agent-resume-startup.ts) re-derives the
  selector from argv position; a `getAgentResumeSelector` next to `getAgentResumeArgv` is safer.

## Running / unfinished
- After ANY claude update: `node ~/bin/orca-claude-shim-install.js` (npm rewrites the shims;
  `--check` exits 1 when clobbered). `--uninstall` restores originals.

## Don't redo
- NEVER run `pnpm format` — it rewrote line endings on ~26k files. Use
  `pnpm exec oxfmt <changed files>`.
- Known limits (in PR body): link covers only the launched session; remote runtime /
  other-host QCs; AI Vault. Review finding 4 ("later agent inherits wrapper") is FALSE: the
  store consumes the launch token after the first turn (agent-status-live-reducer.ts:68);
  pinned by agent-status-quick-command-link-lifetime.test.ts. So a pane relink on in-pane QC
  runs is dead (no registry entry left) — "latest preset wins" needs a new status-store
  producer (read docs/reference/agent-status-store.md first). Agent-type stamping was
  reverted in `72b37d22`.
- All remaining local test failures fail identically on `main` (ACL, palette timing, omp
  shell, git lock, loose-ref, text-search, automation jobs, relay dependency).
- Shim dir must be `nvm\v23.11.1` (machine PATH wins); settings override route is dead
  (installed app reads persisted `agentCommand` first).
