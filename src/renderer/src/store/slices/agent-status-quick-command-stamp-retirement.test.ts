import { describe, expect, it, vi } from 'vitest'
import { createTestStore, makeTab } from './store-test-helpers'

// Why: the retirement helper reads the app store singleton; point it at a real
// store so the registry/status reducers run for real.
type TestStore = ReturnType<typeof createTestStore>
const store = vi.hoisted(() => {
  const holder: { current: TestStore | null } = { current: null }
  return holder
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => {
      if (!store.current) {
        throw new Error('test store not initialised')
      }
      return store.current.getState()
    }
  }
}))

const PANE = 'tab-1:leaf-1'
const IDENTITY = { launchToken: 'launch-token-1', tabId: 'tab-1', leafId: 'leaf-1' }

async function setup(): Promise<ReturnType<typeof createTestStore>> {
  const created = createTestStore()
  store.current = created
  created.setState({ tabsByWorktree: { 'wt-1': [makeTab({ id: 'tab-1', worktreeId: 'wt-1' })] } })
  created
    .getState()
    .registerAgentLaunchConfig(
      PANE,
      { agentArgs: '', agentEnv: {}, quickCommandId: 'qc-muse', quickCommandLabel: 'muse' },
      IDENTITY
    )
  return created
}

function reportClaudeSession(created: ReturnType<typeof createTestStore>, id: string): void {
  created
    .getState()
    .setAgentStatus(
      PANE,
      { state: 'working', prompt: 'task', agentType: 'claude' },
      'Claude',
      { updatedAt: 10, stateStartedAt: 10 },
      { tabId: 'tab-1', worktreeId: 'wt-1' },
      { providerSession: { key: 'session_id', id }, launchToken: 'launch-token-1' }
    )
}

describe('retireUnusedQuickCommandStamp', () => {
  it('drops an unused stamp so a later hand-started agent resumes stock', async () => {
    const created = await setup()
    const { retireUnusedQuickCommandStamp } = await import('@/lib/quick-command-stamp-retirement')
    // `./deploy.sh --resume` finished (OSC 133 D); the user then types `claude`.
    retireUnusedQuickCommandStamp(PANE)
    reportClaudeSession(created, 'session-hand-started')
    const record = created.getState().sleepingAgentSessionsByPaneKey[PANE]
    expect(record?.providerSession.id).toBe('session-hand-started')
    expect(record?.quickCommandId).toBeUndefined()
  })

  it('keeps a stamp the wrapper-launched agent already bound', async () => {
    const created = await setup()
    const { retireUnusedQuickCommandStamp } = await import('@/lib/quick-command-stamp-retirement')
    reportClaudeSession(created, 'session-muse')
    retireUnusedQuickCommandStamp(PANE)
    expect(created.getState().sleepingAgentSessionsByPaneKey[PANE]).toMatchObject({
      providerSession: { id: 'session-muse' },
      quickCommandId: 'qc-muse'
    })
  })
})
