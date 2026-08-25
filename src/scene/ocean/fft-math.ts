/**
 * The pieces of the FFT ocean that are pure arithmetic, kept out of the GPU code
 * so they can be checked without a GPU.
 *
 * The technique is the published one: Tessendorf's "Simulating Ocean Water" for
 * the inverse-FFT height field, a JONSWAP spectrum with the Kitaigorodskii depth
 * correction, and a Horvath-style directional spread. The `poseidon` repository
 * is an excellent reference for this and worth reading, but it declares no
 * licence, so nothing here is copied from it.
 */

/** Grid resolution per cascade. 256 is the usual compromise between detail and dispatch cost. */
export const FFT_SIZE = 256
export const FFT_STEPS = Math.log2(FFT_SIZE)
export const CASCADE_COUNT = 3

/**
 * The sea repeats after this long. Quantising every wave's angular frequency to
 * a multiple of 2π/T makes the whole surface periodic, which stops the fine
 * cascades from drifting out of phase with the swell over a long session.
 */
export const LOOP_PERIOD_SECONDS = 240

/**
 * Where one cascade hands over to the next, in radians per metre. Each cascade
 * only carries the wavenumbers its patch size can represent well, so the three
 * do not overlap and no band is counted twice.
 */
export function cascadeBounds(boundaryWavelengthsM: number[], cascades = CASCADE_COUNT): { low: number; high: number }[] {
  const bounds: { low: number; high: number }[] = []
  for (let i = 0; i < cascades; i += 1) {
    // Long wavelengths are small wavenumbers, so the bands run the other way
    // round: cascade 0 takes everything longer than the first boundary.
    const shorterEdge = boundaryWavelengthsM[i]
    const longerEdge = boundaryWavelengthsM[i - 1]
    bounds.push({
      low: longerEdge === undefined ? 0 : (2 * Math.PI) / longerEdge,
      high: shorterEdge === undefined ? Number.POSITIVE_INFINITY : (2 * Math.PI) / shorterEdge,
    })
  }
  return bounds
}

/**
 * The shortest wavelength a cascade actually carries. The surface fades a
 * cascade out where the mesh's vertex spacing can no longer resolve this, which
 * is what stops distant water from breaking into spikes.
 */
export function cascadeShortestWavelength(boundaryWavelengthsM: number[], index: number, patchSizeM: number): number {
  const boundary = boundaryWavelengthsM[index]
  if (boundary !== undefined) return boundary
  return (2 * patchSizeM) / FFT_SIZE
}

/**
 * The butterfly table for a Cooley–Tukey radix-2 inverse FFT: one entry per
 * (step, index) giving the twiddle factor and the two elements to combine.
 * Precomputed once on the CPU because it never changes.
 */
export function buildButterflyTable(size: number): Float32Array {
  const steps = Math.log2(size)
  const table = new Float32Array(steps * size * 4)
  const reversed = bitReversedIndices(size)

  for (let step = 0; step < steps; step += 1) {
    for (let index = 0; index < size; index += 1) {
      const span = 2 ** step
      const k = ((index * size) / (span * 2)) % size
      // Positive angle: this is the inverse transform, with no 1/N in front.
      // The twiddle for the lower wing comes out negated on its own, because k
      // there lands half a turn further round — it must not also be conjugated.
      const angle = (2 * Math.PI * k) / size
      const twiddleReal = Math.cos(angle)
      const twiddleImaginary = Math.sin(angle)

      const topWing = index % (span * 2) < span
      let a: number
      let b: number

      if (step === 0) {
        // The first step also undoes the bit reversal, so no separate pass is needed.
        a = topWing ? (reversed[index] ?? 0) : (reversed[index - span] ?? 0)
        b = topWing ? (reversed[index + span] ?? 0) : (reversed[index] ?? 0)
      } else {
        a = topWing ? index : index - span
        b = topWing ? index + span : index
      }

      const offset = (step * size + index) * 4
      table[offset] = twiddleReal
      table[offset + 1] = twiddleImaginary
      table[offset + 2] = a
      table[offset + 3] = b
    }
  }

  return table
}

export function bitReversedIndices(size: number): Uint32Array {
  const bits = Math.log2(size)
  const out = new Uint32Array(size)
  for (let i = 0; i < size; i += 1) {
    let value = 0
    for (let bit = 0; bit < bits; bit += 1) {
      if ((i >> bit) & 1) value |= 1 << (bits - 1 - bit)
    }
    out[i] = value
  }
  return out
}
