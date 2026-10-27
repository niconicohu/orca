import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  changedFileScope,
  countFindings,
  listChangedFiles
} from './check-flaky-test-pattern-ratchet.mjs'

it('retains the complete changed-file scope when a Git diff exceeds one MiB', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-flaky-large-diff-'))
  const git = (args, input) => execFileSync('git', args, { cwd: root, encoding: 'utf8', input })
  try {
    git(['init', '--quiet'])
    const blob = git(['hash-object', '-w', '--stdin'], '').trim()
    const names = Array.from(
      { length: 5000 },
      (_, index) => `test-${String(index).padStart(4, '0')}-${'x'.repeat(230)}.test.ts`
    )
    const tree = git(
      ['mktree'],
      names.map((name) => `100644 blob ${blob}\t${name}\n`).join('')
    ).trim()
    const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid']
    const base = git([...identity, 'commit-tree', tree, '-m', 'baseline']).trim()
    git(['update-ref', 'refs/remotes/origin/main', base])
    const empty = git(['mktree'], '').trim()
    const head = git([...identity, 'commit-tree', empty, '-p', base, '-m', 'remove files']).trim()
    git(['update-ref', 'HEAD', head])
    expect(listChangedFiles(root)).toEqual(new Set(names))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('countFindings', () => {
  it('counts each rule per file, folding TSX twins and Windows separators', () => {
    const counts = countFindings(
      [
        { ruleId: 'test-no-wall-clock', file: 'src/a.test.ts' },
        { ruleId: 'test-no-wall-clock', file: 'src\\a.test.ts' },
        { ruleId: 'test-no-wall-clock-tsx', file: 'src/b.test.tsx' },
        { ruleId: 'test-no-real-time-wait', file: 'src/a.test.ts' },
        { ruleId: 'test-no-real-time-wait', file: 'scratch.test.ts' }
      ],
      (file) => file !== 'scratch.test.ts'
    )

    expect([...counts]).toEqual([
      ['test-no-wall-clock:src/a.test.ts', 2],
      ['test-no-wall-clock:src/b.test.tsx', 1],
      ['test-no-real-time-wait:src/a.test.ts', 1]
    ])
  })
})

describe('changedFileScope', () => {
  it('limits enforcement to findings in changed files', () => {
    const inScope = changedFileScope(new Set(['src/a.test.ts']))

    expect(inScope('test-no-wall-clock:src/a.test.ts')).toBe(true)
    expect(inScope('test-no-wall-clock:src/b.test.ts')).toBe(false)
    expect(changedFileScope(null)).toBeUndefined()
  })
})
