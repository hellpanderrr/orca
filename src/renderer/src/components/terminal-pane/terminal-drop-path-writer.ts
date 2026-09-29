import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { separateImagePasteFromFollowingText } from '../../../../shared/image-paste-following-text'
import { shellEscapePath } from './pane-helpers'
import type { PtyTransport } from './pty-transport'
import { wrapTerminalBracketedPasteText } from './terminal-bracketed-paste'
import { formatImageDropPathForBracketedPaste, isImageDropPath } from './terminal-drop-image-path'
import {
  type CapturedTerminalDropTarget,
  getCurrentTerminalDropTransport
} from './terminal-drop-target'
import type { TerminalTargetShell } from './terminal-drop-shell'
import { TERMINAL_PASTE_OPERATION_TIMEOUT_MS } from './terminal-paste-limits'
import { runTerminalPasteOperationWithTimeout } from './terminal-paste-operation-timeout'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import type { TerminalDropWriteFailureReason } from './terminal-drop-write-failure'

type TerminalDropPathWriteResult = {
  sentAnyPath: boolean
  targetCurrent: boolean
  pathsWritten: number
  failureReason?: TerminalDropWriteFailureReason
}

export async function writeTerminalDropPathsToCapturedTarget({
  dropTarget,
  manager,
  paneTransports,
  paths,
  targetShell,
  operationTimeoutMs = TERMINAL_PASTE_OPERATION_TIMEOUT_MS
}: {
  dropTarget: CapturedTerminalDropTarget
  manager: PaneManager
  paneTransports: Map<number, PtyTransport>
  paths: readonly string[]
  targetShell: TerminalTargetShell
  operationTimeoutMs?: number
}): Promise<TerminalDropPathWriteResult> {
  let sentAnyPath = false
  let pathsWritten = 0
  for (const [index, path] of paths.entries()) {
    // Why: acknowledged PTY writes are async, so a multi-path drop can outlive
    // the pane or PTY it originally targeted.
    const liveTransport = getCurrentTerminalDropTransport(manager, paneTransports, dropTarget)
    if (!liveTransport) {
      return { sentAnyPath, targetCurrent: false, pathsWritten, failureReason: 'target-stale' }
    }
    // Why: image drops are attachment payloads for terminal TUIs, which detect
    // them from a bracketed paste and recover the path with shell-style
    // unescaping, mirroring the clipboard screenshot flow (issue #2842).
    // Non-image drops (and control-byte names no paste can carry) keep the
    // shell-escaped, space-separated behaviour for use in shell commands.
    //
    // Image payloads carry no trailing space of their own, so when an image is
    // immediately followed by a non-image path the two would otherwise collide
    // (`<bracketed-paste>/repo/a.ts`). Add a single separating space in that
    // case only — back-to-back image pastes are self-delimiting and a stray
    // space between them would land in the TUI input.
    const imagePaste = formatImagePaste(path, targetShell)
    const nextPath = paths[index + 1]
    const needsSeparatorAfterImage =
      imagePaste !== null &&
      nextPath !== undefined &&
      formatImagePaste(nextPath, targetShell) === null
    const payload =
      imagePaste !== null
        ? separateImagePasteFromFollowingText(
            wrapTerminalBracketedPasteText(imagePaste),
            needsSeparatorAfterImage
          )
        : `${shellEscapePath(path, targetShell)} `
    const writeResult = await runTerminalPasteOperationWithTimeout(
      () => writeTerminalPastePtyInput(liveTransport, payload, 'driving'),
      operationTimeoutMs
    )
    if (writeResult.timedOut) {
      return { sentAnyPath, targetCurrent: false, pathsWritten, failureReason: 'operation-timeout' }
    }
    if (!writeResult.value) {
      return { sentAnyPath, targetCurrent: false, pathsWritten, failureReason: 'write-rejected' }
    }
    pathsWritten += 1
    sentAnyPath = true
  }
  return {
    sentAnyPath,
    targetCurrent: Boolean(getCurrentTerminalDropTransport(manager, paneTransports, dropTarget)),
    pathsWritten
  }
}

function formatImagePaste(path: string, targetShell: TerminalTargetShell): string | null {
  return isImageDropPath(path) ? formatImageDropPathForBracketedPaste(path, targetShell) : null
}
