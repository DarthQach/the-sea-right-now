/**
 * About and attribution.
 *
 * Two short paragraphs, the NOAA credit, the plain-language note that "now"
 * means "the most recent measurement", and a link out to the source. No team
 * page, no logos, nothing to sign up for.
 */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="panel about-panel" data-testid="about-panel" aria-label="About">
      <div className="settings-panel__head">
        <h2 className="settings-panel__title">The Sea, Right Now</h2>
        <button
          type="button"
          className="control control--icon"
          onClick={onClose}
          aria-label="Close about"
          data-testid="about-close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className="about-panel__body">
        Every wave here is computed from a measurement a real buoy took, not from
        a video or a loop. Pick a station and the page builds a wave spectrum from
        the height, period and direction it is reporting, then renders that
        spectrum as water on your own graphics card and synthesises the sound of
        it from the same numbers.
      </p>

      <p className="about-panel__body">
        The measurements come from the National Data Buoy Center, operated by the
        United States National Oceanic and Atmospheric Administration. It is a US
        network, so it covers American coasts, the Great Lakes, Hawaii, Alaska and
        the Caribbean densely and most other coastlines not at all.
      </p>

      <p className="about-panel__body about-panel__note">
        Buoys report roughly once an hour, most of them a little after the half
        hour. So “now” here means “the most recent measurement that reached us”,
        and the age beside every station name says how recent that is. Nothing on
        this page is a forecast.
      </p>

      <p className="about-panel__body">
        Data:{' '}
        <a href="https://www.ndbc.noaa.gov/" target="_blank" rel="noreferrer noopener">
          NOAA National Data Buoy Center
        </a>
        . Coastlines: Natural Earth, public domain. No accounts, no analytics, no
        cookies — your favourites and settings never leave this browser.
      </p>
    </aside>
  )
}
