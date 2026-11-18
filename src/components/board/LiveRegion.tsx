/**
 * A polite, visually hidden live region plus a throttled way to speak into it
 * (see createAnnouncer). One per surface: the board and the call each own one.
 */

import { useEffect, useState } from 'react'
import { createAnnouncer, type Announcer } from './announce'

export function useAnnouncer(gapMs = 1000): { message: string; say: Announcer['say'] } {
  const [message, setMessage] = useState('')
  const [announcer] = useState(() => {
    // Screen readers skip a region whose text didn't change; alternate an
    // invisible trailing space so "Moved" twice is still spoken twice.
    let flip = false
    return createAnnouncer((text) => {
      flip = !flip
      setMessage(flip ? text : `${text} `)
    }, gapMs)
  })
  useEffect(() => () => announcer.dispose(), [announcer])
  return { message, say: announcer.say }
}

export function LiveRegion({ message, testId }: { message: string; testId?: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-testid={testId} className="sr-only">
      {message}
    </div>
  )
}
