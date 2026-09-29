import { describe, expect, it } from 'vitest'
import { formatImageDropPathForBracketedPaste, isImageDropPath } from './terminal-drop-image-path'

describe('isImageDropPath', () => {
  it('detects common image extensions case-insensitively', () => {
    for (const path of [
      '/repo/shot.png',
      '/repo/shot.PNG',
      '/repo/a.jpg',
      '/repo/a.jpeg',
      '/repo/a.gif',
      '/repo/icon.svg',
      '/repo/a.webp',
      '/repo/a.bmp',
      '/repo/a.ico',
      'C:\\Users\\me\\Pictures\\diagram.PnG'
    ]) {
      expect(isImageDropPath(path)).toBe(true)
    }
  })

  it('rejects non-image and extension-less paths', () => {
    for (const path of [
      '/repo/index.ts',
      '/repo/notes.md',
      '/repo/archive.tar.gz',
      '/repo/Makefile',
      '/repo/.gitignore'
    ]) {
      expect(isImageDropPath(path)).toBe(false)
    }
  })

  it('does not classify directory components with dots as images', () => {
    expect(isImageDropPath('/home/jane.png/photo')).toBe(false)
    expect(isImageDropPath('/home/jane.doe/screenshot')).toBe(false)
  })
})

// Why: small replays of how agents recover a path from pasted text, so the
// escaping is checked against what they actually accept.
// Claude Code: strip one pair of surrounding quotes, then unescape backslashes.
function claudeCodeRecoverPath(pasted: string): string {
  return pasted.replace(/^(['"])(.*)\1$/s, '$2').replace(/\\(.)/gs, '$1')
}

// Codex: `normalize_pasted_path` keeps the paste only when POSIX shlex yields one token.
function codexRecoverPath(pasted: string): string | null {
  const tokens: string[] = []
  let current: string | null = null
  let quote: "'" | '"' | null = null
  for (let i = 0; i < pasted.length; i += 1) {
    const char = pasted[i]
    if (quote === "'") {
      if (char === "'") {
        quote = null
      } else {
        current += char
      }
    } else if (quote === '"') {
      if (char === '"') {
        quote = null
      } else if (char === '\\' && /["\\$`]/.test(pasted[i + 1] ?? '')) {
        current += pasted[++i]
      } else {
        current += char
      }
    } else if (char === ' ' || char === '\t' || char === '\n') {
      if (current !== null) {
        tokens.push(current)
        current = null
      }
    } else {
      current ??= ''
      if (char === '\\') {
        current += pasted[++i] ?? ''
      } else if (char === "'" || char === '"') {
        quote = char
      } else {
        current += char
      }
    }
  }
  if (quote !== null) {
    return null
  }
  if (current !== null) {
    tokens.push(current)
  }
  return tokens.length === 1 ? tokens[0] : null
}

describe('formatImageDropPathForBracketedPaste', () => {
  it('leaves plain names raw', () => {
    expect(formatImageDropPathForBracketedPaste('/tmp/orca-paste-1-abc.png', 'posix')).toBe(
      '/tmp/orca-paste-1-abc.png'
    )
    expect(formatImageDropPathForBracketedPaste('C:\\Temp\\orca-paste-1.png', 'windows')).toBe(
      'C:\\Temp\\orca-paste-1.png'
    )
  })

  it('keeps U+202F bare and escapes ASCII spaces on posix', () => {
    expect(
      formatImageDropPathForBracketedPaste('/t/Screenshot at 4.03.11\u202fPM.png', 'posix')
    ).toBe('/t/Screenshot\\ at\\ 4.03.11\u202fPM.png')
  })

  it('double-quotes spaced and metacharacter names on windows', () => {
    expect(formatImageDropPathForBracketedPaste('C:\\My Pics\\a.png', 'windows')).toBe(
      '"C:\\My Pics\\a.png"'
    )
    expect(formatImageDropPathForBracketedPaste('C:\\p\\100%.png', 'windows')).toBe(
      '"C:\\p\\100%.png"'
    )
  })

  it('refuses paths no bracketed paste can carry', () => {
    expect(formatImageDropPathForBracketedPaste('/t/a\nb.png', 'posix')).toBeNull()
    expect(formatImageDropPathForBracketedPaste('/t/a\x7fb.png', 'posix')).toBeNull()
    expect(formatImageDropPathForBracketedPaste('C:\\a"b.png', 'windows')).toBeNull()
  })

  it.each([
    '/t/Screenshot 2026-09-28 at 4.03.11\u202fPM.png',
    "/t/it's.png",
    '/t/say "hi".png',
    '/t/back\\slash.png',
    '/t/a.png; touch /tmp/pwned #.png',
    '/t/$(whoami) `id` {a,b} [x]*?!&|<>.png',
    '/t/plain.png'
  ])('round-trips %s through Claude Code and Codex unescaping', (path) => {
    const pasted = formatImageDropPathForBracketedPaste(path, 'posix')
    if (pasted === null) {
      throw new Error(`Expected a bracketed-paste representation for ${path}`)
    }
    expect(claudeCodeRecoverPath(pasted)).toBe(path)
    expect(codexRecoverPath(pasted)).toBe(path)
  })

  it('round-trips a quoted windows path through Claude Code unescaping', () => {
    const path = 'C:\\Users\\me\\My Pictures\\shot.png'
    const pasted = formatImageDropPathForBracketedPaste(path, 'windows')
    expect(pasted).toBe(`"${path}"`)
    // Why: Claude Code only strips the quotes here; windows backslashes are separators.
    if (pasted === null) {
      throw new Error(`Expected a bracketed-paste representation for ${path}`)
    }
    expect(pasted.replace(/^(['"])(.*)\1$/s, '$2')).toBe(path)
  })

  it('round-trips a quoted windows path through Codex unescaping', () => {
    const path = 'C:\\Users\\me\\My Pictures\\shot 100%.png'
    const pasted = formatImageDropPathForBracketedPaste(path, 'windows')
    if (pasted === null) {
      throw new Error(`Expected a bracketed-paste representation for ${path}`)
    }
    expect(codexRecoverPath(pasted)).toBe(path)
  })

  it('shows why a raw spaced path was not enough for Codex', () => {
    expect(codexRecoverPath('/t/Screenshot at 4.03.11\u202fPM.png')).toBeNull()
  })
})
