import { useEffect, useRef, useState } from 'react'
import type { SpectrumParams } from '../../lib/spectrum'
import type { Station } from '../../lib/shared/types'
import type { StationStatus } from '../../lib/station-status'
import { SceneHost } from '../../scene/SceneHost'
import { SeaWorld } from '../../scene/SeaWorld'
import { GlobeWorld } from '../../scene/GlobeWorld'
import type { Backend } from '../../scene/renderer'

export type StageMode = 'sea' | 'globe'

export interface SceneStageProps {
  mode: StageMode
  forceWebGL: boolean
  forceThrottled: boolean
  motionScale: number
  /** Incremented by the reset control; any change returns the sea camera to the default framing. */
  resetSignal: number

  params: SpectrumParams | null

  stations: Station[]
  statusOf: (station: Station) => StationStatus
  /** Bump to recolour the pins after a station's real reading age becomes known. */
  pinRevision?: number
  /** The station to frame when the globe first appears. */
  focusStation?: Station | undefined
  onHoverStation?: (station: Station | null, screen: { x: number; y: number } | null) => void
  onSelectStation?: (station: Station) => void

  onBackend?: (backend: Backend, forced: boolean) => void
  onThrottleChange?: (throttled: boolean) => void
  onError?: (error: unknown) => void
}

/**
 * One canvas, one GPU context, two worlds.
 *
 * The sea and the globe are both three.js scenes and swapping between them costs
 * nothing; building a second renderer for the second view would cost a fresh GPU
 * context every time someone went back to the map.
 *
 * The canvas element is created inside the effect rather than rendered by React
 * on purpose. A canvas hands out exactly one graphics context in its lifetime,
 * so when StrictMode mounts, tears down and remounts the effect, a React-owned
 * canvas would be handed to the second renderer already dead — which shows up as
 * a white frame and a "WebGL device lost" on the fallback path.
 */
export function SceneStage(props: SceneStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SceneHost | null>(null)
  const seaRef = useRef<SeaWorld | null>(null)
  const globeRef = useRef<GlobeWorld | null>(null)
  const [ready, setReady] = useState(false)

  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const canvas = document.createElement('canvas')
    canvas.className = 'scene-canvas'
    canvas.dataset.testid = 'scene-canvas'
    canvas.tabIndex = 0
    container.append(canvas)

    let cancelled = false

    const start = async () => {
      try {
        const host = await SceneHost.create({
          canvas,
          forceWebGL: props.forceWebGL,
          onThrottleChange: (throttled) => latest.current.onThrottleChange?.(throttled),
        })
        if (cancelled) {
          host.dispose()
          return
        }
        hostRef.current = host
        host.start()
        latest.current.onBackend?.(host.backend, host.forcedWebGL)

        // The host exists only now, so anything that happened before it did — a
        // hidden tab, a requested throttle — has to be applied rather than
        // waited for.
        host.setThrottleReason('hidden', document.hidden)
        host.setThrottleReason('requested', latest.current.forceThrottled)
        if (!cancelled) setReady(true)
      } catch (error) {
        if (!cancelled) latest.current.onError?.(error)
      }
    }

    void start()

    const observer = new ResizeObserver(() => hostRef.current?.resize())
    observer.observe(canvas)

    return () => {
      cancelled = true
      setReady(false)
      observer.disconnect()
      seaRef.current?.dispose()
      globeRef.current?.dispose()
      seaRef.current = null
      globeRef.current = null
      hostRef.current?.dispose()
      hostRef.current = null
      canvas.remove()
    }
  }, [props.forceWebGL])

  // Build and swap worlds. Both stay alive once made, so going back to the map
  // and back to the water again is instant.
  useEffect(() => {
    const host = hostRef.current
    const canvas = containerRef.current?.querySelector('canvas')
    if (!ready || host === null || !canvas) return

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)

    if (props.mode === 'sea') {
      if (seaRef.current === null) {
        seaRef.current = new SeaWorld({ renderer: host.renderer, backend: host.backend, element: canvas, aspect })
        if (latest.current.params !== null) seaRef.current.setParams(latest.current.params)
        seaRef.current.setMotionScale(latest.current.motionScale)
      }
      host.setWorld(seaRef.current)
      return
    }

    if (globeRef.current === null && props.stations.length > 0) {
      globeRef.current = new GlobeWorld({
        renderer: host.renderer,
        element: canvas,
        aspect,
        stations: props.stations,
        statusOf: (station) => latest.current.statusOf(station),
        onHover: (station, screen) => latest.current.onHoverStation?.(station, screen),
        onSelect: (station) => latest.current.onSelectStation?.(station),
      })
      if (props.focusStation !== undefined) globeRef.current.focusOn(props.focusStation)
    }
    if (globeRef.current !== null) host.setWorld(globeRef.current)
  }, [ready, props.mode, props.stations, props.focusStation])

  useEffect(() => {
    globeRef.current?.refreshPins(latest.current.statusOf)
  }, [props.pinRevision])

  useEffect(() => {
    if (props.params !== null) seaRef.current?.setParams(props.params)
  }, [props.params])

  useEffect(() => {
    seaRef.current?.setMotionScale(props.motionScale)
  }, [props.motionScale])

  useEffect(() => {
    if (props.resetSignal > 0) seaRef.current?.resetCamera()
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
