# Next

_Updated 2026-09-30 — branch quick-command-agent-resume_

## State
PR stablyai/orca#23995 is draft. Pushed head is `61a55e1d`; 4 LOCAL commits sit on top
(`5adabc19` append-safety fix + 3 NEXT.md updates) — nothing pushed since. 146 tests pass
across the 3 PR suites, typecheck 0, quality gate 0 findings, shim chain verified.
Local Orca fix is LIVE: shims in `AppData\Local\nvm\v23.11.1\{claude,claude.cmd,claude.ps1}`
route every spawn through `~/bin/orca-claude-dispatch.js` (map: 8 sessions resolve, was 3).

## Open threads
- Restart Orca, confirm a preset tab restores on the right route: dispatcher log
  (`~/.orca/orca-claude-dispatch.log`) must show `preset=... via=...` and `/status` inside
  the tab must show `<host>/preset/<name>`.
- Update PR #23995 body (stale pre-existing-failure claim) before undraft; needs user order.
- Push `5adabc19` (+3 NEXT.md commits) only on user order.

## Running / unfinished
- After ANY claude update run `node ~/bin/orca-claude-shim-install.js` — `npm i -g` rewrites
  the three launcher files and silently unwraps the interception; `--check` exits 1 when a
  shim is clobbered.
- `~/bin/orca-claude-shim-install.js --uninstall` reverts to originals in
  `~/bin/orca-claude-shims-backup/*.orig`.
- 4 live sessions resolve to none (plain-Claude transcripts — correct fallback). 4 no-session
  tab records also unresolved.

## Don't redo
- Shim dir must be `nvm\v23.11.1` (= `C:\nvm4w\nodejs`), NOT `.local\bin`: machine PATH
  `C:\nvm4w\nodejs` outranks every user PATH entry. Settings override route is dead: installed
  1.4.215 reads persisted `agentCommand` before `agentCmdOverrides`, and 6/13 live sleeping
  records carry it.
- Preset ID needs the WHOLE transcript scanned (post-restore tails are all claude-*); match
  the last `/`-segment too (`meta/muse-spark-1.3-contributor` vs `cline-free/…`).
- ccr spawns claude with `--settings <tmp.json>`; dispatcher must pass that through to the
  real binary or ccr nests inside ccr.
- Renderer failures were real payload assertions, not the alias issue. cwd-based wrapper
  routing is dead (mixed presets per worktree). `gh pr edit --draft` unsupported — use
  `gh pr ready --undo`.
- Lessons/ISSUES files skipped: this repo has no docs/LESSONS.md or docs/ISSUES.md.
