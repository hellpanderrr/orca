/**
 * Writes a launch file on the host that owns the PTY and puts its path where the
 * launch line and env name the placeholder. The file exists before any line
 * naming it is typed.
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LaunchFile } from './launch-prompt-file'

const LAUNCH_FILE_DIR_PREFIX = 'orca-launch-file-'
const LAUNCH_FILE_NAME = 'task-context.md'

/** A running agent may re-read its task file, so leftovers get a day, not an hour. */
export const LAUNCH_FILE_STALE_MS = 24 * 60 * 60 * 1000

// Why: the path replaces a placeholder inside an already-quoted argument, so it may only hold
// characters that are literal in POSIX, PowerShell and cmd quoting alike.
const QUOTE_INERT_POSIX_PATH = /^[A-Za-z0-9 _./:~+@=,-]+$/
const QUOTE_INERT_WINDOWS_PATH = /^[A-Za-z0-9 _./:~+@=,\\-]+$/

export class LaunchFileUnavailableError extends Error {
  constructor(reason: string) {
    super(`launch_file_unavailable: ${reason}`)
  }
}

export type WrittenLaunchFile = {
  directory: string
  path: string
  command?: string
  env?: Record<string, string>
}

let staleSweepStarted = false

/** Throws LaunchFileUnavailableError rather than type a line naming a file that is not there. */
export function writeLaunchFile(args: {
  launchFile: LaunchFile
  command?: string
  env?: Record<string, string>
  platform?: NodeJS.Platform
  baseDirectory?: string
}): WrittenLaunchFile {
  const platform = args.platform ?? process.platform
  const baseDirectory = args.baseDirectory ?? tmpdir()
  if (!staleSweepStarted) {
    staleSweepStarted = true
    // Why deferred: the sweep is crash recovery and must never delay this launch.
    setTimeout(() => sweepStaleLaunchFiles({ baseDirectory }), 0).unref?.()
  }
  let directory: string | undefined
  try {
    directory = mkdtempSync(join(baseDirectory, LAUNCH_FILE_DIR_PREFIX))
    const path = join(directory, LAUNCH_FILE_NAME)
    const inert = platform === 'win32' ? QUOTE_INERT_WINDOWS_PATH : QUOTE_INERT_POSIX_PATH
    if (!inert.test(path)) {
      throw new LaunchFileUnavailableError('temp directory path needs quoting')
    }
    writeFileSync(path, args.launchFile.content, { mode: 0o600, flag: 'wx' })
    const substitute = (value: string): string =>
      value.replaceAll(args.launchFile.placeholder, path)
    return {
      directory,
      path,
      ...(args.command !== undefined ? { command: substitute(args.command) } : {}),
      ...(args.env
        ? {
            env: Object.fromEntries(
              Object.entries(args.env).map(([key, value]) => [key, substitute(value)])
            )
          }
        : {})
    }
  } catch (error) {
    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
    throw error instanceof LaunchFileUnavailableError
      ? error
      : new LaunchFileUnavailableError(error instanceof Error ? error.message : String(error))
  }
}

export function removeLaunchFile(written: WrittenLaunchFile | undefined): void {
  if (!written) {
    return
  }
  try {
    rmSync(written.directory, { recursive: true, force: true })
  } catch {
    // The age-gated sweep is the fallback.
  }
}

/** Removes launch files a crashed host left behind; age-gated so a live agent's file survives. */
export function sweepStaleLaunchFiles(args: { baseDirectory?: string; now?: number }): void {
  const baseDirectory = args.baseDirectory ?? tmpdir()
  const now = args.now ?? Date.now()
  let names: string[]
  try {
    names = readdirSync(baseDirectory)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.startsWith(LAUNCH_FILE_DIR_PREFIX)) {
      continue
    }
    const directory = join(baseDirectory, name)
    try {
      if (now - statSync(directory).mtimeMs > LAUNCH_FILE_STALE_MS) {
        rmSync(directory, { recursive: true, force: true })
      }
    } catch {
      // Raced another instance's sweep.
    }
  }
}
