import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LAUNCH_FILE_STALE_MS,
  LaunchFileUnavailableError,
  removeLaunchFile,
  sweepStaleLaunchFiles,
  writeLaunchFile
} from './launch-file-writing'
import {
  MAX_INLINE_LAUNCH_PROMPT_CHARS,
  buildLaunchFilePointer,
  parseLaunchFile,
  planLaunchPrompt
} from './launch-prompt-file'

let baseDirectory: string

beforeEach(() => {
  baseDirectory = mkdtempSync(join(tmpdir(), 'orca-launchfile-test-'))
})

afterEach(() => {
  rmSync(baseDirectory, { recursive: true, force: true })
})

describe('planLaunchPrompt', () => {
  it('keeps a prompt at the ceiling inline', () => {
    const prompt = 'a'.repeat(MAX_INLINE_LAUNCH_PROMPT_CHARS)
    expect(planLaunchPrompt(prompt)).toEqual({ prompt })
  })

  it('moves a 20,000-character prompt into a launch file', () => {
    const prompt = 'b'.repeat(20_000)
    const planned = planLaunchPrompt(prompt)
    expect(planned.launchFile).toMatchObject({ content: prompt, sensitive: false })
    expect(planned.prompt).toBe(buildLaunchFilePointer(planned.launchFile!.placeholder))
  })

  it('moves a short sensitive prompt into a launch file', () => {
    const planned = planLaunchPrompt('token dcap_secret', { sensitive: true })
    expect(planned.prompt).not.toContain('dcap_secret')
    expect(planned.launchFile).toMatchObject({ content: 'token dcap_secret', sensitive: true })
  })

  it('mints a fresh placeholder each time', () => {
    const first = planLaunchPrompt('x', { sensitive: true }).launchFile!.placeholder
    const second = planLaunchPrompt('x', { sensitive: true }).launchFile!.placeholder
    expect(first).not.toBe(second)
  })
})

describe('parseLaunchFile', () => {
  it('accepts what planLaunchPrompt mints and rejects anything else', () => {
    const { launchFile } = planLaunchPrompt('x', { sensitive: true })
    expect(parseLaunchFile(launchFile)).toEqual(launchFile)
    expect(parseLaunchFile({ ...launchFile, placeholder: 'HOME' })).toBeUndefined()
    expect(parseLaunchFile({ ...launchFile, sensitive: 'yes' })).toBeUndefined()
    expect(parseLaunchFile(null)).toBeUndefined()
  })
})

describe('writeLaunchFile', () => {
  it('writes a 0600 file in a private 0700 directory and puts its path in the line and env', () => {
    const { prompt, launchFile } = planLaunchPrompt('c'.repeat(20_000))
    const written = writeLaunchFile({
      launchFile: launchFile!,
      command: `claude '${prompt}'`,
      env: { ORCA_HERMES_STARTUP_QUERY: prompt, OTHER: 'kept' },
      baseDirectory
    })
    expect(dirname(written.path)).toBe(written.directory)
    expect(statSync(written.directory).mode & 0o777).toBe(0o700)
    expect(statSync(written.path).mode & 0o777).toBe(0o600)
    expect(readFileSync(written.path, 'utf8')).toBe('c'.repeat(20_000))
    expect(written.command).toBe(`claude '${buildLaunchFilePointer(written.path)}'`)
    expect(written.env).toEqual({
      ORCA_HERMES_STARTUP_QUERY: buildLaunchFilePointer(written.path),
      OTHER: 'kept'
    })
  })

  it('refuses a temp directory whose path would need quoting, leaving nothing behind', () => {
    const quoted = join(baseDirectory, "it's")
    mkdirSync(quoted)
    const { launchFile } = planLaunchPrompt('x', { sensitive: true })
    expect(() => writeLaunchFile({ launchFile: launchFile!, baseDirectory: quoted })).toThrow(
      LaunchFileUnavailableError
    )
    expect(readdirSync(quoted)).toEqual([])
  })

  it('refuses when the temp directory cannot be written', () => {
    const { launchFile } = planLaunchPrompt('x', { sensitive: true })
    expect(() =>
      writeLaunchFile({ launchFile: launchFile!, baseDirectory: join(baseDirectory, 'missing') })
    ).toThrow(/launch_file_unavailable/)
  })

  it('removes the whole directory', () => {
    const { launchFile } = planLaunchPrompt('x', { sensitive: true })
    const written = writeLaunchFile({ launchFile: launchFile!, baseDirectory })
    removeLaunchFile(written)
    expect(existsSync(written.directory)).toBe(false)
  })
})

describe('sweepStaleLaunchFiles', () => {
  it('removes only launch file directories older than a day', () => {
    const now = Date.now()
    const stale = join(baseDirectory, 'orca-launch-file-aaaaaa')
    const fresh = join(baseDirectory, 'orca-launch-file-bbbbbb')
    const unrelated = join(baseDirectory, 'unrelated')
    for (const directory of [stale, fresh, unrelated]) {
      mkdirSync(directory)
    }
    const staleSeconds = (now - LAUNCH_FILE_STALE_MS - 1000) / 1000
    utimesSync(stale, staleSeconds, staleSeconds)
    utimesSync(unrelated, staleSeconds, staleSeconds)
    sweepStaleLaunchFiles({ baseDirectory, now })
    expect(readdirSync(baseDirectory).sort()).toEqual(['orca-launch-file-bbbbbb', 'unrelated'])
  })
})
