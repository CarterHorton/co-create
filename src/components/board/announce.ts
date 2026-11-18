/**
 * Screen-reader announcements for the board, kept quiet on purpose:
 *   - createAnnouncer   — at most one live-region update per `gapMs`; messages
 *                         that arrive meanwhile are merged, and a newer message
 *                         with the same key replaces the older one ("Moved" ×10
 *                         → one "Moved").
 *   - createCoalescer   — collects items for a window, then hands them over at once.
 *   - describeRemote    — "Alex added a sticky note" / "3 changes by collaborators".
 *   - createLocalLog    — remembers this browser's own edits, so the board can
 *                         tell them apart from collaborators' changes.
 *   - diffShapes        — what changed between two snapshots of the board.
 * No React or DOM here, so all of it is unit-tested with fake timers.
 */

import type { BoardShape } from './types'

export interface Announcer {
  /** Queue `text`; `key` (default: the text) dedupes against a pending message. */
  say: (text: string, key?: string) => void
  /** Drop anything pending (the announcer stays usable). */
  dispose: () => void
}

export function createAnnouncer(emit: (text: string) => void, gapMs = 1000): Announcer {
  let pending = new Map<string, string>()
  let lastEmit = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    if (!pending.size) return
    emit([...pending.values()].join('. '))
    pending = new Map()
    lastEmit = Date.now()
  }
  return {
    say(text, key = text) {
      if (!text) return
      pending.delete(key) // re-insert, so the latest message for a key is spoken last
      pending.set(key, text)
      if (timer) return
      // Even with no wait, defer: a burst of synchronous messages becomes one update.
      timer = setTimeout(flush, Math.max(0, lastEmit + gapMs - Date.now()))
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = new Map()
    },
  }
}

export interface Coalescer<T> {
  push: (item: T) => void
  dispose: () => void
}

/** The first item opens a `windowMs` window; when it closes, everything collected is flushed together. */
export function createCoalescer<T>(windowMs: number, flush: (items: T[]) => void): Coalescer<T> {
  let items: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    push(item) {
      items.push(item)
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const batch = items
        items = []
        if (batch.length) flush(batch)
      }, windowMs)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      items = []
    },
  }
}

export type RemoteAction = 'added' | 'deleted' | 'moved' | 'edited'

export interface RemoteChange {
  shapeId: string
  action: RemoteAction
  /** Shape type: sticky, box, text, arrow. */
  kind: string
  /** Display name of who made it, when known. */
  who: string | null
}

const KIND_PHRASE: Record<string, string> = {
  sticky: 'a sticky note',
  box: 'a box',
  text: 'a text label',
  arrow: 'an arrow',
}

/** One sentence for a batch of collaborators' changes; '' for none. */
export function describeRemote(changes: RemoteChange[]): string {
  // A remote drag arrives as many moves of one shape: count it once.
  const unique = [...new Map(changes.map((c) => [`${c.shapeId}:${c.action}`, c])).values()]
  if (!unique.length) return ''
  if (unique.length === 1) {
    const c = unique[0]
    return `${c.who ?? 'A collaborator'} ${c.action} ${KIND_PHRASE[c.kind] ?? 'a shape'}`
  }
  const names = new Set(unique.map((c) => c.who))
  const by = names.size === 1 && !names.has(null) ? [...names][0] : 'collaborators'
  return `${unique.length} changes by ${by}`
}

/** Identifies a shape this browser asked to create, before the server gives it an id. */
export function addSignature(s: Partial<Pick<BoardShape, 'type' | 'x' | 'y' | 'props'>>): string {
  if (s.type === 'arrow') return `arrow:${String(s.props?.from)}>${String(s.props?.to)}`
  return `${s.type}:${s.x},${s.y}`
}

export interface LocalLog {
  /** This browser edited (moved, resized, updated, deleted) this shape. */
  touch: (id: string) => void
  /** This browser asked to add a shape like this. */
  expectAdd: (shape: Partial<BoardShape>) => void
  /** Treat every change for `ms` as ours (undo / redo, whose effects we can't predict). */
  quiet: (ms: number) => void
  /** Was this newly arrived shape added by us? Consumes the matching expectation. */
  isOwnAdd: (shape: BoardShape) => boolean
  /** Did we change this shape recently? */
  isOwnEdit: (id: string) => boolean
}

export function createLocalLog(windowMs = 3000, now: () => number = Date.now): LocalLog {
  const touched = new Map<string, number>()
  let adds: { sig: string; at: number }[] = []
  let quietUntil = 0
  const fresh = (at: number) => now() - at <= windowMs
  return {
    touch(id) {
      touched.set(id, now())
    },
    expectAdd(shape) {
      adds = adds.filter((a) => fresh(a.at))
      adds.push({ sig: addSignature(shape), at: now() })
    },
    quiet(ms) {
      quietUntil = Math.max(quietUntil, now() + ms)
    },
    isOwnAdd(shape) {
      const sig = addSignature(shape)
      const i = adds.findIndex((a) => a.sig === sig && fresh(a.at))
      if (i >= 0) {
        adds.splice(i, 1)
        return true
      }
      return now() < quietUntil
    },
    isOwnEdit(id) {
      const at = touched.get(id)
      if (at !== undefined && fresh(at)) return true
      if (at !== undefined) touched.delete(id)
      return now() < quietUntil
    },
  }
}

export interface ShapeDiff {
  added: BoardShape[]
  removed: BoardShape[]
  changed: { shape: BoardShape; moved: boolean }[]
}

/** What changed from `prev` to `next`. Arrows "move" with their shapes, so only their own fields count. */
export function diffShapes(prev: Map<string, BoardShape>, next: BoardShape[]): ShapeDiff {
  const added: BoardShape[] = []
  const changed: ShapeDiff['changed'] = []
  const seen = new Set<string>()
  for (const s of next) {
    seen.add(s.id)
    const old = prev.get(s.id)
    if (!old) {
      added.push(s)
      continue
    }
    if (old === s) continue
    const moved = old.x !== s.x || old.y !== s.y
    const edited =
      old.width !== s.width || old.height !== s.height || JSON.stringify(old.props) !== JSON.stringify(s.props)
    if (moved || edited) changed.push({ shape: s, moved })
  }
  const removed = [...prev.values()].filter((s) => !seen.has(s.id))
  return { added, removed, changed }
}
