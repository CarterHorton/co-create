/**
 * Pure helpers for board versions: fingerprinting, human-readable diffs, and
 * the minimal ops that turn the live board back into a saved version.
 */

import type { BoardShape, BoardStore } from '@/components/board/types'

/** The fields a version keeps per shape (server bookkeeping like updatedAt is dropped). */
export type SnapshotShape = Pick<BoardShape, 'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'props' | 'createdBy' | 'createdAt'>

/**
 * Canonical snapshot: sorted, no null props, and the shape's ORIGINAL
 * creation time (a restore re-adds shapes, and the server stamps a new
 * createdAt; the original rides along in props.originalCreatedAt).
 */
export function toSnapshot(shapes: BoardShape[]): SnapshotShape[] {
  return [...shapes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, type, x, y, width, height, props, createdBy, createdAt }) => ({
      id,
      type,
      x,
      y,
      width,
      height,
      props: sortKeys(props),
      createdBy,
      createdAt: typeof props.originalCreatedAt === 'string' ? props.originalCreatedAt : createdAt,
    }))
}

/** Bookkeeping props that are not content. */
const META_PROPS = new Set(['originalCreatedAt'])

function sortKeys(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(o)
      .filter((k) => o[k] !== null && o[k] !== undefined && !META_PROPS.has(k))
      .sort()
      .map((k) => [k, o[k]]),
  )
}

/** Stable identity of a board's content: equal fingerprints = nothing to save. */
export function fingerprint(shapes: Pick<BoardShape, 'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'props'>[]): string {
  return JSON.stringify(
    [...shapes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => [s.id, s.type, Math.round(s.x), Math.round(s.y), Math.round(s.width), Math.round(s.height), sortKeys(s.props)]),
  )
}

export interface BoardDiff {
  added: SnapshotShape[]
  removed: SnapshotShape[]
  moved: string[]
  resized: string[]
  edited: string[]
  /** Section assignment changed (selection bar). */
  grouped: string[]
  restyled: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function diffShapes(prev: SnapshotShape[], next: SnapshotShape[]): BoardDiff {
  const before = new Map(prev.map((s) => [s.id, s]))
  const after = new Map(next.map((s) => [s.id, s]))
  const d: BoardDiff = { added: [], removed: [], moved: [], resized: [], edited: [], grouped: [], restyled: [] }
  for (const s of next) if (!before.has(s.id)) d.added.push(s)
  for (const s of prev) if (!after.has(s.id)) d.removed.push(s)
  for (const n of next) {
    const p = before.get(n.id)
    if (!p) continue
    if (Math.round(p.x) !== Math.round(n.x) || Math.round(p.y) !== Math.round(n.y)) d.moved.push(n.id)
    if (Math.round(p.width) !== Math.round(n.width) || Math.round(p.height) !== Math.round(n.height)) d.resized.push(n.id)
    if (!same(p.props.text, n.props.text)) d.edited.push(n.id)
    if (!same(p.props.section, n.props.section) || !same(p.props.subsection, n.props.subsection)) d.grouped.push(n.id)
    const { text: _pt, section: _ps, subsection: _pss, ...pr } = p.props
    const { text: _nt, section: _ns, subsection: _nss, ...nr } = n.props
    if (!same(sortKeys(pr), sortKeys(nr))) d.restyled.push(n.id)
  }
  return d
}

const NOUN: Record<string, [string, string]> = {
  sticky: ['note', 'notes'],
  box: ['box', 'boxes'],
  text: ['label', 'labels'],
  arrow: ['arrow', 'arrows'],
}
function countByType(shapes: SnapshotShape[]) {
  const counts = new Map<string, number>()
  for (const s of shapes) counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
  return ['sticky', 'box', 'text', 'arrow', ...counts.keys()]
    .filter((t, i, all) => counts.has(t) && all.indexOf(t) === i)
    .map((t) => {
      const n = counts.get(t)!
      const [one, many] = NOUN[t] ?? ['shape', 'shapes']
      return `${n} ${n === 1 ? one : many}`
    })
}
function joinList(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "Added 2 notes and 1 arrow, moved 3, edited 1" — or null when nothing changed. */
export function describeDiff(d: BoardDiff): string | null {
  const parts: string[] = []
  if (d.added.length) parts.push(`added ${joinList(countByType(d.added))}`)
  if (d.removed.length) parts.push(`removed ${joinList(countByType(d.removed))}`)
  if (d.edited.length) parts.push(`edited ${d.edited.length}`)
  if (d.moved.length) parts.push(`moved ${d.moved.length}`)
  if (d.resized.length) parts.push(`resized ${d.resized.length}`)
  if (d.grouped.length) parts.push(`grouped ${d.grouped.length}`)
  if (d.restyled.length) parts.push(`restyled ${d.restyled.length}`)
  if (!parts.length) return null
  const text = parts.join(', ')
  return text[0].toUpperCase() + text.slice(1)
}

export type RestoreOp =
  | { op: 'delete'; id: string }
  | { op: 'add'; shape: Partial<BoardShape> }
  | { op: 'move'; id: string; x: number; y: number }
  | { op: 'resize'; id: string; width: number; height: number }
  | { op: 'update'; id: string; props: Record<string, unknown> }

/**
 * Ops that turn `current` into `target`. Re-added shapes keep their ids (so
 * arrows still connect) and their original creation time in
 * props.originalCreatedAt (the server stamps a fresh createdAt on add).
 * Arrows are deleted first and added last so they never point at nothing.
 */
export function restoreOps(current: SnapshotShape[], target: SnapshotShape[]): RestoreOp[] {
  const cur = new Map(current.map((s) => [s.id, s]))
  const tgt = new Map(target.map((s) => [s.id, s]))
  const isArrow = (s: SnapshotShape) => s.type === 'arrow'
  const ops: RestoreOp[] = []

  const gone = current.filter((s) => !tgt.has(s.id))
  for (const s of [...gone.filter(isArrow), ...gone.filter((s) => !isArrow(s))]) ops.push({ op: 'delete', id: s.id })

  for (const t of target) {
    const c = cur.get(t.id)
    if (!c) continue
    if (c.x !== t.x || c.y !== t.y) ops.push({ op: 'move', id: t.id, x: t.x, y: t.y })
    if (c.width !== t.width || c.height !== t.height) ops.push({ op: 'resize', id: t.id, width: t.width, height: t.height })
    const patch: Record<string, unknown> = {}
    for (const k of new Set([...Object.keys(c.props), ...Object.keys(t.props)])) {
      if (META_PROPS.has(k)) continue
      if (!same(c.props[k], t.props[k])) patch[k] = t.props[k] ?? null
    }
    if (Object.keys(patch).length) ops.push({ op: 'update', id: t.id, props: patch })
  }

  const missing = target.filter((s) => !cur.has(s.id))
  for (const t of [...missing.filter((s) => !isArrow(s)), ...missing.filter(isArrow)]) {
    ops.push({
      op: 'add',
      shape: {
        id: t.id,
        type: t.type,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        props: { ...t.props, originalCreatedAt: t.createdAt },
      },
    })
  }
  return ops
}

export function applyOps(store: Pick<BoardStore, 'addShape' | 'deleteShape' | 'move' | 'resize' | 'update'>, ops: RestoreOp[]) {
  for (const o of ops) {
    if (o.op === 'delete') store.deleteShape(o.id)
    else if (o.op === 'add') store.addShape(o.shape)
    else if (o.op === 'move') store.move(o.id, o.x, o.y)
    else if (o.op === 'resize') store.resize(o.id, o.width, o.height)
    else store.update(o.id, o.props)
  }
}
