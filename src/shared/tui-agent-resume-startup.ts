import {
  getAgentResumeArgv,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from './agent-session-resume'
import type { SessionOptionValue } from './native-chat-session-options'
import { buildSleepingAgentLaunchConfig } from './sleeping-agent-launch-config'
import { resolveAgentLaunchCommand } from './tui-agent-launch-command'
import type { AgentStartupPlan } from './tui-agent-startup'
import { resolveStartupShell, type AgentStartupShell } from './tui-agent-startup-shell'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import { buildAgentResumeLaunchCommand } from './agent-resume-launch-command'
import { isWrapperTextSafeToAppendResume, stripStaleResumeSelectors } from './quick-command-resume'

export function buildAgentResumeStartupPlan(args: {
  agent: ResumableTuiAgent
  providerSession: AgentProviderSessionMetadata
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  agentCommand?: string | null
  ompResumeFilePath?: string | null
  /** Why: a terminal-command Quick Command wrapper (e.g. `ccr muse`) that
   *  spawned this tab, resolved to its CURRENT text at resume time. Wins over
   *  agentCommand/cmdOverrides so the restored tab keeps the user's route. */
  quickCommandText?: string | null
  quickCommandId?: string | null
  quickCommandLabel?: string | null
  sessionOptions?: Record<string, SessionOptionValue>
  sessionOptionsOverrideAgentArgs?: boolean
  isRemote?: boolean
}): AgentStartupPlan | null {
  const argv = getAgentResumeArgv(args.agent, args.providerSession, args.ompResumeFilePath)
  if (!argv) {
    return null
  }
  const shell = resolveStartupShell(args.platform, args.shell)
  // Why: a resolved wrapper is an EXECUTABLE base, never the persisted
  // fallback command — if the Quick Command is later deleted, resolvers
  // return null and resume must fall back to stock, not replay a cached
  // copy of the deleted text (which agentCommand would otherwise keep).
  // The append-safety gate keeps shell syntax (`ccr muse --resume && notify`)
  // from receiving the appended session id as its LAST command's argument.
  const trimmedQuickCommandText = args.quickCommandText?.trim() ?? ''
  const resolvedQuickCommandText =
    trimmedQuickCommandText && isWrapperTextSafeToAppendResume(trimmedQuickCommandText, shell)
      ? stripStaleResumeSelectors(trimmedQuickCommandText, shell)
      : ''
  const resolvedAgentCommand = args.agentCommand?.trim()
  const baseCommand = resolvedQuickCommandText
    ? ({
        ok: true,
        command: resolvedQuickCommandText,
        commandWithoutSessionOptions: '',
        appliedSessionOptions: {}
      } as const)
    : resolvedAgentCommand
      ? ({
          ok: true,
          command: resolvedAgentCommand,
          commandWithoutSessionOptions: resolvedAgentCommand,
          appliedSessionOptions: {}
        } as const)
      : resolveAgentLaunchCommand({
          agent: args.agent,
          cmdOverrides: args.cmdOverrides,
          platform: args.platform,
          shell,
          agentArgs: args.agentArgs,
          sessionOptions: args.sessionOptions,
          sessionOptionsOverrideAgentArgs: args.sessionOptionsOverrideAgentArgs,
          isRemote: args.isRemote
        })
  if (!baseCommand.ok) {
    return null
  }
  const launchConfig = buildSleepingAgentLaunchConfig({
    ...args,
    // Why: `...args` carries quickCommandId/Label already; agentCommand here
    // is ONLY the stock fallback (never wrapper text), so a deleted Quick
    // Command retires its route instead of replaying it from cache.
    agentCommand: resolvedQuickCommandText ? undefined : baseCommand.commandWithoutSessionOptions
  })
  const launchCommand = buildAgentResumeLaunchCommand(args.agent, baseCommand.command, argv, shell)
  const applied = baseCommand.appliedSessionOptions
  return {
    agent: args.agent,
    launchCommand,
    expectedProcess: TUI_AGENT_CONFIG[args.agent].expectedProcess,
    followupPrompt: null,
    launchConfig,
    ...(args.agent === 'codex' ? { startupCommandDelivery: 'shell-ready' as const } : {}),
    ...(Object.keys(applied).length > 0 ? { sessionOptions: { ...applied } } : {}),
    ...(args.agentEnv ? { env: { ...args.agentEnv } } : {})
  }
}
