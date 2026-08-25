// Runs several shell commands concurrently and exits non-zero if any fails.
// Output from each command is buffered and printed as it finishes, so parallel
// runs stay readable. Used by `npm run verify` to stay inside its 15s budget.
import { spawn } from 'node:child_process'

const commands = process.argv.slice(2)
if (commands.length === 0) {
  console.error('usage: node scripts/parallel.mjs "<cmd>" ["<cmd>" ...]')
  process.exit(2)
}

const started = Date.now()

/** @param {string} command */
function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ command, code: code ?? 1, out }))
  })
}

const results = await Promise.all(commands.map(run))
for (const r of results) {
  const mark = r.code === 0 ? '✓' : '✗'
  console.log(`\n${mark} ${r.command}`)
  const trimmed = r.out.trim()
  if (trimmed && r.code !== 0) console.log(trimmed)
}

const failed = results.filter((r) => r.code !== 0)
const seconds = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${failed.length === 0 ? 'all passed' : `${failed.length} failed`} in ${seconds}s`)
process.exit(failed.length === 0 ? 0 : 1)
