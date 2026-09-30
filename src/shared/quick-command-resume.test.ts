import { describe, expect, it } from 'vitest'
import {
  isAgentLikeQuickCommandText,
  isPersistableQuickCommandRef,
  isQuickCommandStampOnlyLaunchConfig,
  recognizeQuickCommandStampAgent,
  isWrapperTextSafeToAppendResume,
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

  it('resolves a label-only ref by its unique label', () => {
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'mimo' })).toBe(
      'ccr cline-mimo --dangerously-skip-permissions --resume'
    )
  })

  it('does not fall back to a same-label command when the stored id is gone', () => {
    expect(
      resolveQuickCommandResumeText(COMMANDS, {
        quickCommandId: 'quick-command-deleted',
        quickCommandLabel: 'mimo'
      })
    ).toBeNull()
  })

  it('scopes label resolution to the requesting repo', () => {
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'scoped' }, 'repo-a')).toBe(
      'ccr muse --resume'
    )
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'scoped' }, 'repo-b')).toBe(
      'ccr other --resume'
    )
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

  it.each([
    'ccr muse --resume && echo hi',
    'ccr muse --resume | tee log.txt',
    'ccr muse --resume ; echo hi',
    'ccr muse --resume $(cat sid)',
    'ccr muse --resume # note'
  ])('fails open byte-for-byte on shell syntax: %s', (command) => {
    // Why: without the diverging-span bail the operand absorption eats `&&`
    // or `|` as if it were the stale session id, silently deleting the
    // operator (`ccr muse --resume $(cat sid)` collapsed to `ccr muse sid)`).
    expect(stripStaleResumeSelectors(command, 'posix')).toBe(command)
  })
})

describe('isWrapperTextSafeToAppendResume', () => {
  it('accepts plain wrapper text and lets the resume selector be appended', () => {
    expect(
      isWrapperTextSafeToAppendResume('ccr muse --dangerously-skip-permissions', 'posix')
    ).toBe(true)
    expect(isWrapperTextSafeToAppendResume('ccr muse --resume stale-id', 'posix')).toBe(true)
  })

  it.each([
    ['ccr muse --resume && echo hi', 'posix'],
    ['ccr muse --resume | tee log.txt', 'posix'],
    ['ccr muse --resume $(cat sid)', 'posix'],
    ['ccr muse --resume # note', 'posix']
  ] as const)('rejects shell syntax so the append cannot misfire: %s (%s)', (command, shell) => {
    // Why: the appended `--resume <sid>` lands after `&&`/`|`, i.e. on the
    // LAST command, not the agent — the caller must fall back to stock.
    expect(isWrapperTextSafeToAppendResume(command, shell)).toBe(false)
  })

  it('rejects unmodelable text (unterminated quote)', () => {
    expect(isWrapperTextSafeToAppendResume("ccr muse --flag 'unterminated", 'posix')).toBe(false)
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

  it('rejects everyday short -r/-c flags on non-agent commands', () => {
    expect(isAgentLikeQuickCommandText('grep -r TODO .')).toBe(false)
    expect(isAgentLikeQuickCommandText('cp -r a b')).toBe(false)
    expect(isAgentLikeQuickCommandText('git -c color.ui=always log')).toBe(false)
  })
})

describe('isQuickCommandStampOnlyLaunchConfig', () => {
  it('detects a ref-only stamp', () => {
    expect(
      isQuickCommandStampOnlyLaunchConfig({ agentArgs: '', agentEnv: {}, quickCommandId: 'q' })
    ).toBe(true)
  })

  it('treats configs with a recorded agentCommand or no ref as real launch inputs', () => {
    expect(
      isQuickCommandStampOnlyLaunchConfig({
        agentCommand: 'claude --x',
        agentArgs: '--x',
        agentEnv: {},
        quickCommandId: 'q'
      })
    ).toBe(false)
    expect(isQuickCommandStampOnlyLaunchConfig({ agentArgs: '', agentEnv: {} })).toBe(false)
    expect(isQuickCommandStampOnlyLaunchConfig(undefined)).toBe(false)
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

describe('recognizeQuickCommandStampAgent', () => {
  const stamp = { agentArgs: '', agentEnv: {}, quickCommandId: 'q' }

  it('names the agent a Quick Command launches directly', () => {
    expect(recognizeQuickCommandStampAgent({ command: 'codex', launchConfig: stamp })).toBe('codex')
  })

  it('leaves wrappers and unstamped startups unnamed', () => {
    expect(
      recognizeQuickCommandStampAgent({ command: 'ccr muse --resume', launchConfig: stamp })
    ).toBeUndefined()
    expect(recognizeQuickCommandStampAgent({ command: 'codex' })).toBeUndefined()
  })
})
