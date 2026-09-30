# Next

_Updated 2026-09-30 — branch quick-command-agent-resume_

## State
PR stablyai/orca#23995 is draft; 2 commits pushed. Local: 135 tests pass, quality gate passes, typecheck exits 0.

## Open threads
- Real cold-restore test: kill a preset tab, `/status` must show `127.0.0.1:3456/preset/<name>` (also decides if ai-vault path needs the fix).
- Update PR body before undraft (stale pre-existing-failure claim, missing new guards).
- Compute KNOWN_AGENT_BINARIES from TUI_AGENT_CONFIG instead of the hand-copied set.
- Hand-typed `ccr` tabs still restore as bare claude (scope limit, not covered).

## Running / unfinished
- Bot re-review of 61a55e1d pending: `gh pr view 23995 --repo stablyai/orca --comments`.
- Leftovers outside repo: `~/bin/orca-claude-*`, `~/.orca/claude-preset-by-session.json` (remove if PR lands).

## Don't redo
- Session JSONL `message.model` can't identify the preset (tails read claude-sonnet-5-x).
- Renderer failures were real payload assertions, not the pre-existing alias issue.
- cwd-based wrapper routing is dead (mixed presets per worktree).
- `gh pr edit --draft` unsupported; `gh pr ready --undo` converts to draft.
- Lessons/ISSUES files skipped: this repo has no docs/LESSONS.md or docs/ISSUES.md.
