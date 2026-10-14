// DIAGNOSTIC ONLY (never merged): why does removing an orcad stop-test root hit EPERM on Windows?
import { mkdtempSync, openSync, closeSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { describe, it, vi } from 'vitest'
import type * as WindowsAcl from '../../shared/secure-path-windows-acl'
import { acquireOrcadInstanceLock } from './orcad-instance-lock'
import { orcadManagedStopRequestPath } from './orcad-managed-stop-request'
import { claimOrcadManagedStopDecision } from './orcad-managed-stop-decision'
import { cancelOrcadManagedStop } from './orcad-managed-stop-cancellation'

const hardening = vi.hoisted(() => ({ pending: new Set<Promise<void>>(), calls: [] as string[] }))

vi.mock('../../shared/secure-path-windows-acl', async (importOriginal) => {
  const acl = await importOriginal<typeof WindowsAcl>()
  return {
    ...acl,
    restrictWindowsDirectory: (dirPath: string): Promise<boolean> => {
      hardening.calls.push(dirPath)
      const restricted = acl.restrictWindowsDirectory(dirPath)
      const pending = restricted.then(() => undefined)
      hardening.pending.add(pending)
      void pending.then(() => hardening.pending.delete(pending))
      return restricted
    }
  }
})

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let kind = '?'
    try {
      kind = statSync(p).isDirectory() ? 'd' : 'f'
    } catch (e) {
      kind = `stat:${(e as NodeJS.ErrnoException).code}`
    }
    let open = 'n/a'
    if (kind === 'f') {
      try {
        closeSync(openSync(p, 'r+'))
        open = 'ok'
      } catch (e) {
        open = String((e as NodeJS.ErrnoException).code)
      }
    }
    out.push(`${name}[${kind},open=${open}]`)
    if (kind === 'd') {
      out.push(...walk(p).map((x) => `${name}/${x}`))
    }
  }
  return out
}

async function once(i: number, mode: string): Promise<string | null> {
  const root = mkdtempSync(join(tmpdir(), 'orcad-diag-stop-'))
  const lock = acquireOrcadInstanceLock(root, { identity: () => 'uid-1000', startedAtMs: () => 5 })
  const { pid, startedAtMs, nonce } = lock.record
  const request = {
    schemaVersion: 1 as const,
    transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
    version: '1.0.0',
    runtimeId: 'runtime-1',
    instance: { pid, startedAtMs, nonce, lockPath: lock.path }
  }
  if (mode === 'claim') {
    claimOrcadManagedStopDecision(request, 'canceled')
  } else {
    writeFileSync(orcadManagedStopRequestPath(request.instance), JSON.stringify(request))
    cancelOrcadManagedStop(request)
  }
  const calls = hardening.calls.splice(0)
  await Promise.all(hardening.pending)
  const started = Date.now()
  let firstError: string | null = null
  let snapshot = ''
  for (;;) {
    try {
      rmSync(root, { recursive: true, force: true })
      break
    } catch (e) {
      if (!firstError) {
        firstError = String((e as NodeJS.ErrnoException).code)
        try {
          snapshot = walk(root).join(' ')
        } catch (w) {
          snapshot = `walk:${(w as NodeJS.ErrnoException).code}`
        }
      }
      if (Date.now() - started > 60_000) {
        return `${mode} i=${i} STILL-FAILING after 60s first=${firstError} left=${snapshot} asyncCalls=${calls.length}`
      }
      await new Promise((r) => setTimeout(r, 25))
    }
  }
  return firstError
    ? `${mode} i=${i} recovered after ${Date.now() - started}ms first=${firstError} left=${snapshot} asyncCalls=${calls.length}`
    : null
}

describe.runIf(process.platform === 'win32')('diag stop root removal', () => {
  it('repeats the cancellation test setup and teardown', async () => {
    const rows: string[] = []
    let clean = 0
    // Load like a parallel vitest run: CPU burners plus file churn in the same temp tree.
    const load = Array.from({ length: cpus().length * 2 }, (_, n) =>
      spawn(
        process.execPath,
        [
          '-e',
          n % 2
            ? 'for(;;){}'
            : `const fs=require('fs'),p=require('path'),os=require('os');const d=fs.mkdtempSync(p.join(os.tmpdir(),'churn-'));let i=0;setInterval(()=>{for(let k=0;k<50;k++){fs.writeFileSync(p.join(d,'f'+(i++%500)),'x'.repeat(4096))}},5)`
        ],
        { stdio: 'ignore', windowsHide: true }
      )
    )
    try {
    for (let i = 0; i < 200; i++) {
      const row = await once(i, i % 2 ? 'claim' : 'cancel')
      if (row) rows.push(row)
      else clean++
    }
    } finally {
      for (const b of load) b.kill()
    }
    console.log(`clean=${clean}\n${rows.join('\n')}`)
  }, 900_000)
})
