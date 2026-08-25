import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const baseURL = process.env.SMOKE_BASE_URL ?? `http://localhost:${PORT}`

// The smoke tier is one test per user journey and nothing else. It runs against
// the reduced-fidelity renderer (?forceWebGL=1) because WebGPU in headless
// browsers is unreliable; the compute path has its own opt-in project below,
// excluded from `npm run smoke`.
export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker in CI: a two-core runner with no GPU has two of these pages
  // fighting over the same software rasteriser, and each one is slower for it.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  // A CI runner boots this page several times slower than a developer machine —
  // no GPU, and every shader compiled on the CPU. The budget for the tier is
  // still 120 seconds; this is only the ceiling on one test before it is
  // declared hung.
  timeout: process.env.CI ? 90_000 : 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'smoke',
      grep: /@smoke/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // CI containers give Chromium a very small /dev/shm, and a page
          // holding a WebGL context fills it and takes the whole session down
          // with "Internal server error, session closed".
          args: ['--disable-dev-shm-usage'],
        },
      },
    },
    {
      // Opt-in only. Exercises the WebGPU compute ocean under SwiftShader; slow
      // by design and never part of the smoke budget.
      name: 'webgpu',
      grep: /@webgpu/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
