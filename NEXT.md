# Next

_Updated 2026-09-30 — branch quick-command-agent-resume_

## State
PR stablyai/orca#23995 is draft. Pushed head `61a55e1d`; 12 LOCAL commits on top (review
fixes + NEXT.md), nothing pushed. PR suites + terminal-pane/agent-status (1170) pass,
typecheck 0, quality gate 0. New PR body drafted at `F:\temp\pr-23995-body.md` (not applied).
Local Orca shim (`~/bin/orca-claude-dispatch.js`) is live for the installed app.

## Open threads
- On user order: push, then `gh pr edit 23995 --repo stablyai/orca --body-file F:/temp/pr-23995-body.md`.
- Real-app check: restart Orca, confirm a `ccr` Quick Command tab resumes via the wrapper.
- Optional cleanup: `resolveAgentResumeFlag` (tui-agent-resume-startup.ts) re-derives the
  selector from argv position; a `getAgentResumeSelector` next to `getAgentResumeArgv` is safer.

## Running / unfinished
- After ANY claude update: `node ~/bin/orca-claude-shim-install.js` (npm rewrites the shims;
  `--check` exits 1 when clobbered). `--uninstall` restores originals.

## Don't redo
- NEVER run `pnpm format` — it rewrote line endings on ~26k files. Use
  `pnpm exec oxfmt <changed files>`.
- Known limits, deliberately not fixed (listed in PR body): QC run in existing tab, remote
  runtime / other-host QCs, AI Vault, hand-started agent in wrapper tab. Agent-type stamping
  (finding 4 partial) was tried and reverted in `72b37d22` — side effects on pane identity.
- All remaining local test failures fail identically on `main` (ACL, palette timing, omp
  shell, git lock, loose-ref, text-search, automation jobs, relay dependency).
- Shim dir must be `nvm\v23.11.1` (machine PATH wins); settings override route is dead
  (installed app reads persisted `agentCommand` first).
