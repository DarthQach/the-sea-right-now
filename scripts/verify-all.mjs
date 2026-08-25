// The full gate: verify -> smoke -> Worker tests -> production build.
// Sequential on purpose; each tier is cheap to re-enter and a failure in an
// early tier makes the later ones meaningless. Prints measured times because
// `verify` and `smoke` carry hard budgets (15s and 120s).
import { spawn } from 'node:child_process'

/**
 * The budgets are measured on a developer machine, which is the reference: it is
 * where these commands are run constantly and where being slow actually costs
 * something. A CI runner has two cores and no GPU, so every shader in the smoke
 * tier is compiled and rasterised on the CPU. The allowance below acknowledges
 * different hardware; it does not raise the budget, and the number reported as
 * "the" measurement is always the local one.
 */
const CI_ALLOWANCE = process.env.CI ? 3 : 1

const steps = [
  { name: 'verify', command: 'npm run verify', budgetSeconds: 15 },
  { name: 'smoke', command: 'npm run smoke', budgetSeconds: 120 },
  { name: 'worker tests', command: 'npm run test:worker' },
  { name: 'build', command: 'npm run build' },
]

/** @param {string} command */
function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: 'inherit' })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

const timings = []
for (const step of steps) {
  console.log(`\n── ${step.name} ──`)
  const started = Date.now()
  const code = await run(step.command)
  const seconds = (Date.now() - started) / 1000
  timings.push({ ...step, seconds })
  if (code !== 0) {
    console.error(`\n✗ ${step.name} failed after ${seconds.toFixed(1)}s`)
    process.exit(code)
  }
}

console.log('\n── timings ──')
let overBudget = false
for (const t of timings) {
  const allowed = t.budgetSeconds == null ? null : t.budgetSeconds * CI_ALLOWANCE
  const budget =
    allowed === null ? '' : ` (budget ${t.budgetSeconds}s${CI_ALLOWANCE > 1 ? `, ${allowed}s on CI hardware` : ''})`
  const over = allowed !== null && t.seconds > allowed
  if (over) overBudget = true
  console.log(`${over ? '✗' : '✓'} ${t.name}: ${t.seconds.toFixed(1)}s${budget}`)
}
if (overBudget) {
  console.error('\nA budget was exceeded. That is a defect: parallelize, move the test down a layer, or delete a duplicate. Never raise the budget.')
  process.exit(1)
}
console.log('\nverify:all passed')
