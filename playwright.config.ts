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
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
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
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Opt-in only. Exercises the WebGPU compute ocean under SwiftShader; slow
      // by design and never part of the smoke budget.
      name: 'webgpu',
      grep: /@webgpu/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'],
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
