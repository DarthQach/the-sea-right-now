import { useEffect, useState } from 'react'

interface BatteryLike {
  charging: boolean
  addEventListener(type: 'chargingchange', listener: () => void): void
  removeEventListener(type: 'chargingchange', listener: () => void): void
}

/**
 * Whether the machine is running on its battery.
 *
 * The Battery Status API is not available everywhere — Firefox and Safari do not
 * expose it at all — so this reports `false` where it cannot tell, and the
 * visibility throttle carries the load on those browsers.
 */
export function useOnBattery(): boolean {
  const [onBattery, setOnBattery] = useState(false)

  useEffect(() => {
    const navigatorWithBattery = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }
    if (typeof navigatorWithBattery.getBattery !== 'function') return

    let battery: BatteryLike | null = null
    let cancelled = false
    const onChange = () => setOnBattery(battery !== null && !battery.charging)

    void navigatorWithBattery
      .getBattery()
      .then((result) => {
        if (cancelled) return
        battery = result
        battery.addEventListener('chargingchange', onChange)
        onChange()
      })
      .catch(() => {
        // Some browsers expose the method and then refuse. Nothing to do.
      })

    return () => {
      cancelled = true
      battery?.removeEventListener('chargingchange', onChange)
    }
  }, [])

  return onBattery
}
