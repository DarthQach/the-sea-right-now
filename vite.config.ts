import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    target: 'es2022',
    // three.js's WebGPU build plus the bundled station index. Both are needed on
    // first paint — the point of the snapshot is that the globe draws without a
    // network round trip — so there is nothing worth splitting out.
    chunkSizeWarningLimit: 1600,
  },
})
