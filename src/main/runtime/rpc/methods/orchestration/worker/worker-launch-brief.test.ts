import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LaunchFile } from '../../../../../../shared/launch-prompt-file'
import { hashDispatchCapability } from '../../../../orchestration/db/dispatch-capability-hash'
import { createOrchestrationWorkerReleaseHarness } from './worker-release.test-support'

function capabilityIn(content: string): string {
  const capability = /dcap_[A-Za-z0-9_-]{43}/.exec(content)?.[0]
  if (!capability) {
    throw new Error('the brief carries no dispatch capability')
  }
  return capability
}

describe('worker-start with the brief on the launch command line', () => {
  const h = createOrchestrationWorkerReleaseHarness()

  afterEach(() => h.cleanup())

  it('puts the brief in a sensitive launch file on the spawn and pastes nothing', async () => {
    h.setup()
    const { dispatchId } = await h.startWorker({ agent: 'codex' })

    expect(h.runtime.createTerminal).toHaveBeenCalledWith(
      'id:repo::worktree',
      expect.objectContaining({
        startupAgent: 'codex',
        preAllocatedHandle: 'term_worker',
        startupPrompt: expect.stringMatching(/^The full task is in the file "orca-launch-file-/),
        launchFile: expect.objectContaining({ sensitive: true })
      })
    )
    const launchFile = vi.mocked(h.runtime.createTerminal).mock.calls[0][1]?.launchFile
    expect(launchFile?.content).toContain('release fixture task')
    expect(launchFile?.content).toContain(dispatchId)
    // Why: the capability rides only in the file, never on a command line or in history.
    expect(vi.mocked(h.runtime.createTerminal).mock.calls[0][1]?.startupPrompt).not.toContain(
      'dcap_'
    )
    expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    expect(h.runtime.waitForTerminal).toHaveBeenCalledWith(
      'term_worker',
      expect.objectContaining({ condition: 'tui-idle', signal: expect.any(AbortSignal) })
    )
  })

  it('binds exactly the capability the brief carries, and only after the spawn', async () => {
    h.setup()
    let boundAtSpawn: unknown = 'unset'
    let launchFile: LaunchFile | undefined
    vi.mocked(h.runtime.createTerminal).mockImplementation(async (_selector, options) => {
      launchFile = options?.launchFile
      boundAtSpawn = h.db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE capability_hash = ?')
        .get(hashDispatchCapability(capabilityIn(launchFile?.content ?? '')))
      return { handle: 'term_worker', worktreeId: 'repo::worktree', title: 'worker' }
    })

    const { dispatchId } = await h.startWorker({ agent: 'codex' })

    expect(boundAtSpawn).toBeUndefined()
    expect(
      h.db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE capability_hash = ?')
        .get(hashDispatchCapability(capabilityIn(launchFile?.content ?? '')))
    ).toEqual({ id: dispatchId })
  })

  it('reads a turn the launch observation did not see as unknown, not ready', async () => {
    h.setup()
    vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockResolvedValue('unobserved')
    const task = h.db.createTask({ spec: 'unobserved launch', runId: h.activeRunId })

    await expect(
      h.call('orchestration.workerStart', { task: task.id, from: 'term_coord', agent: 'codex' })
    ).resolves.toMatchObject({ state: 'outcome_unknown', turnStart: 'unobserved' })
  })

  it('fails the start on a startup dialog the agent is blocked on', async () => {
    h.setup()
    vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockReturnValue(new Promise(() => {}))
    vi.mocked(h.runtime.waitForTerminal).mockResolvedValue({
      handle: 'term_worker',
      condition: 'tui-idle',
      satisfied: false,
      status: 'running',
      exitCode: null,
      blockedReason: 'codex-update-prompt'
    })
    const task = h.db.createTask({ spec: 'blocked launch', runId: h.activeRunId })

    await expect(
      h.call('orchestration.workerStart', { task: task.id, from: 'term_coord', agent: 'codex' })
    ).resolves.toMatchObject({
      state: 'failed',
      lastError: expect.stringContaining('Agent startup blocked')
    })
  })

  it('keeps the paste for an agent that takes its prompt only after start', async () => {
    h.setup()
    vi.spyOn(h.runtime, 'waitForFreshWorkerComposer').mockResolvedValue(undefined)
    await h.startWorker({ agent: 'zcode' })

    expect(vi.mocked(h.runtime.createTerminal).mock.calls[0][1]).not.toHaveProperty('launchFile')
    expect(h.runtime.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
  })
})
