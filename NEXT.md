# Next

_Updated 2026-09-30 — branch quick-command-agent-resume_

## State
PR stablyai/orca#23995 is draft. Local branch now has 4 commits on top of the pushed
head (`61a55e1d`): `f8d15fac` (NEXT.md) and `5adabc19` (append-safety fix) are LOCAL ONLY —
not pushed. 146 tests pass across the 3 PR suites, typecheck exits 0, quality gate 0 findings.

## Local work (this session, outside the repo)
- `~/bin/orca-claude-dispatch.js` rewritten (v2): SQLite profile-state.db source, transcript
  served-model source, tiered matcher, `--plain <sid>` durable pin,
  `--backfill|--rebuild [--write]|--explain <sid>|--map|--forget`.
  Map seeded: 8 sessions resolve (was 3).
- `~/bin/orca-claude-shim-install.js` — idempotent shim (re)installer, `--check` exits 1 on
  a clobbered shim, `--uninstall` restores originals. Run after ANY claude update: `npm i -g`
  rewrites exactly the three launcher files, silently unwrapping the interception.
  Verified: simulate-clobber -> --check catches it -> repair restores, backup guard intact
  (a shim is never archived over the real launcher).
- Shims installed over the real launchers in `AppData\Local\nvm\v23.11.1\`: `claude`,
  `claude.cmd`, `claude.ps1`. Originals backed up in `~/bin/orca-claude-shims-backup/*.orig`.
  Verified through bash/cmd/powershell + full chain incl. Cyrillic preset name.
- Why PATH shim and not the settings override: installed 1.4.215 reads a persisted
  `agentCommand` BEFORE `agentCmdOverrides`, and 6/13 live sleeping records carry
  `agentCommand: "claude '--dangerously-skip-permissions'"` — the override is bypassed.
- New panes pick the shims up immediately (same directory, already on PATH); the running
  daemon (started 09-29 10:32) needs no restart for that. A daemon restart is only needed
  if it caches absolute resolution — not observed.
- `/adv` (DS) review of this work flagged: shim clobber on claude update (fixed via installer),
  missing plain-pin (fixed via `--plain`), and that the PATH-shim blast radius is
  machine-wide (any `claude` invocation, not just Orca) — accepted: originals backed up,
  installer reversible, and the settings route was proven non-functional.

## Open threads
- Restart Orca, confirm a preset tab restores on the right route (`/status` under a preset
  should show 127.0.0.1:3465x/preset/<name>, not the default Claude account).
- 4 live sessions legitimately resolve to none (plain-Claude transcripts, no non-claude model
  ever) — correct fallback, not a bug. 4 no-session tab records also unresolved.
- Update PR #23995 body (stale pre-existing-failure claim) before undraft; needs user order.
- Push `5adabc19` only on user order.

## Don't redo
- Session JSONL `message.model` tail can't identify the preset (post-restore rows are all
  claude-*) — must scan the WHOLE file for the last non-claude model. Transcripts store
  upstream ids (`meta/muse-spark-1.3-contributor`) while presets carry cline ids
  (`cline-free/muse-spark-1.3-contributor`) — match on the last `/`-segment too.
- The shim dir must be `nvm\v23.11.1` (symlinked as `C:\nvm4w\nodejs`), NOT `.local\bin`:
  machine PATH `C:\nvm4w\nodejs` outranks every user PATH entry.
- ccr spawns claude with `--settings <tmp.json>`; the dispatcher must pass that through to the
  real binary or ccr nests inside ccr.
- Renderer failures were real payload assertions, not the pre-existing alias issue.
- cwd-based wrapper routing is dead (mixed presets per worktree).
- `gh pr edit --draft` unsupported; `gh pr ready --undo` converts to draft.
- Lessons/ISSUES files skipped: this repo has no docs/LESSONS.md or docs/ISSUES.md.
