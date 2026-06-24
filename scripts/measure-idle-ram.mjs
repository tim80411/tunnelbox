#!/usr/bin/env node
// scripts/measure-idle-ram.mjs
//
// TIM-223 — Idle RAM measurement baseline.
//
// Measures the resident memory (RSS) of the TunnelBox Electron process tree
// (main + renderer + GPU/helper processes) after the app has been sitting idle.
// Emits a structured JSON result that can be compared against a committed
// baseline (`.project/baselines/idle-ram-baseline.json`) by CI.
//
// HOW IT WORKS
//   1. Launches the built/packaged Electron app (or, in --dev mode, electron-vite),
//      unless you pass --pid / --no-launch to attach to an already-running tree.
//   2. Waits `--idle` seconds (default 60) for things to settle.
//   3. Walks the process tree rooted at the Electron main PID and samples RSS
//      for every descendant via `ps`, bucketing by Electron process `--type`.
//   4. Writes a structured JSON report to stdout and/or `--out <file>`.
//
// IMPORTANT (handback): a *real* RSS capture needs the actual built Electron app
// running on a dev machine / CI runner with a display. In a headless or
// app-less environment this script cannot produce real numbers — use
// `--self-test` to validate the script logic and JSON schema without launching
// the app, and `--help` to print usage.
//
// Run from the project root:
//   pnpm measure:ram                 # launch packaged app, idle 60s, sample
//   pnpm measure:ram -- --idle 30    # shorter idle
//   pnpm measure:ram -- --pid 12345  # attach to a running Electron tree
//   pnpm measure:ram -- --self-test  # no launch; emit a schema-valid sample
//   pnpm measure:ram -- --compare    # also compare against the baseline JSON
//
// Exit codes:
//   0  success (and, with --compare, within the growth threshold)
//   1  measurement failure / could not launch or find the process tree
//   2  with --compare: RSS growth exceeded the threshold (CI guard trip)

import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DEFAULT_BASELINE = resolve(ROOT, '.project/baselines/idle-ram-baseline.json')

const SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    idle: 60,
    pid: null,
    launch: true,
    dev: false,
    selfTest: false,
    compare: false,
    threshold: 20, // percent RSS growth that trips the guard
    out: null,
    baseline: DEFAULT_BASELINE,
    help: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--help':
      case '-h':
        args.help = true
        break
      case '--idle':
        args.idle = Number(argv[++i])
        break
      case '--pid':
        args.pid = Number(argv[++i])
        args.launch = false
        break
      case '--no-launch':
        args.launch = false
        break
      case '--dev':
        args.dev = true
        break
      case '--self-test':
        args.selfTest = true
        args.launch = false
        break
      case '--compare':
        args.compare = true
        break
      case '--threshold':
        args.threshold = Number(argv[++i])
        break
      case '--out':
        args.out = argv[++i]
        break
      case '--baseline':
        args.baseline = resolve(argv[++i])
        break
      default:
        console.error(`Unknown argument: ${a}`)
        args.help = true
    }
  }
  return args
}

function printHelp() {
  console.log(`measure-idle-ram — TIM-223 idle RAM baseline sampler

Usage:
  node scripts/measure-idle-ram.mjs [options]

Options:
  --idle <seconds>     Idle settle time before sampling (default: 60)
  --pid <pid>          Attach to an already-running Electron main PID (implies --no-launch)
  --no-launch          Do not launch the app; sample the current tree only
  --dev                Launch via electron-vite dev instead of the packaged binary
  --self-test          Do not launch anything; emit a schema-valid placeholder sample
  --compare            Compare the sample against the baseline and trip on >threshold growth
  --threshold <pct>    Growth percentage that trips --compare (default: 20)
  --out <file>         Also write the JSON report to <file>
  --baseline <file>    Baseline JSON path (default: .project/baselines/idle-ram-baseline.json)
  -h, --help           Show this help

Exit codes: 0 ok | 1 measurement failure | 2 (--compare) growth exceeded threshold
`)
}

// ---------------------------------------------------------------------------
// Process-tree RSS sampling via ps
// ---------------------------------------------------------------------------

// Returns an array of { pid, ppid, rss (KB), command } for every process.
function snapshotProcesses() {
  // -A all processes; -o explicit columns; rss is in KB on macOS & Linux.
  // comm gives the bare executable; args/command gives the full command line
  // (needed to read Electron's --type=renderer / --type=gpu-process flags).
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,command='], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
  const procs = []
  for (const line of out.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    procs.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      rss: Number(m[3]), // KB
      command: m[4]
    })
  }
  return procs
}

function collectTree(rootPid, procs) {
  const byParent = new Map()
  for (const p of procs) {
    if (!byParent.has(p.ppid)) byParent.set(p.ppid, [])
    byParent.get(p.ppid).push(p)
  }
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const result = []
  const seen = new Set()
  const stack = [rootPid]
  while (stack.length) {
    const pid = stack.pop()
    if (seen.has(pid)) continue
    seen.add(pid)
    const self = byPid.get(pid)
    if (self) result.push(self)
    for (const child of byParent.get(pid) ?? []) stack.push(child.pid)
  }
  return result
}

// Classify an Electron process by its --type= flag (renderer / gpu-process /
// utility / zygote). The main process has no --type.
function classify(command) {
  const m = command.match(/--type=([a-zA-Z-]+)/)
  if (m) return m[1]
  return 'main'
}

function summarize(treeProcs) {
  const buckets = {}
  let totalRssKB = 0
  for (const p of treeProcs) {
    const type = classify(p.command)
    if (!buckets[type]) buckets[type] = { count: 0, rssKB: 0 }
    buckets[type].count += 1
    buckets[type].rssKB += p.rss
    totalRssKB += p.rss
  }
  return { totalRssKB, buckets, processCount: treeProcs.length }
}

function buildReport(summary, meta) {
  const toMB = (kb) => Math.round((kb / 1024) * 10) / 10
  const byType = {}
  for (const [type, b] of Object.entries(summary.buckets)) {
    byType[type] = { count: b.count, rssMB: toMB(b.rssKB) }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    placeholder: meta.placeholder ?? false,
    note: meta.note ?? null,
    env: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024)
    },
    idleSeconds: meta.idleSeconds ?? null,
    rootPid: meta.rootPid ?? null,
    totalRssMB: toMB(summary.totalRssKB),
    processCount: summary.processCount,
    byType
  }
}

// ---------------------------------------------------------------------------
// App launch
// ---------------------------------------------------------------------------

function findPackagedBinary() {
  // electron-builder --dir output lives under dist/. Try common locations.
  const candidates = []
  if (process.platform === 'darwin') {
    candidates.push(
      resolve(ROOT, 'dist/mac-universal/TunnelBox.app/Contents/MacOS/TunnelBox'),
      resolve(ROOT, 'dist/mac-arm64/TunnelBox.app/Contents/MacOS/TunnelBox'),
      resolve(ROOT, 'dist/mac/TunnelBox.app/Contents/MacOS/TunnelBox')
    )
  } else if (process.platform === 'linux') {
    candidates.push(resolve(ROOT, 'dist/linux-unpacked/tunnelbox'))
  } else if (process.platform === 'win32') {
    candidates.push(resolve(ROOT, 'dist/win-unpacked/TunnelBox.exe'))
  }
  return candidates.find((c) => existsSync(c)) ?? null
}

function launchApp(dev) {
  if (dev) {
    // electron-vite dev — spawns electron internally; root pid is the npx/pnpm child.
    const child = spawn('pnpm', ['dev'], { cwd: ROOT, stdio: 'ignore', detached: false })
    return { child, rootPid: child.pid }
  }
  const bin = findPackagedBinary()
  if (!bin) {
    throw new Error(
      'No packaged Electron binary found under dist/. Run `pnpm pack` (electron-builder --dir) first, ' +
        'or pass --pid to attach to a running app, or --dev to launch via electron-vite.'
    )
  }
  const child = spawn(bin, [], { stdio: 'ignore', detached: false })
  return { child, rootPid: child.pid }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Compare against baseline
// ---------------------------------------------------------------------------

function compareAgainstBaseline(report, baselinePath, thresholdPct) {
  if (!existsSync(baselinePath)) {
    return { ok: true, skipped: true, reason: `baseline not found at ${baselinePath}` }
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const baseTotal = baseline.totalRssMB
  if (typeof baseTotal !== 'number' || baseTotal <= 0 || baseline.placeholder) {
    return {
      ok: true,
      skipped: true,
      reason: baseline.placeholder
        ? 'baseline is a placeholder (no real numbers captured yet) — skipping guard'
        : `baseline has no usable totalRssMB`
    }
  }
  const current = report.totalRssMB
  const growthPct = ((current - baseTotal) / baseTotal) * 100
  const ok = growthPct <= thresholdPct
  return {
    ok,
    skipped: false,
    baselineTotalRssMB: baseTotal,
    currentTotalRssMB: current,
    growthPct: Math.round(growthPct * 10) / 10,
    thresholdPct
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  // --self-test: validate logic + schema without launching the app.
  if (args.selfTest) {
    // Sample THIS node process tree just to exercise the ps + tree-walk path,
    // then mark the report as a placeholder so --compare never trips on it.
    const procs = snapshotProcesses()
    const tree = collectTree(process.pid, procs)
    const summary = summarize(tree)
    const report = buildReport(summary, {
      placeholder: true,
      note: 'self-test sample of the measurement harness (NOT the Electron app) — schema check only',
      idleSeconds: 0,
      rootPid: process.pid
    })
    emit(report, args)
    console.error('[self-test] OK — ps sampling + tree walk + schema build all ran.')
    process.exit(0)
  }

  let child = null
  let rootPid = args.pid

  try {
    if (args.launch) {
      const launched = launchApp(args.dev)
      child = launched.child
      rootPid = launched.rootPid
      console.error(`[measure] launched app, root pid=${rootPid}`)
    }

    if (!rootPid) {
      throw new Error('No root PID to sample. Pass --pid <pid> or allow launch.')
    }

    console.error(`[measure] idling ${args.idle}s before sampling…`)
    await sleep(args.idle * 1000)

    const procs = snapshotProcesses()
    const tree = collectTree(rootPid, procs)
    if (tree.length === 0) {
      throw new Error(`No processes found in tree rooted at pid=${rootPid}. Did the app exit?`)
    }
    const summary = summarize(tree)
    const report = buildReport(summary, {
      placeholder: false,
      note: null,
      idleSeconds: args.idle,
      rootPid
    })

    emit(report, args)

    if (args.compare) {
      const cmp = compareAgainstBaseline(report, args.baseline, args.threshold)
      if (cmp.skipped) {
        console.error(`[compare] skipped: ${cmp.reason}`)
      } else if (cmp.ok) {
        console.error(
          `[compare] OK — current ${cmp.currentTotalRssMB}MB vs baseline ${cmp.baselineTotalRssMB}MB ` +
            `(+${cmp.growthPct}%, threshold ${cmp.thresholdPct}%)`
        )
      } else {
        console.error(
          `[compare] FAIL — current ${cmp.currentTotalRssMB}MB vs baseline ${cmp.baselineTotalRssMB}MB ` +
            `(+${cmp.growthPct}% > threshold ${cmp.thresholdPct}%)`
        )
        cleanup(child)
        process.exit(2)
      }
    }
  } catch (err) {
    console.error('[measure] error:', err instanceof Error ? err.message : err)
    cleanup(child)
    process.exit(1)
  }

  cleanup(child)
  process.exit(0)
}

function emit(report, args) {
  const json = JSON.stringify(report, null, 2)
  process.stdout.write(json + '\n')
  if (args.out) {
    const outPath = resolve(args.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, json + '\n')
    console.error(`[measure] wrote ${outPath}`)
  }
}

function cleanup(child) {
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM')
    } catch {
      // best effort
    }
  }
}

main()
