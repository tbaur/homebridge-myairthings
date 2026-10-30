/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * The same patterns the CI secrets job greps for.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const SKIP = new Set(['node_modules', 'coverage', '.git'])
const JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}\./
const BASIC = /Authorization:\s*Basic\s+[A-Za-z0-9+/=]{16,}/
const ROOTS = [
  'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'DEVELOPMENT.md', 'RELEASING.md',
  'CHANGELOG.md', 'config.schema.json', 'docs', 'src', 'tests', 'scripts', 'dist', '.github',
]

function walk(path: string, files: string[]): void {
  if (!existsSync(path) || SKIP.has(path.split(/[/\\]/).pop() ?? '')) {
    return
  }
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) {
      walk(join(path, name), files)
    }
    return
  }
  files.push(path)
}

describe('committed text', () => {
  const files: string[] = []
  for (const entry of ROOTS) {
    walk(join(ROOT, entry), files)
  }

  it('contains no JWT or basic credential', () => {
    const hits = files.filter((file) => {
      const text = readFileSync(file, 'utf8')
      return JWT.test(text) || BASIC.test(text)
    })
    expect(hits.map((file) => relative(ROOT, file))).toEqual([])
  })
})
