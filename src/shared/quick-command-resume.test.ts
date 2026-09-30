import { describe, expect, it } from 'vitest'
import { resolveQuickCommandResumeText } from './quick-command-resume'
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

  it('falls back to the label when the id is gone (renamed command)', () => {
    expect(resolveQuickCommandResumeText(COMMANDS, { quickCommandLabel: 'mimo' })).toBe(
      'ccr cline-mimo --dangerously-skip-permissions --resume'
    )
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

  it('flattens multiline command text', () => {
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
    expect(resolveQuickCommandResumeText(multiline, { quickCommandId: 'multi' })).toBe(
      'ccr muse --resume; --dangerously-skip-permissions'
    )
  })
})
