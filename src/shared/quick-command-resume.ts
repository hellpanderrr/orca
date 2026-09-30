import { flattenTerminalQuickCommand, terminalQuickCommandMatchesRepo } from './terminal-quick-commands'
import type { TerminalQuickCommand } from './terminal-quick-command-types'
import { tokenizeStartupCommand, type AgentStartupShell } from './tui-agent-startup-shell'

/**
 * Why this file exists: a terminal-command Quick Command can launch an agent
 * CLI through a user wrapper (e.g. `ccr muse --resume` instead of bare
 * `claude`). The tab persists only the label, and every resume path rebuilds
 * the stock agent command — so the restored tab silently lands on the wrong
 * account/route. Resolving the CURRENT command text at resume time (not a
 * snapshot at launch time) means user edits to the Quick Command propagate.
 *
 * Fail-open by design: null means "no usable Quick Command found" and every
 * caller falls back to today's stock-command path, byte for byte.
 */
/**
 * Why: persisted refs must never poison hydration. Labels are user-typed, and
 * the sleeping-record schema drops the WHOLE record (not just the ref) when a
 * ref carries control chars — so a weird label would cost the resume handle
 * entirely. Validate at capture; the schema stays strict.
 */
export function isPersistableQuickCommandRef(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 80) {
    return false
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return false
    }
  }
  return true
}

const RESUME_SELECTOR_RE = /^(--resume|--continue|-r|-c)(=.*)?$/

function splitCommandTokens(command: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]
    if (quote) {
      token += char
      if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      token += char
      continue
    }
    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }
    token += char
  }
  if (token) {
    tokens.push(token)
  }
  return tokens
}

function stripTokenQuotes(token: string): string {
  if (token.length >= 2) {
    const first = token.at(0)
    const last = token.at(-1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1)
    }
  }
  return token
}

/**
 * Why: the resume ref must only ever be carried for tabs that actually
 * launched an agent CLI. A plain `git status` Quick Command tab sets the same
 * tab label, and if the user later starts an agent by hand in that pane the
 * stale label would rebuild `git status --resume <sid>`. Gate the stamp at
 * launch: the command must either name a known agent binary in command
 * position or already carry a resume selector (only agent commands do).
 */
// Why: derived from TUI_AGENT_CONFIG's own detectCmd/aliases (first tokens of
// launchCmd included, wrapper verbs like `orca claude-teams` excluded — the
// ref is only for shell-typed wrappers around a real agent binary). `ccr`
// (claude-code-router) is the motivating wrapper: its first arg is the
// preset, so bare `ccr` alone must NOT qualify — only with a resume
// selector, which only agent sessions carry.
const KNOWN_AGENT_BINARIES: ReadonlySet<string> = new Set([
  'claude',
  'codebuddy',
  'cbc',
  'openclaude',
  'codex',
  'autohand',
  'ante',
  'traecli',
  'opencode',
  'opencode2',
  'mimo',
  'pi',
  'omp',
  'prime-agent',
  'qodercli',
  'gemini',
  'agy',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro-cli',
  'crush',
  'auggie',
  'cline',
  'freebuff',
  'codebuff',
  'command-code',
  'cursor-agent',
  'droid',
  'kimi',
  'kimi-code',
  'vibe',
  'mistral-vibe',
  'qwen',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'muse',
  'dsh-tui',
  'dst',
  'zcode',
  'devin'
])

export function isAgentLikeQuickCommandText(command: string): boolean {
  const tokens = splitCommandTokens(command)
  if (tokens.length === 0) {
    return false
  }
  const firstBasename =
    stripTokenQuotes(tokens[0]).split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (!firstBasename) {
    return false
  }
  for (const name of KNOWN_AGENT_BINARIES) {
    if (firstBasename === name || firstBasename === `${name}.exe`) {
      return true
    }
  }
  return tokens.some((token) => RESUME_SELECTOR_RE.test(stripTokenQuotes(token)))
}

export function resolveQuickCommandResumeText(
  quickCommands: readonly TerminalQuickCommand[] | null | undefined,
  ref: { quickCommandId?: string | null; quickCommandLabel?: string | null } | null | undefined,
  repoId?: string | null
): string | null {
  if (!ref || !Array.isArray(quickCommands) || quickCommands.length === 0) {
    return null
  }
  const id = ref.quickCommandId?.trim()
  const label = ref.quickCommandLabel?.trim()
  if (!id && !label) {
    return null
  }
  const inScope =
    repoId != null
      ? quickCommands.filter((command) => terminalQuickCommandMatchesRepo(command, repoId))
      : quickCommands
  // Why id first: the id is stable across edits of the command body, while
  // labels are not unique.
  const byId = id ? inScope.find((command) => command.id === id) : undefined
  // Why uniqueness on the label path: a label-only ref must never pick one of
  // several same-label commands (possibly scoped to another repo) at random —
  // ambiguity resolves to the stock fallback, not a guess.
  const byLabel =
    !byId && label
      ? inScope.filter((command) => command.label === label)
      : []
  const match = byId ?? (byLabel.length === 1 ? byLabel[0] : undefined)
  if (!match || match.action === 'agent-prompt') {
    return null
  }
  // Why: multiline commands flatten to `a; b` shell lists, and a resume
  // selector appended at the end would attach to the LAST command instead of
  // the agent. Compound wrappers are not resume-safe — stock fallback.
  if (/[\r\n]/.test(match.command)) {
    return null
  }
  const text = flattenTerminalQuickCommand(match).command.trim()
  return text ? text : null
}

// Same selector shapes the claude resume guard strips
// (agent-resume-launch-command.ts): exact `--resume`/`--continue`/`-r`/`-c`
// and their `=` forms. The ambiguous joined `-r<id>` form is deliberately
// NOT matched — see the guard for why no arity table can cover it.
const STALE_RESUME_SELECTOR_RE = /^(--resume|--continue|-r|-c)(=.*)?$/

/**
 * Why: a wrapper Quick Command can carry a stale or bare resume selector
 * (`ccr muse --resume old-session`, or a bare `--resume` picker default).
 * That selector can never compete with the authoritative provider session id
 * the resume path appends (#12982), and the claude guard cannot strip it —
 * it only recognizes a `claude` executable token, which wrappers lack — so a
 * wrapper would end up with TWO competing selectors. Strip here instead.
 *
 * Fails open: unmodelable text (operators, expansions, unterminated quotes)
 * returns byte-for-byte untouched.
 */
export function stripStaleResumeSelectors(command: string, shell: AgentStartupShell): string {
  const tokenized = tokenizeStartupCommand(command, shell)
  if (!tokenized.ok) {
    return command
  }
  const { tokens, spans } = tokenized
  // Why: same splice-safety rule as the claude guard — the text between
  // tokens must be plain whitespace, or cutting spans could mangle live
  // shell syntax.
  for (let i = 0; i <= tokens.length; i += 1) {
    const gapStart = i === 0 ? 0 : spans[i - 1].end
    const gapEnd = i === tokens.length ? command.length : spans[i].start
    if (!/^[ \t]*$/.test(command.slice(gapStart, gapEnd))) {
      return command
    }
  }
  const cuts: { start: number; end: number }[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!STALE_RESUME_SELECTOR_RE.test(token)) {
      continue
    }
    let endIndex = i
    // Why: only `--resume`/`-r` take a separate session-id operand;
    // `--continue`/`-c` are bare flags. Mirrors the claude guard.
    const next = tokens[i + 1]
    if ((token === '--resume' || token === '-r') && next !== undefined && !next.startsWith('-')) {
      endIndex = i + 1
    }
    let start = spans[i].start
    const prevEnd = i === 0 ? 0 : spans[i - 1].end
    while (start > prevEnd && ' \t'.includes(command[start - 1])) {
      start -= 1
    }
    cuts.push({ start, end: spans[endIndex].end })
    i = endIndex
  }
  let result = command
  for (let i = cuts.length - 1; i >= 0; i -= 1) {
    result = `${result.slice(0, cuts[i].start)}${result.slice(cuts[i].end)}`
  }
  return result
}
