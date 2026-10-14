// DIAGNOSTIC ONLY (never merged): measures taskkill /t outcomes against a cmd -> node tree.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import { runProcess } from '@orca/process-host'

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function fixture(): Promise<{ dir: string; cmd: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-diag-'))
  await writeFile(
    path.join(dir, 'hang.js'),
    `require('node:fs').writeFileSync(require('node:path').join(__dirname, 'child.pid'), String(process.pid)); setTimeout(function () {}, 30000);`
  )
  const cmd = path.join(dir, 'probe.CMD')
  await writeFile(cmd, `@echo off\r\n"${process.execPath}" "%~dp0hang.js"\r\n`)
  return { dir, cmd }
}

async function childPid(dir: string): Promise<number | null> {
  try {
    return Number(await readFile(path.join(dir, 'child.pid'), 'utf8'))
  } catch {
    return null
  }
}

function burners(n: number): ChildProcess[] {
  return Array.from({ length: n }, () =>
    spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', windowsHide: true })
  )
}

async function pass(label: string): Promise<void> {
  const rows: string[] = []
  for (let i = 0; i < 15; i++) {
    const { dir, cmd } = await fixture()
    const delay = [0, 50, 200, 600, 1500][i % 5]
    const root = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${cmd}"`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: true
    })
    root.stdout?.resume()
    root.stderr?.resume()
    await new Promise((r) => setTimeout(r, delay))
    const before = await childPid(dir)
    const started = Date.now()
    const tk = spawnSync(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(root.pid), '/t', '/f'],
      { encoding: 'utf8', windowsHide: true }
    )
    const ms = Date.now() - started
    await new Promise((r) => setTimeout(r, 300))
    const after = await childPid(dir)
    const nodeAlive = after ? alive(after) : null
    rows.push(
      `${label} i=${i} delay=${delay} tkExit=${tk.status} tkMs=${ms} childPidBefore=${before} childPidAfter=${after} nodeAlive=${nodeAlive} stderr=${JSON.stringify((tk.stderr || '').trim()).slice(0, 300)} stdout=${JSON.stringify((tk.stdout || '').trim()).slice(0, 300)}`
    )
    if (after && alive(after)) {
      process.kill(after)
    }
  }
  console.log(rows.join('\n'))
}

async function barrier(label: string): Promise<void> {
  const rows: string[] = []
  for (let i = 0; i < 12; i++) {
    const { dir, cmd } = await fixture()
    const started = Date.now()
    const result = await runProcess({
      program: cmd,
      args: ['--version'],
      timeoutMs: [300, 1000, 3000][i % 3],
      terminationBarrier: true
    })
    const ms = Date.now() - started
    const pid = await childPid(dir)
    rows.push(
      `${label} barrier i=${i} timeout=${[300, 1000, 3000][i % 3]} elapsedMs=${ms} timedOut=${result.timedOut} code=${result.code} nodePid=${pid} nodeAlive=${pid ? alive(pid) : null}`
    )
    if (pid && alive(pid)) {
      process.kill(pid)
    }
  }
  console.log(rows.join('\n'))
}

describe.runIf(process.platform === 'win32')('diag taskkill', () => {
  it('idle', async () => {
    await pass('idle')
    await barrier('idle')
  }, 600_000)
  it('loaded', async () => {
    const load = burners(cpus().length * 2)
    try {
      await pass('loaded')
      await barrier('loaded')
    } finally {
      for (const b of load) b.kill()
    }
  }, 600_000)
})
