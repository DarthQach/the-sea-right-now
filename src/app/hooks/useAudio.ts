import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpectrumParams } from '../../lib/spectrum'
import { SeaAudio } from '../../audio/graph'
import type { AudioMode } from '../../lib/url-state'

export interface AudioState {
  playing: boolean
  mode: AudioMode
  volume: number
  muted: boolean
  /** The AudioContext's own state, or null before a gesture has created one. */
  contextState: string | null
  /** RMS of the output. Proof that sound is being made, not just wired up. */
  level: number
}

/**
 * The audio graph, held for the life of the view.
 *
 * No `AudioContext` exists until the visitor clicks: browsers will not allow
 * sound without a gesture, and the product should not want to.
 */
export function useAudio(
  params: SpectrumParams | null,
  initial: { mode: AudioMode; volume: number; muted: boolean },
): {
  state: AudioState
  toggle: () => void
  setMode: (mode: AudioMode) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
} {
  const audioRef = useRef<SeaAudio | null>(null)
  if (audioRef.current === null) audioRef.current = new SeaAudio()
  const audio = audioRef.current

  const [state, setState] = useState<AudioState>({
    playing: false,
    mode: initial.mode,
    volume: initial.volume,
    muted: initial.muted,
    contextState: null,
    level: 0,
  })

  useEffect(() => {
    if (params !== null) audio.setParams(params)
  }, [audio, params])

  useEffect(() => () => audio.dispose(), [audio])

  const publish = useCallback(() => {
    const next = audio.state
    setState({
      playing: next.running,
      mode: next.mode,
      volume: next.volume,
      muted: next.muted,
      contextState: next.contextState,
      level: next.level,
    })
  }, [audio])

  // The level is the only thing here that changes continuously. Sampling it a
  // few times a second keeps it honest without re-rendering the interface on
  // every frame.
  useEffect(() => {
    if (!state.playing) return
    const timer = setInterval(publish, 400)
    return () => clearInterval(timer)
  }, [state.playing, publish])

  const toggle = useCallback(() => {
    if (audio.isPlaying) {
      audio.stop()
      publish()
      return
    }
    void audio.start(state.mode, state.volume, state.muted).then(publish)
  }, [audio, publish, state.mode, state.volume, state.muted])

  const setMode = useCallback(
    (mode: AudioMode) => {
      audio.setMode(mode)
      setState((current) => ({ ...current, mode }))
    },
    [audio],
  )

  const setVolume = useCallback(
    (volume: number) => {
      audio.setVolume(volume)
      setState((current) => ({ ...current, volume }))
    },
    [audio],
  )

  const setMuted = useCallback(
    (muted: boolean) => {
      audio.setMuted(muted)
      setState((current) => ({ ...current, muted }))
    },
    [audio],
  )

  return { state, toggle, setMode, setVolume, setMuted }
}
