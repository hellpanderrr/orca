import { useAppStore } from '@/store'
import { isQuickCommandStampOnlyLaunchConfig } from '../../../shared/quick-command-resume'

/**
 * Why: a Quick Command tab's stamp waits for the agent its command launches.
 * Once the user runs something else at that pane's prompt, any agent that
 * starts next came from the new command, not the Quick Command — so a stamp
 * no agent has bound yet (e.g. `git status` exited) must not carry over.
 * Keystroke-based on purpose: PowerShell runs a new tab's startup command
 * inside -EncodedCommand, where no OSC 133 command-finished marker fires.
 */
export function retireUnusedQuickCommandStamp(paneKey: string): void {
  const state = useAppStore.getState()
  const entry = state.agentLaunchConfigByPaneKey[paneKey]
  if (
    !entry ||
    entry.identity.providerSession !== undefined ||
    !isQuickCommandStampOnlyLaunchConfig(entry.launchConfig)
  ) {
    return
  }
  // Why: with an agent in the foreground the Enter went to the agent's own
  // prompt (the wrapper's agent may not have reported yet), not the shell.
  const foreground = state.paneForegroundAgentByPaneKey[paneKey]
  if (foreground?.agent && !foreground.shellForeground) {
    return
  }
  state.clearAgentLaunchConfig(paneKey)
}
