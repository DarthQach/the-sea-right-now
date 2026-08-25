/**
 * WebKit's Audio Session API, which no other engine implements and which
 * `lib.dom` therefore does not declare.
 *
 * It is the only way to tell iOS that what this page plays is media rather than
 * ambience. Without it, synthesised Web Audio — which is all this page has, since
 * nothing here is a recording — is silenced by the Ring/Silent switch and follows
 * the ringer volume instead of the media volume. See `src/audio/graph.ts`.
 *
 * Declared optional on purpose: every browser that lacks it must read as absent
 * rather than as present-and-broken.
 */
type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

interface AudioSession {
  type: AudioSessionType
}

interface Navigator {
  readonly audioSession?: AudioSession
}
