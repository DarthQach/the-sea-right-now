import { useEffect, useRef } from 'react'
import type { SpectrumParams } from '../../lib/spectrum'
import { SceneHost } from '../../scene/SceneHost'
import { SeaWorld } from '../../scene/SeaWorld'
import type { Backend } from '../../scene/renderer'

export interface SceneCanvasProps {
  params: SpectrumParams | null
  motionScale: number
  forceWebGL: boolean
  /** Incremented by the reset control; any change returns the camera to the default framing. */
  resetSignal: number
  /** Set by the visitor or by a query parameter, independently of tab focus and battery. */
  forceThrottled: boolean
  onBackend?: (backend: Backend, forced: boolean) => void
  onThrottleChange?: (throttled: boolean) => void
  onError?: (error: unknown) => void
}

/**
 * Mounts the ocean.
 *
 * The renderer, the world and the frame loop all live outside React — React
 * owns the interface, the scene owns the water, and this component is the seam
 * between them.
 *
 * The canvas element is created inside the effect rather than rendered by React
 * on purpose. A canvas hands out exactly one graphics context in its lifetime,
 * so when StrictMode mounts, tears down and remounts the effect, a React-owned
 * canvas would be handed to the second renderer already dead — which shows up as
 * a white frame and a "WebGL device lost" on the fallback path. Each effect run
 * gets its own canvas and takes it away again on cleanup.
 */
export function SceneCanvas(props: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SceneHost | null>(null)
  const worldRef = useRef<SeaWorld | null>(null)

  // Kept in a ref so the scene effect does not tear down and rebuild the GPU
  // context every time a reading arrives.
  const callbacks = useRef(props)
  useEffect(() => {
    callbacks.current = props
  })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const canvas = document.createElement('canvas')
    canvas.className = 'scene-canvas'
    canvas.dataset.testid = 'scene-canvas'
    container.append(canvas)

    let cancelled = false

    const start = async () => {
      try {
        const host = await SceneHost.create({
          canvas,
          forceWebGL: props.forceWebGL,
          onThrottleChange: (throttled) => callbacks.current.onThrottleChange?.(throttled),
        })
        if (cancelled) {
          host.dispose()
          return
        }

        const world = new SeaWorld({
          renderer: host.renderer,
          backend: host.backend,
          element: canvas,
          aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
        })

        hostRef.current = host
        worldRef.current = world
        host.setWorld(world)
        host.start()

        callbacks.current.onBackend?.(host.backend, host.forcedWebGL)
        if (callbacks.current.params !== null) world.setParams(callbacks.current.params)
        world.setMotionScale(callbacks.current.motionScale)

        // The host is created asynchronously, so anything that happened before
        // it existed — a hidden tab, a requested throttle — has to be applied
        // now rather than waiting for the next change.
        host.setThrottleReason('hidden', document.hidden)
        host.setThrottleReason('requested', callbacks.current.forceThrottled)
      } catch (error) {
        if (!cancelled) callbacks.current.onError?.(error)
      }
    }

    void start()

    const observer = new ResizeObserver(() => hostRef.current?.resize())
    observer.observe(canvas)

    return () => {
      cancelled = true
      observer.disconnect()
      hostRef.current?.dispose()
      hostRef.current = null
      worldRef.current = null
      canvas.remove()
    }
    // The GPU context is built once. Changing the renderer path means rebuilding
    // it, which is what changing ?forceWebGL asks for.
  }, [props.forceWebGL])

  useEffect(() => {
    if (props.params !== null) worldRef.current?.setParams(props.params)
  }, [props.params])

  useEffect(() => {
    worldRef.current?.setMotionScale(props.motionScale)
  }, [props.motionScale])

  useEffect(() => {
    if (props.resetSignal > 0) worldRef.current?.resetCamera()
  }, [props.resetSignal])

  useEffect(() => {
    hostRef.current?.setThrottleReason('requested', props.forceThrottled)
  }, [props.forceThrottled])

  // Throttle hard when the tab is hidden. Continuous GPU rendering is what
  // flattens a laptop battery, so this is a requirement rather than a polish.
  useEffect(() => {
    const onVisibility = () => hostRef.current?.setThrottleReason('hidden', document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return <div ref={containerRef} className="scene-canvas-host" />
}
