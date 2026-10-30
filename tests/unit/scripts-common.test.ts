/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * The maintenance scripts take a real client secret. The one thing they must
 * not do is print it, including when someone pastes it as a positional
 * argument or as `--secret value`.
 */

import { join } from 'node:path'

const COMMON = join(__dirname, '..', '..', 'scripts', 'lib', 'common.js')

interface CommonLib {
  parseFlags(argv: string[], known: Record<string, string>): Record<string, unknown>
  consumeHiddenChunk(
    value: string,
    chunk: string | Buffer,
  ): { value: string; done: boolean; cancelled: boolean }
}

function load(): CommonLib {
  return require(COMMON) as CommonLib
}

describe('script flag parsing', () => {
  const errors: string[] = []

  beforeEach(() => {
    errors.length = 0
    jest.spyOn(console, 'error').mockImplementation((message: unknown) => {
      errors.push(String(message))
    })
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code ?? 0}`)
    }) as never)
  })

  it('accepts a known boolean flag', () => {
    const { parseFlags } = load()
    expect(parseFlags(['--verbose'], { verbose: 'boolean' })).toEqual({ verbose: true })
  })

  it('does not echo a positional secret', () => {
    const { parseFlags } = load()
    expect(() => parseFlags(['test-secret'], { verbose: 'boolean' })).toThrow(/exit 1/)
    const printed = errors.join('\n')
    expect(printed).not.toContain('test-secret')
    expect(printed).toMatch(/unexpected argument/)
  })

  it('does not echo an unknown --secret flag or its value', () => {
    const { parseFlags } = load()
    expect(() => parseFlags(['--secret', 'test-secret'], { verbose: 'boolean' })).toThrow(/exit 1/)
    const printed = errors.join('\n')
    expect(printed).not.toContain('test-secret')
    expect(printed).not.toContain('--secret')
  })
})

describe('the hidden secret prompt', () => {
  it('keeps characters that arrive as utf8 strings, the way readline leaves stdin', () => {
    const { consumeHiddenChunk } = load()
    const typed = consumeHiddenChunk('', 'secret')
    const submitted = consumeHiddenChunk(typed.value, '\r')
    expect(typed).toEqual({ value: 'secret', done: false, cancelled: false })
    expect(submitted).toEqual({ value: 'secret', done: true, cancelled: false })
  })

  it('keeps the same secret when the chunk is still a Buffer', () => {
    const { consumeHiddenChunk } = load()
    expect(consumeHiddenChunk('', Buffer.from('secret\r'))).toEqual({ value: 'secret', done: true, cancelled: false })
  })

  it('handles backspace and Ctrl-C', () => {
    const { consumeHiddenChunk } = load()
    expect(consumeHiddenChunk('', 'secrex\u007ft').value).toBe('secret')
    expect(consumeHiddenChunk('sec', '\u0003')).toEqual({ value: 'sec', done: true, cancelled: true })
  })
})
