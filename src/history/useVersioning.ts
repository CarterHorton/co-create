/**
 * useVersioning — Git-style history for a board.
 *
 * - Auto-save: after the board has been idle for `idleMs` and THIS client
 *   made an edit since the last save, save a version with an auto-written
 *   summary. Only clients that edited save, and an unchanged board (same
 *   fingerprint as the latest version) is never saved twice.
 * - Manual save with your own message.
 * - Preview: view any version read-only (export works on it too).
 * - Restore: unsaved changes are saved first, then the live board is edited
 *   back to the version (shape ids kept, so arrows survive) and the restore
 *   itself is recorded as a version.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardStore } from '@/components/board/types'
import { applyOps, describeDiff, diffShapes, fingerprint, restoreOps, toSnapshot } from './diff'
import type { HistoryStore, Version } from './stores'

const NOOP = () => {}

export function formatVersionTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function useVersioning({
  store,
  history,
  authorName,
  idleMs = 10_000,
}: {
  store: BoardStore
  history: HistoryStore
  authorName: string
  idleMs?: number
}) {
  const [preview, setPreview] = useState<Version | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = useRef(false)

  const fp = useMemo(() => fingerprint(store.shapes), [store.shapes])
  const latest = history.versions[0]
  const latestFp = useMemo(() => (latest ? fingerprint(latest.snapshot) : fingerprint([])), [latest])
  const unsaved = fp !== latestFp

  const save = useCallback(
    async (message: string | null, auto: boolean) => {
      const snapshot = toSnapshot(store.shapes)
      if (fingerprint(snapshot) === latestFp && auto) return
      const summary = describeDiff(diffShapes(latest?.snapshot ?? [], snapshot)) ?? 'No changes'
      setSaving(true)
      setError(null)
      try {
        await history.save({ snapshot, message: message?.trim() || summary, auto, authorName })
        dirty.current = false
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save this version.')
      } finally {
        setSaving(false)
      }
    },
    [store.shapes, latest, latestFp, history, authorName],
  )

  // Auto-save once edits settle.
  useEffect(() => {
    if (!unsaved || history.loading) return
    const t = setTimeout(() => {
      if (dirty.current) void save(null, true)
    }, idleMs)
    return () => clearTimeout(t)
  }, [fp, unsaved, history.loading, idleMs, save])

  // Edits made through this store mark the client as an author of the next version.
  const { addShape, deleteShape, move, resize, update, undo, redo } = store
  const tracked: BoardStore = useMemo(() => {
    const mark =
      <A extends unknown[]>(fn: (...a: A) => void) =>
      (...a: A) => {
        dirty.current = true
        fn(...a)
      }
    return {
      shapes: store.shapes,
      connected: store.connected,
      canWrite: store.canWrite,
      addShape: mark(addShape),
      deleteShape: mark(deleteShape),
      move: mark(move),
      resize: mark(resize),
      update: mark(update),
      undo: mark(undo),
      redo: mark(redo),
    }
  }, [store.shapes, store.connected, store.canWrite, addShape, deleteShape, move, resize, update, undo, redo])

  const previewStore: BoardStore | null = useMemo(
    () =>
      preview && {
        shapes: preview.snapshot.map((s) => ({ ...s, updatedAt: s.createdAt })),
        connected: true,
        canWrite: false,
        addShape: NOOP,
        deleteShape: NOOP,
        move: NOOP,
        resize: NOOP,
        update: NOOP,
        undo: NOOP,
        redo: NOOP,
      },
    [preview],
  )

  const restore = useCallback(
    async (v: Version) => {
      if (!store.canWrite) return
      if (unsaved) await save(`${describeDiff(diffShapes(latest?.snapshot ?? [], toSnapshot(store.shapes))) ?? 'Changes'} (saved before restore)`, false)
      applyOps(store, restoreOps(toSnapshot(store.shapes), v.snapshot))
      setSaving(true)
      try {
        await history.save({
          snapshot: v.snapshot,
          message: `Restored version from ${formatVersionTime(v.createdAt)}`,
          auto: false,
          authorName,
        })
        dirty.current = false
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record the restore.')
      } finally {
        setSaving(false)
      }
      setPreview(null)
    },
    [store, unsaved, save, latest, history, authorName],
  )

  return {
    /** What the whiteboard should show and edit right now. */
    viewStore: previewStore ?? tracked,
    preview,
    setPreview,
    restore,
    saveNow: (message?: string) => save(message ?? null, false),
    saving,
    error,
    unsaved,
    versions: history.versions,
    loading: history.loading,
  }
}

export type Versioning = ReturnType<typeof useVersioning>
