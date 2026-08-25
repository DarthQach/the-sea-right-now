/**
 * Choosing a renderer, and being honest about which one is running.
 *
 * three.js's `WebGPURenderer` falls back to WebGL 2 on its own when WebGPU is
 * absent, and that covers the interface, the globe and the readout completely.
 * What it cannot carry across is the ocean: WebGL 2 has no compute shaders, so
 * the FFT cannot run there and a second implementation takes over. Everything
 * else — readout, spectrum plot, audio — is identical on both paths.
 */
import { WebGPURenderer } from 'three/webgpu'

export type Backend = 'webgpu' | 'webgl'

export interface RendererResult {
  renderer: WebGPURenderer
  backend: Backend
  /** True when WebGPU was available but the visitor asked for the reduced path. */
  forced: boolean
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  options: { forceWebGL: boolean },
): Promise<RendererResult> {
  const wantsWebGpu = !options.forceWebGL && webGpuAvailable()

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    forceWebGL: !wantsWebGpu,
    powerPreference: 'high-performance',
  })

  renderer.setClearColor(0x070d14, 1)
  await renderer.init()

  const backendIsWebGpu = 'isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend === true

  return {
    renderer,
    backend: backendIsWebGpu ? 'webgpu' : 'webgl',
    forced: options.forceWebGL && webGpuAvailable(),
  }
}

/**
 * Device pixel ratio, capped. Continuous rendering on a 3× display is the
 * fastest way to flatten a laptop battery, and the difference above 2× is not
 * visible on water.
 */
export function pixelRatioFor(devicePixelRatio: number, throttled: boolean): number {
  if (throttled) return 1
  return Math.min(2, Math.max(1, devicePixelRatio))
}
