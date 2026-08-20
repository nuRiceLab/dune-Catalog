'use client'

/**
 * SearchProgress — a thin determinate progress bar shown while a MetaCat
 * search is in flight.
 *
 * The bar fills over `durationMs`, which is the request's timeout budget
 * (config.app.api.timeout). So its position is a genuine "time remaining
 * before this search gives up" indicator: a nearly-full bar means the query
 * is close to timing out, not merely "still spinning". When the search
 * settles (results arrive, it errors, or it is superseded/aborted) the bar
 * snaps to full and fades out.
 */

import { useEffect, useRef, useState } from 'react'

interface SearchProgressProps {
  /** True while a search request is in flight. */
  active: boolean
  /** Time (ms) before the request times out; the bar fills over this window. */
  durationMs: number
}

// While active, fill toward but never quite reach 100%, so a truly full bar
// unambiguously means "settled" rather than "still waiting".
const MAX_ACTIVE_PCT = 99
const TICK_MS = 100      // how often to advance the bar
const FADE_MS = 400      // how long the completed bar lingers before hiding

export function SearchProgress({ active, durationMs }: SearchProgressProps) {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  const startRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearTick = () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    }
    const clearHide = () => {
      if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null }
    }

    if (active) {
      // A new search started — begin (or restart) the fill from zero.
      clearHide()
      setVisible(true)
      setProgress(0)
      setElapsedMs(0)
      startRef.current = performance.now()
      clearTick()
      tickRef.current = setInterval(() => {
        const ms = performance.now() - startRef.current
        setElapsedMs(ms)
        setProgress(Math.min(MAX_ACTIVE_PCT, (ms / durationMs) * 100))
      }, TICK_MS)
      return clearTick
    }

    // Not active: the search has settled. Complete the bar, then fade it out.
    clearTick()
    setVisible((wasVisible) => {
      if (wasVisible) {
        setProgress(100)
        clearHide()
        hideRef.current = setTimeout(() => {
          setVisible(false)
          setProgress(0)
          setElapsedMs(0)
        }, FADE_MS)
      }
      return wasVisible
    })
    return clearHide
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, durationMs])

  if (!visible) return null

  const seconds = Math.floor(elapsedMs / 1000)

  return (
    <div className="w-full" role="status" aria-live="polite" aria-busy={active}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Searching MetaCat…</span>
        <span>{seconds}s</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
