import { afterEach, describe, expect, it, vi } from 'vitest'
import { reconcileRequestedWorkerTerminalReleases } from '../../../../orchestration/worker-terminal-release-reconciliation'
import { createOrchestrationWorkerReleaseHarness } from './worker-release.test-support'

describe('Antigravity orchestration worker lifecycle', () => {
  const h = createOrchestrationWorkerReleaseHarness()

  afterEach(() => h.cleanup())

  it('owns the terminal immediately and settles only once AGY starts its launch turn', async () => {
    h.setup()
    const turnStart = h.deferred<'observed'>()
    vi.spyOn(h.runtime, 'observeTerminalLaunchTurnStart').mockReturnValue(turnStart.promise)

    const pending = h.startWorker({ agent: 'antigravity' })
    const onSettled = vi.fn()
    void pending.then(onSettled, onSettled)
    await vi.waitFor(() => expect(h.runtime.observeTerminalLaunchTurnStart).toHaveBeenCalled())

    // AGY takes its prompt as a launch flag, so the brief rides the launch line, never a paste.
    expect(h.runtime.createTerminal).toHaveBeenCalledWith(
      'id:repo::worktree',
      expect.objectContaining({
        startupAgent: 'antigravity',
        surfaceOwner: false,
        preAllocatedHandle: 'term_worker',
        startupPrompt: expect.any(String),
        launchFile: expect.objectContaining({ sensitive: true })
      })
    )
    expect(h.db.listWorkerTerminalResources({})[0]?.resource).toMatchObject({
      ownership_state: 'owned',
      terminal_handle: 'term_worker'
    })

    expect(onSettled).not.toHaveBeenCalled()
    turnStart.resolve('observed')
    await expect(pending).resolves.toEqual(
      expect.objectContaining({ dispatchId: expect.any(String) })
    )
    expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })

  it('stops only the owned AGY terminal', async () => {
    h.setup()
    const { dispatchId } = await h.startWorker({ agent: 'antigravity' })

    await expect(
      h.call('orchestration.workerStop', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'stopped', processAction: 'closed_agent_terminal' })
    expect(h.runtime.closeTerminal).toHaveBeenCalledOnce()
    expect(h.runtime.closeTerminal).toHaveBeenCalledWith('term_worker')
  })

  it('releases an owned AGY terminal and recovers a transient stale endpoint', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded', {
      agent: 'antigravity'
    })
    vi.mocked(h.runtime.closeTerminal).mockRejectedValueOnce(new Error('Multiplexer disposed'))

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'release_pending', processAction: 'none' })
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
      ownership_state: 'owned',
      release_state: 'releasing'
    })

    await expect(reconcileRequestedWorkerTerminalReleases(h.runtime)).resolves.toMatchObject({
      attempted: 1,
      released: 1
    })
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
      release_state: 'released'
    })
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(2)
    expect(h.runtime.closeTerminal).toHaveBeenNthCalledWith(2, 'term_worker')
  })

  it('fails closed on a stale AGY handle and releases it on a fresh retry', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded', {
      agent: 'antigravity'
    })
    vi.mocked(h.runtime.showTerminal).mockRejectedValueOnce(new Error('terminal_handle_stale'))

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'release_unknown' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
      ownership_state: 'owned',
      release_state: 'unknown'
    })

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'released' })
    expect(h.runtime.closeTerminal).toHaveBeenCalledWith('term_worker')
  })
})
