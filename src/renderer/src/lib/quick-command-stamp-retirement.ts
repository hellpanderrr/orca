import { useAppStore } from '@/store'
import { isQuickCommandStampOnlyLaunchConfig } from '../../../shared/quick-command-resume'

/**
 * Why: a Quick Command tab's stamp waits for the agent its command launches,
 * but the stamp's launch token lives in the pane's shell env, so an agent the
 * user starts later in that shell would carry it too. Once the Quick Command's
 * own command has finished (OSC 133 D) without an agent binding a provider
 * session, nothing it launched is resumable — retire the stamp so a later
 * hand-started agent can't resume through `./deploy.sh --resume`.
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
  state.clearAgentLaunchConfig(paneKey)
}
