/**
 * Telling iOS that this page plays media, not ambience.
 *
 * Everything here is synthesised — nothing is downloaded and nothing is a
 * recording — and WebKit files a page that plays nothing but Web Audio under the
 * *ambient* audio session category. Ambient audio is silenced outright by the
 * Ring/Silent switch, and when it does play it follows the ringer volume rather
 * than the media volume. So an iPhone got a working graph, a running context, a
 * moving level meter and no sound, with nothing on screen to explain why. A page
 * playing a recording would have been given `playback` for free; this one has to
 * ask.
 *
 * Nothing else implements the Audio Session API, and nothing else needs to: the
 * default is already right everywhere but WebKit.
 */
export function claimMediaAudioSession(): void {
  const session = navigator.audioSession
  if (session === undefined) return
  // Not fatal if it is refused. Silence is the bug; a thrown error on the click
  // that starts the sound would be a worse one.
  try {
    session.type = 'playback'
  } catch {
    /* An engine that has the property but will not take the value. */
  }
}

/**
 * Ask again whenever the page comes back to the front.
 *
 * iOS can reset an audio session across an interruption — a phone call, or a
 * long stretch backgrounded — and a reset drops the page back to ambience, where
 * the Ring/Silent switch silences it all over again. Returning to the foreground
 * is the moment the page is known to be audible again, and the cheapest place to
 * claim the category a second time.
 *
 * `isActive` is asked at fire time rather than captured, so a page that comes
 * back with the sound stopped does not claim a media session it is not using.
 *
 * Returns the function that stops watching.
 */
export function watchAudioSession(isActive: () => boolean): () => void {
  const onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return
    if (!isActive()) return
    claimMediaAudioSession()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}
