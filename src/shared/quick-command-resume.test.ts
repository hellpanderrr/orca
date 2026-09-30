import { describe, expect, it } from 'vitest'
import {
  isAgentLikeQuickCommandText,
  isPersistableQuickCommandRef,
  resolveQuickCommandResumeText,
  stripStaleResumeSelectors
} from './quick-command-resume'
import type { TerminalQuickCommand } from './terminal-quick-command-types'

const COMMANDS: TerminalQuickCommand[] = [
  {
    id: 'quick-command-muse',
    label: 'muse',
    action: 'terminal-command',
    command: 'ccr muse --dangerously-skip-permissions --resume',
    appendEnter: true,
    scope: { type: 'global' }
  },
  {
    id: 'quick-command-mimo',
    label: 'mimo',
    action: 'terminal-command',
    command: 'ccr cline-mimo --dangerously-skip-permissions --resume',
    appendEnter: true,
    scope: { type: 'global' }
  },
  {
    id: 'quick-command-dupe',
    label: 'muse',
    action: 'terminal-command',
    command: 'ccr other --resume',
    appendEnter: true,
    scope: { type: 'global' }
  },
  {
    id: 'quick-command-prompt',
    label: 'ask',
    action: 'agent-prompt',
    agent: 'claude',
    prompt: 'hello',
    scope: { type: 'global' }
  },
  {
    id: 'quick-command-repo',
    label: 'scoped',
    action: 'terminal-command',
    command: 'ccr muse --resume',
    appendEnter: true,
    scope: { type: 'repo', repoId: 'repo-a' }
  },
  {
    id: 'quick-command-repo-other',
    label: 'scoped',
    action: 'terminal-command',
    command: 'ccr other --resume',
    appendEnter: true,
    scope: { type: 'repo', repoId: 'repo-b' }
  }
]

describe('resolveQuickCommandResumeText', () => {
  it('resolves the current command text by id', () => {
    expect(
      resolveQuickCommandResumeText(COMMANDS, {
        quickCommandId: 'quick-command-muse',
        quickCommandLabel: 'muse'
      })
    ).toBe('ccr muse --dangerously-skip-permissions --resume')
  })

  it('prefers the id when the label is ambiguous', () => {
    expect(
      resolveQuickCommandResumeText(COMMANDS, {
        quickCommandId: 'quick-command-dupe',
        quickCommandLabel: 'muse'
      })
    ).toBe('ccr other --resume')
  })

  it('returns null on an ambiguous label-only ref instead of guessing', () => {
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'muse' })).toBeNull()
  })

  it('falls back to a unique label when the id is gone (renamed command)', () => {
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'mimo' })).toBe(
      'ccr cline-mimo --dangerously-skip-permissions --resume'
    )
  })

  it('scopes label resolution to the requesting repo', () => {
    expect(
      resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'scoped' }, 'repo-a')
    ).toBe('ccr muse --resume')
    expect(
      resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'scoped' }, 'repo-b')
    ).toBe('ccr other --resume')
    // Why: without a repo scope, two same-label commands are ambiguous.
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'scoped' })).toBeNull()
  })

  it('returns null for agent-prompt commands, missing refs, and empty input', () => {
    expect(
      resolveQuickCommandResumeText(COMMANDS, {
        quickCommandId: 'quick-command-prompt',
        quickCommandLabel: 'ask'
      })
    ).toBeNull()
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'deleted' })).toBeNull()
    expect(resolveQuickCommandResumeText(COMMANDS, null)).toBeNull()
    expect(resolveQuickCommandResumeText([], { quickCommandLabel: 'muse' })).toBeNull()
  })

  it('rejects multiline compound commands instead of misattaching the selector', () => {
    const multiline: TerminalQuickCommand[] = [
      {
        id: 'multi',
        label: 'multi',
        action: 'terminal-command',
        command: 'ccr muse --resume\n--dangerously-skip-permissions',
        appendEnter: true,
        scope: { type: 'global' }
      }
    ]
    expect(resolveQuickCommandResumeText(multiline, { quickCommandId: 'multi' })).toBeNull()
  })
})

describe('stripStaleResumeSelectors', () => {
  it.each(['posix', 'powershell', 'cmd'] as const)(
    'strips a stale wrapper selector (%s)',
    (shell) => {
      expect(stripStaleResumeSelectors('ccr muse --resume old-session', shell)).toBe('ccr muse')
      expect(stripStaleResumeSelectors('ccr muse --resume=old-session', shell)).toBe('ccr muse')
      expect(stripStaleResumeSelectors('ccr muse --resume', shell)).toBe('ccr muse')
      expect(stripStaleResumeSelectors('ccr muse --continue', shell)).toBe('ccr muse')
    }
  )

  it('keeps surviving wrapper args when stripping selectors', () => {
    expect(
      stripStaleResumeSelectors('ccr muse --dangerously-skip-permissions --resume stale', 'posix')
    ).toBe('ccr muse --dangerously-skip-permissions')
  })

  it('leaves non-selector text untouched', () => {
    expect(stripStaleResumeSelectors('ccr muse --model sonnet', 'posix')).toBe(
      'ccr muse --model sonnet'
    )
  })
})

describe('isAgentLikeQuickCommandText', () => {
  it('accepts agent binaries and wrapper commands carrying a selector', () => {
    expect(isAgentLikeQuickCommandText('claude --resume')).toBe(true)
    expect(isAgentLikeQuickCommandText('ccr muse --dangerously-skip-permissions --resume')).toBe(
      true
    )
  })

  it('rejects plain shell commands and bare wrappers', () => {
    expect(isAgentLikeQuickCommandText('git status')).toBe(false)
    expect(isAgentLikeQuickCommandText('pnpm dev')).toBe(false)
    expect(isAgentLikeQuickCommandText('ccr muse')).toBe(false)
    expect(isAgentLikeQuickCommandText('')).toBe(false)
  })
})

describe('isPersistableQuickCommandRef', () => {
  it('accepts ordinary ids and labels', () => {
    expect(isPersistableQuickCommandRef('quick-command-muse')).toBe(true)
    expect(isPersistableQuickCommandRef('muse')).toBe(true)
  })

  it('rejects control chars, blanks, and overlong values', () => {
    expect(isPersistableQuickCommandRef('muse\ntab')).toBe(false)
    expect(isPersistableQuickCommandRef('muse\ttab')).toBe(false)
    expect(isPersistableQuickCommandRef('   ')).toBe(false)
    expect(isPersistableQuickCommandRef('x'.repeat(81))).toBe(false)
    expect(isPersistableQuickCommandRef(undefined)).toBe(false)
  })
})
