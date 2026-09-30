import { flattenTerminalQuickCommand } from './terminal-quick-commands'
import type { TerminalQuickCommand } from './terminal-quick-command-types'

/**
 * Why this exists: a terminal-command Quick Command can launch an agent CLI
 * through a user wrapper (e.g. `ccr muse --resume` instead of bare `claude`).
 * The tab persists only the label, and every resume path rebuilds the stock
 * agent command — so the restored tab silently lands on the wrong
 * account/route. Resolving the CURRENT command text at resume time (not a
 * snapshot at launch time) means user edits to the Quick Command propagate.
 *
 * Fail-open by design: null means "no usable Quick Command found" and every
 * caller falls back to today's stock-command path, byte for byte.
 */
export function resolveQuickCommandResumeText(
  quickCommands: readonly TerminalQuickCommand[] | null | undefined,
  ref: { quickCommandId?: string | null; quickCommandLabel?: string | null } | null | undefined
): string | null {
  if (!ref || !Array.isArray(quickCommands) || quickCommands.length === 0) {
    return null
  }
  const id = ref.quickCommandId?.trim()
  const label = ref.quickCommandLabel?.trim()
  if (!id && !label) {
    return null
  }
  // Why id first: labels are not unique and survive renames of the text;
  // the id is stable across edits of the command body.
  const byId = id ? quickCommands.find((command) => command.id === id) : undefined
  const match =
    byId ?? (label ? quickCommands.find((command) => command.label === label) : undefined)
  if (!match || match.action === 'agent-prompt') {
    return null
  }
  const text = flattenTerminalQuickCommand(match).command.trim()
  return text ? text : null
}
