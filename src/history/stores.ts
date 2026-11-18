/**
 * Where versions live:
 *   - useCloudHistory → the `versions` collection (shared with the board)
 *   - useLocalHistory → localStorage, for the guest board
 * Both return the same HistoryStore shape, newest version first.
 */

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/actions'
import type { SnapshotShape } from './diff'

export interface Version {
  id: string
  createdAt: string
  authorName: string
  message: string
  auto: boolean
  shapeCount: number
  snapshot: SnapshotShape[]
}

export interface HistoryStore {
  versions: Version[]
  loading: boolean
  save: (v: { snapshot: SnapshotShape[]; message: string; auto: boolean; authorName: string }) => Promise<void>
}

interface VersionRow {
  boardId: string
  message: string
  authorName: string
  auto: boolean
  shapeCount: number
  snapshot: SnapshotShape[]
}

const HISTORY_LIMIT = 200

export function useCloudHistory(boardId: string): HistoryStore {
  const { records, status } = useQuery<VersionRow>('versions', {
    where: { boardId },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: HISTORY_LIMIT,
  })
  // Created server-side so the board's access is checked (src/actions/history.ts);
  // the author's name comes from the server's user record.
  const save = useCallback<HistoryStore['save']>(
    async ({ snapshot, message, auto }) => {
      await callAction('versionCreate', { boardId, message, auto, snapshot })
    },
    [boardId],
  )

  const versions: Version[] = records.map((r) => ({
    id: r.recordId,
    createdAt: r.createdAt,
    authorName: r.data.authorName || 'Someone',
    message: r.data.message,
    auto: !!r.data.auto,
    shapeCount: r.data.shapeCount ?? r.data.snapshot?.length ?? 0,
    snapshot: Array.isArray(r.data.snapshot) ? r.data.snapshot : [],
  }))

  return { versions, loading: status === 'loading', save }
}

export const LOCAL_HISTORY_KEY = 'co-create:try-history:v1'
const LOCAL_LIMIT = 50

function loadLocal(): Version[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Version[]) : []
  } catch {
    return []
  }
}

export function useLocalHistory(): HistoryStore & { clearHistory: () => void } {
  const [versions, setVersions] = useState<Version[]>(loadLocal)

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(versions))
    } catch {
      // Storage full/blocked: history stays in memory for this visit.
    }
  }, [versions])

  const save = useCallback<HistoryStore['save']>(async ({ snapshot, message, auto, authorName }) => {
    const v: Version = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
      createdAt: new Date().toISOString(),
      authorName,
      message,
      auto,
      shapeCount: snapshot.length,
      snapshot,
    }
    setVersions((prev) => [v, ...prev].slice(0, LOCAL_LIMIT))
  }, [])

  const clearHistory = useCallback(() => setVersions([]), [])

  return { versions, loading: false, save, clearHistory }
}
