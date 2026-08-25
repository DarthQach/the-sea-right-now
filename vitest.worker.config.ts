import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Worker handler tests run inside the real workerd runtime, against the same
// wrangler.jsonc the deployment uses.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'worker',
    include: ['tests/worker/**/*.test.ts'],
    passWithNoTests: true,
  },
})
