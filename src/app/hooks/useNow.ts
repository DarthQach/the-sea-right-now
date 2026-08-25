import { useEffect, useState } from 'react'

/**
 * A clock that ticks slowly.
 *
 * The reading age is the honesty element on this page, so it has to keep
 * counting up even when nothing else changes — but readings are hourly, so a
 * fifteen-second tick is more than fine and costs nothing.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
