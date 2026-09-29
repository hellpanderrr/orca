import { describe, expect, it, vi } from 'vitest'
import { wrapTerminalBracketedPasteText } from './terminal-bracketed-paste'
import { writeTerminalDropPathsToCapturedTarget } from './terminal-drop-path-writer'

function createTransport(
  sendInput: ReturnType<typeof vi.fn>,
  ptyId = 'pty-1',
  sendInputAccepted?: ReturnType<typeof vi.fn>
) {
  return {
    sendInput,
    ...(sendInputAccepted ? { sendInputAccepted } : {}),
    getPtyId: vi.fn(() => ptyId),
    isConnected: vi.fn(() => true)
  }
}

function createManager() {
  const pane = { id: 1, leafId: 'leaf-1' }
  return {
    pane,
    manager: {
      getActivePane: () => pane,
      getPanes: () => [pane]
    }
  }
}

describe('terminal drop path writer', () => {
  it('stops writing dropped paths when the PTY rejects a path', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => false)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    const result = await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/a.ts', '/repo/b.ts'],
      targetShell: 'posix'
    })

    expect(result).toEqual({
      sentAnyPath: false,
      targetCurrent: false,
      pathsWritten: 0,
      failureReason: 'write-rejected'
    })
    expect(sendInputAccepted).toHaveBeenCalledTimes(1)
    expect(sendInputAccepted).toHaveBeenCalledWith('/repo/a.ts ', 'driving')
    expect(sendInput).not.toHaveBeenCalled()
  })

  it('writes plain dropped image paths as a bracketed paste of the raw path', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    const result = await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/tmp/orca-paste-1-abc.png'],
      targetShell: 'posix'
    })

    expect(result).toEqual({ sentAnyPath: true, targetCurrent: true, pathsWritten: 1 })
    // Why: image attachment detection in terminal TUIs keys off bracketed paste
    // of the path — no quoting, no trailing space.
    expect(sendInputAccepted).toHaveBeenCalledWith(
      wrapTerminalBracketedPasteText('/tmp/orca-paste-1-abc.png'),
      'driving'
    )
  })

  it('backslash-escapes spaces in a dropped image path inside the bracketed paste', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/Screenshot 2026-09-28 at 4.03.11\u202fPM.png'],
      targetShell: 'posix'
    })

    expect(sendInputAccepted).toHaveBeenCalledWith(
      wrapTerminalBracketedPasteText('/repo/Screenshot\\ 2026-09-28\\ at\\ 4.03.11\u202fPM.png'),
      'driving'
    )
  })

  it('double-quotes a spaced image path inside the bracketed paste on a windows shell', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['C:\\Users\\me\\My Pictures\\shot\u202fPM.png'],
      targetShell: 'windows'
    })

    expect(sendInputAccepted).toHaveBeenCalledWith(
      wrapTerminalBracketedPasteText('"C:\\Users\\me\\My Pictures\\shot\u202fPM.png"'),
      'driving'
    )
  })

  it('still types a control-byte image path shell-escaped', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/a\x1b[201~b.png'],
      targetShell: 'posix'
    })

    expect(sendInputAccepted).toHaveBeenCalledWith("'/repo/a\x1b[201~b.png' ", 'driving')
  })

  it('keeps shell-escaped input for mixed image and non-image drops', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/a.ts', '/repo/shot.png'],
      targetShell: 'posix'
    })

    expect(sendInputAccepted).toHaveBeenNthCalledWith(1, '/repo/a.ts ', 'driving')
    expect(sendInputAccepted).toHaveBeenNthCalledWith(
      2,
      wrapTerminalBracketedPasteText('/repo/shot.png'),
      'driving'
    )
  })

  it('separates an image paste from a following non-image path', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/shot.png', '/repo/a.ts'],
      targetShell: 'posix'
    })

    // Why: the image paste carries no trailing space of its own, so a following
    // non-image path would collide with it without an explicit separator.
    expect(sendInputAccepted).toHaveBeenNthCalledWith(
      1,
      `${wrapTerminalBracketedPasteText('/repo/shot.png')} `,
      'driving'
    )
    expect(sendInputAccepted).toHaveBeenNthCalledWith(2, '/repo/a.ts ', 'driving')
  })

  it('does not insert a separator between back-to-back image pastes', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/one.png', '/repo/two.png'],
      targetShell: 'posix'
    })

    // Why: bracketed pastes are self-delimiting; a stray space would land in the
    // TUI input between the two attachments.
    expect(sendInputAccepted).toHaveBeenNthCalledWith(
      1,
      wrapTerminalBracketedPasteText('/repo/one.png'),
      'driving'
    )
    expect(sendInputAccepted).toHaveBeenNthCalledWith(
      2,
      wrapTerminalBracketedPasteText('/repo/two.png'),
      'driving'
    )
  })

  it('escapes POSIX shell metacharacters in an image path inside the bracketed paste', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/a.png; touch /tmp/pwned #.png'],
      targetShell: 'posix'
    })

    expect(sendInputAccepted).toHaveBeenCalledWith(
      wrapTerminalBracketedPasteText('/repo/a.png\\;\\ touch\\ /tmp/pwned\\ \\#.png'),
      'driving'
    )
  })

  it('double-quotes Windows shell metacharacters in an image path inside the bracketed paste', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['C:\\Users\\me\\Pictures\\a&b.png'],
      targetShell: 'windows'
    })

    expect(sendInputAccepted).toHaveBeenCalledWith(
      wrapTerminalBracketedPasteText('"C:\\Users\\me\\Pictures\\a&b.png"'),
      'driving'
    )
  })

  it('separates an image paste from a following image path that must be typed', async () => {
    const sendInput = vi.fn(() => true)
    const sendInputAccepted = vi.fn(async () => true)
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

    await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/shot.png', '/repo/a\x07b.png'],
      targetShell: 'posix'
    })

    expect(sendInputAccepted).toHaveBeenNthCalledWith(
      1,
      `${wrapTerminalBracketedPasteText('/repo/shot.png')} `,
      'driving'
    )
    expect(sendInputAccepted).toHaveBeenNthCalledWith(2, "'/repo/a\x07b.png' ", 'driving')
  })

  it('times out dropped path writes that never receive PTY acknowledgement', async () => {
    vi.useFakeTimers()
    try {
      const sendInput = vi.fn(() => true)
      const sendInputAccepted = vi.fn(() => new Promise<boolean>(() => {}))
      const { manager, pane } = createManager()
      const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)

      const result = writeTerminalDropPathsToCapturedTarget({
        dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
        manager: manager as never,
        paneTransports: new Map([[pane.id, transport]]) as never,
        paths: ['/repo/a.ts'],
        targetShell: 'posix',
        operationTimeoutMs: 25
      })

      await vi.advanceTimersByTimeAsync(25)

      await expect(result).resolves.toEqual({
        sentAnyPath: false,
        targetCurrent: false,
        pathsWritten: 0,
        failureReason: 'operation-timeout'
      })
      expect(sendInputAccepted).toHaveBeenCalledTimes(1)
      expect(sendInput).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports partial writes when the captured target becomes stale between paths', async () => {
    const sendInput = vi.fn(() => true)
    let ptyId = 'pty-1'
    const sendInputAccepted = vi.fn(async () => {
      ptyId = 'pty-2'
      return true
    })
    const { manager, pane } = createManager()
    const transport = createTransport(sendInput, 'pty-1', sendInputAccepted)
    transport.getPtyId.mockImplementation(() => ptyId)

    const result = await writeTerminalDropPathsToCapturedTarget({
      dropTarget: { paneId: pane.id, leafId: pane.leafId, ptyId: 'pty-1', transport } as never,
      manager: manager as never,
      paneTransports: new Map([[pane.id, transport]]) as never,
      paths: ['/repo/a.ts', '/repo/b.ts'],
      targetShell: 'posix'
    })

    expect(result).toEqual({
      sentAnyPath: true,
      targetCurrent: false,
      pathsWritten: 1,
      failureReason: 'target-stale'
    })
    expect(sendInputAccepted).toHaveBeenCalledTimes(1)
  })
})
