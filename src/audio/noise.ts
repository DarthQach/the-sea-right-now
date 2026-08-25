/**
 * Noise, made once and looped.
 *
 * Three seconds is long enough that the loop point is not audible under the
 * filtering the mappings put it through, and short enough to build instantly on
 * the click that starts the sound.
 */
const NOISE_SECONDS = 3

export function createNoiseBuffer(context: BaseAudioContext, seed = 1): AudioBuffer {
  const length = Math.floor(context.sampleRate * NOISE_SECONDS)
  const buffer = context.createBuffer(2, length, context.sampleRate)

  // A deterministic generator rather than Math.random, so the same reading
  // sounds the same on every visit.
  let state = seed >>> 0 || 1
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 0xffffffff) * 2 - 1
  }

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    // Brown-ish noise: integrating white noise tilts the spectrum downward,
    // which is much closer to the sound of water than flat white.
    let running = 0
    for (let i = 0; i < length; i += 1) {
      running = (running + next() * 0.04) * 0.995
      data[i] = running * 3.2
    }
  }

  return buffer
}

export function createLoopingNoise(context: AudioContext, seed = 1): AudioBufferSourceNode {
  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context, seed)
  source.loop = true
  source.start()
  return source
}
