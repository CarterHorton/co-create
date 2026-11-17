/** Version list for a board: save now, preview any version, see what changed. */

import { useState, type FormEvent } from 'react'
import { History, Save } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatVersionTime, type Versioning } from './useVersioning'

export function HistoryPanel({ v, canWrite }: { v: Versioning; canWrite: boolean }) {
  const [message, setMessage] = useState('')

  function onSave(e: FormEvent) {
    e.preventDefault()
    void v.saveNow(message).then(() => setMessage(''))
  }

  return (
    <div data-testid="history-panel" className="flex min-h-0 flex-1 flex-col">
      {canWrite && (
        <form onSubmit={onSave} className="flex flex-col gap-2 border-b border-border p-3">
          <input
            data-testid="history-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe this version (optional)"
            maxLength={500}
            className="h-9 border border-input bg-background px-2 text-sm outline-none focus-visible:border-royal/50"
          />
          <Button data-testid="history-save" type="submit" size="sm" loading={v.saving} disabled={!v.unsaved && !message.trim()}>
            <Save /> {v.unsaved ? 'Save version' : 'No unsaved changes'}
          </Button>
          <p className="font-mono text-[11px] leading-snug text-muted-foreground">
            Versions also save on their own a few seconds after you stop editing.
          </p>
        </form>
      )}
      {v.error && (
        <p role="alert" className="m-3 border border-destructive/40 p-2 text-xs text-destructive">
          {v.error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {v.loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading history…</p>
        ) : v.versions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <History className="size-5" />
            No versions yet. Start drawing — the first one saves itself.
          </div>
        ) : (
          <ol data-testid="history-list">
            {v.unsaved && (
              <li className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">● Unsaved changes</li>
            )}
            {v.versions.map((ver, i) => {
              const selected = v.preview?.id === ver.id
              return (
                <li key={ver.id}>
                  <button
                    type="button"
                    data-testid="history-item"
                    aria-current={selected || undefined}
                    onClick={() => v.setPreview(selected ? null : ver)}
                    className={cn(
                      'block w-full border-b border-border px-4 py-3 text-left transition-colors',
                      selected ? 'bg-royal/20' : 'hover:bg-royal/10',
                    )}
                  >
                    <span className="block text-sm font-semibold leading-snug">{ver.message}</span>
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {formatVersionTime(ver.createdAt)} · {ver.authorName}
                      {ver.auto ? ' · auto' : ''} · {ver.shapeCount} shape{ver.shapeCount === 1 ? '' : 's'}
                      {i === 0 ? ' · latest' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

/** Shown above the board while previewing a version. */
export function PreviewBanner({ v, canWrite }: { v: Versioning; canWrite: boolean }) {
  const p = v.preview
  if (!p) return null
  return (
    <div
      data-testid="preview-banner"
      className="flex flex-wrap items-center gap-3 border-b border-foreground bg-royal/20 px-4 py-2 text-sm"
    >
      <span className="font-bold">Viewing a past version</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {formatVersionTime(p.createdAt)} · {p.authorName} — {p.message}
      </span>
      <div className="flex-1" />
      {canWrite && (
        <Button data-testid="preview-restore" size="sm" loading={v.saving} onClick={() => void v.restore(p)}>
          Restore this version
        </Button>
      )}
      <Button data-testid="preview-exit" size="sm" variant="outline" onClick={() => v.setPreview(null)}>
        Back to live board
      </Button>
    </div>
  )
}
