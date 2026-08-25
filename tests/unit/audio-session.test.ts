import { afterEach, describe, expect, it } from 'vitest'
import { claimMediaAudioSession, watchAudioSession } from '../../src/audio/session'

/**
 * The iPhone bug this exists for: every sound on the page is synthesised, so
 * WebKit gave the page the *ambient* audio session category, and ambient audio is
 * silenced by the Ring/Silent switch however loud the phone is. The graph ran,
 * the level meter moved, and nobody heard the sea. Claiming `playback` is the
 * whole fix, so these check that it is claimed, and that asking does not break a
 * browser that has never heard of the API.
 */
const originalNavigator = globalThis.navigator
const originalDocument = (globalThis as { document?: unknown }).document

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true })
})

function stubNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true })
}

/** Just enough of `document` to fire one visibility change at will. */
function stubDocument(visibilityState: 'visible' | 'hidden') {
  const listeners = new Set<() => void>()
  const doc = {
    visibilityState,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') listeners.delete(listener)
    },
  }
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
  return {
    show: () => {
      doc.visibilityState = 'visible'
      for (const listener of listeners) listener()
    },
    hide: () => {
      doc.visibilityState = 'hidden'
      for (const listener of listeners) listener()
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

describe('claimMediaAudioSession', () => {
  it('claims the playback category, so the silent switch stops applying', () => {
    const session = { type: 'auto' }
    stubNavigator({ audioSession: session })

    claimMediaAudioSession()

    expect(session.type).toBe('playback')
  })

  it('does nothing on an engine without the API, rather than throwing on the click', () => {
    stubNavigator({})
    expect(() => claimMediaAudioSession()).not.toThrow()
  })

  it('survives an engine that refuses the value', () => {
    stubNavigator({
      audioSession: {
        set type(_value: string) {
          throw new TypeError('nope')
        },
        get type() {
          return 'auto'
        },
      },
    })

    expect(() => claimMediaAudioSession()).not.toThrow()
  })
})

describe('watchAudioSession', () => {
  it('claims the category again when a playing page returns to the foreground', () => {
    const session = { type: 'playback' }
    stubNavigator({ audioSession: session })
    const doc = stubDocument('visible')
    watchAudioSession(() => true)

    // What an interruption does to the session underneath a page still playing.
    session.type = 'ambient'
    doc.show()

    expect(session.type).toBe('playback')
  })

  it('leaves the session alone when the sound is not playing', () => {
    const session = { type: 'ambient' }
    stubNavigator({ audioSession: session })
    const doc = stubDocument('visible')
    watchAudioSession(() => false)

    doc.show()

    expect(session.type).toBe('ambient')
  })

  it('does not claim a session on the way out', () => {
    const session = { type: 'ambient' }
    stubNavigator({ audioSession: session })
    const doc = stubDocument('visible')
    watchAudioSession(() => true)

    doc.hide()

    expect(session.type).toBe('ambient')
  })

  it('stops watching when released, so a disposed graph leaves nothing behind', () => {
    const session = { type: 'ambient' }
    stubNavigator({ audioSession: session })
    const doc = stubDocument('visible')
    const release = watchAudioSession(() => true)

    release()
    expect(doc.listenerCount).toBe(0)

    doc.show()
    expect(session.type).toBe('ambient')
  })
})
