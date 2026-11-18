/**
 * The Comments tab of the board sidebar: threads (Open / Resolved), a box
 * for a new comment on the board or on a shape, replies, edit, resolve and
 * delete. Opening a thread pans the board to its shape and focuses it.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { shapeName } from '@/components/board/a11y'
import type { BoardShape } from '@/components/board/types'
import { cn } from '@/lib/utils'
import { MentionTextarea, type MentionTextareaHandle } from './MentionTextarea'
import { splitMentions, type CommentRow, type Member } from './model'
import type { CommentsApi, ThreadView } from './useComments'

export interface ComposeTarget {
  shapeId: string
  label: string
}

interface Props {
  api: CommentsApi
  /** The live board's shapes, to name threads and spot deleted shapes. */
  shapes: BoardShape[]
  userId: string
  isOwner: boolean
  /** Start a comment on this shape (a new object each time). */
  compose: ComposeTarget | null
  onComposeClear: () => void
  /** Only show threads on this shape. */
  shapeFilter: string | null
  onShapeFilter: (shapeId: string | null) => void
  /** Bring this thread into view and focus it (a new object each time). */
  highlight: { threadId: string } | null
  /** Pan the board to a shape and focus it. */
  onOpenShape: (shapeId: string) => void
}

type Filter = 'open' | 'resolved'

const field = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function CommentsPanel({
  api,
  shapes,
  userId,
  isOwner,
  compose,
  onComposeClear,
  shapeFilter,
  onShapeFilter,
  highlight,
  onOpenShape,
}: Props) {
  const { error } = useToast()
  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])
  const [filter, setFilter] = useState<Filter>('open')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CommentRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const composer = useRef<MentionTextareaHandle>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // A new compose target: focus the box.
  useEffect(() => {
    if (compose) requestAnimationFrame(() => composer.current?.focus())
  }, [compose])

  // A thread to show (from a notification): switch to its filter, then focus it.
  const [seenHighlight, setSeenHighlight] = useState(highlight)
  if (highlight !== seenHighlight) {
    setSeenHighlight(highlight)
    const t = highlight && api.threads.find((x) => x.root.id === highlight.threadId)
    if (t) setFilter(t.root.resolved ? 'resolved' : 'open')
  }
  const highlightFound = !!highlight && api.threads.some((x) => x.root.id === highlight.threadId)
  useEffect(() => {
    if (!highlight || !highlightFound) return
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(highlight.threadId)}"]`)
      el?.scrollIntoView({ block: 'nearest' })
      el?.focus({ preventScroll: true })
    })
  }, [highlight, highlightFound])

  const label = (t: ThreadView) => threadPlace(t, byId)
  const scoped = shapeFilter ? api.threads.filter((t) => t.root.shapeId === shapeFilter) : api.threads
  const open = scoped.filter((t) => !t.root.resolved)
  const resolved = scoped.filter((t) => t.root.resolved)
  const shown = filter === 'open' ? open : resolved
  const filterShape = shapeFilter ? byId.get(shapeFilter) : undefined

  async function post(e?: FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await api.create({ body, shapeId: compose?.shapeId ?? null, shapeLabel: compose?.label })
      setDraft('')
      setFilter('open')
      onComposeClear()
    } catch (err) {
      error('Could not post comment', err instanceof Error ? err.message : String(err))
    } finally {
      setPosting(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.remove(pendingDelete.id)
    } catch (err) {
      error('Could not delete comment', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <div data-testid="comments-panel" className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={(e) => void post(e)} className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate" data-testid="comment-target">
            {compose ? `On ${compose.label}` : 'On the board'}
          </span>
          {compose && (
            <button
              type="button"
              aria-label="Comment on the board instead"
              title="Comment on the board instead"
              onClick={onComposeClear}
              className={cn('p-0.5 hover:text-foreground', field)}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <MentionTextarea
          ref={composer}
          testId="comment-input"
          label={compose ? `Comment on ${compose.label}` : 'Comment on the board'}
          placeholder="Add a comment — @ to mention"
          value={draft}
          onChange={setDraft}
          onSubmit={() => void post()}
          onCancel={
            compose
              ? () => {
                  const id = compose.shapeId
                  onComposeClear()
                  if (byId.has(id)) onOpenShape(id)
                }
              : undefined
          }
          members={api.members}
          selfId={userId}
        />
        <Button data-testid="comment-post" type="submit" size="sm" loading={posting} disabled={!draft.trim()}>
          <MessageSquare /> Comment
        </Button>
      </form>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2" role="group" aria-label="Show threads">
        {(['open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`comments-filter-${f}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'border border-foreground px-2 py-1 text-xs font-bold uppercase tracking-[0.05em]',
              filter === f ? 'bg-foreground text-background' : 'hover:bg-royal/20',
              field,
            )}
          >
            {f === 'open' ? 'Open' : 'Resolved'} ({f === 'open' ? open.length : resolved.length})
          </button>
        ))}
      </div>
      {shapeFilter && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate">
            Only {filterShape ? shapeName(filterShape, byId) : 'a deleted shape'}
          </span>
          <button
            type="button"
            data-testid="comments-show-all"
            onClick={() => onShapeFilter(null)}
            className={cn('font-bold underline underline-offset-2', field)}
          >
            Show all
          </button>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {api.loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading comments…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {filter === 'open' ? 'No open threads. Select a shape and press M to comment on it.' : 'No resolved threads.'}
          </p>
        ) : (
          <ul data-testid="comment-threads">
            {shown.map((t) => (
              <ThreadItem
                key={t.root.id}
                thread={t}
                place={label(t)}
                shapeExists={!!t.root.shapeId && byId.has(t.root.shapeId)}
                api={api}
                userId={userId}
                isOwner={isOwner}
                onOpenShape={onOpenShape}
                onDelete={(c) => {
                  setPendingDelete(c)
                  setDeleteOpen(true)
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false)
        }}
        onConfirm={() => void confirmDelete()}
        title={pendingDelete && !pendingDelete.parentId ? 'Delete this thread?' : 'Delete this comment?'}
        description={
          pendingDelete && !pendingDelete.parentId
            ? 'The comment and all its replies are deleted for everyone. This can’t be undone.'
            : 'It’s deleted for everyone. This can’t be undone.'
        }
        confirmText="Delete"
        loading={deleting}
      />
    </div>
  )
}

/** "Sticky note: Buy milk", "the board", or "a deleted shape (was …)". */
export function threadPlace(t: ThreadView, byId: Map<string, BoardShape>): string {
  if (!t.root.shapeId) return 'the board'
  const s = byId.get(t.root.shapeId)
  if (s) return shapeName(s, byId)
  return t.shapeLabel ? `a deleted shape (was ${t.shapeLabel})` : 'a deleted shape'
}

function ThreadItem({
  thread,
  place,
  shapeExists,
  api,
  userId,
  isOwner,
  onOpenShape,
  onDelete,
}: {
  thread: ThreadView
  place: string
  shapeExists: boolean
  api: CommentsApi
  userId: string
  isOwner: boolean
  onOpenShape: (shapeId: string) => void
  onDelete: (c: CommentRow) => void
}) {
  const { error } = useToast()
  const { root, replies } = thread
  const [replyOpen, setReplyOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const replyBox = useRef<MentionTextareaHandle>(null)
  const canResolve = isOwner || root.authorId === userId

  async function run(what: string, fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      return true
    } catch (err) {
      error(`Could not ${what}`, err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function sendReply() {
    const body = reply.trim()
    if (!body) return
    if (await run('reply', () => api.create({ body, parentId: root.id }))) {
      setReply('')
      setReplyOpen(false)
    }
  }

  const placeLabel = `Thread on ${place}`
  return (
    <li
      data-testid="comment-thread"
      data-thread-id={root.id}
      data-resolved={root.resolved || undefined}
      tabIndex={-1}
      aria-label={placeLabel}
      className="border-b border-border px-3 py-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {shapeExists ? (
        <button
          type="button"
          data-testid="comment-thread-open"
          onClick={() => onOpenShape(root.shapeId!)}
          className={cn('mb-2 block max-w-full truncate text-left font-mono text-[11px] font-semibold underline underline-offset-2 hover:text-royal', field)}
        >
          On {place}
        </button>
      ) : (
        <p className="mb-2 truncate font-mono text-[11px] font-semibold text-muted-foreground" data-testid="comment-thread-place">
          On {place}
        </p>
      )}
      {root.resolved && (
        <p className="mb-2 inline-flex items-center gap-1 border border-border px-1.5 font-mono text-[11px]">
          <Check className="size-3" aria-hidden /> Resolved
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {[root, ...replies].map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            members={api.members}
            canEdit={c.authorId === userId}
            canDelete={c.authorId === userId || isOwner}
            onEdit={(body) => run('edit the comment', () => api.edit(c.id, body))}
            onDelete={() => onDelete(c)}
            userId={userId}
          />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!replyOpen && (
          <button
            type="button"
            data-testid="comment-reply-open"
            onClick={() => {
              setReplyOpen(true)
              requestAnimationFrame(() => replyBox.current?.focus())
            }}
            className={cn('text-xs font-bold underline underline-offset-2', field)}
          >
            Reply
          </button>
        )}
        {canResolve && (
          <button
            type="button"
            data-testid={root.resolved ? 'comment-reopen' : 'comment-resolve'}
            disabled={busy}
            onClick={() => void run(root.resolved ? 'reopen the thread' : 'resolve the thread', () => api.resolve(root.id, !root.resolved))}
            className={cn('flex items-center gap-1 text-xs font-bold underline underline-offset-2 disabled:opacity-40', field)}
          >
            {root.resolved ? <RotateCcw className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}
            {root.resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>
      {replyOpen && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void sendReply()
          }}
        >
          <MentionTextarea
            ref={replyBox}
            testId="comment-reply-input"
            label={`Reply to the thread on ${place}`}
            placeholder="Reply — @ to mention"
            value={reply}
            onChange={setReply}
            onSubmit={() => void sendReply()}
            onCancel={() => setReplyOpen(false)}
            members={api.members}
            selfId={userId}
          />
          <div className="flex gap-2">
            <Button data-testid="comment-reply-send" type="submit" size="sm" loading={busy} disabled={!reply.trim()}>
              Reply
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}

function CommentItem({
  comment: c,
  members,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  userId,
}: {
  comment: CommentRow
  members: Member[]
  canEdit: boolean
  canDelete: boolean
  onEdit: (body: string) => Promise<boolean>
  onDelete: () => void
  userId: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const box = useRef<MentionTextareaHandle>(null)
  const editBtn = useRef<HTMLButtonElement>(null)
  // Mentions as stored on the comment (by id), named from the current members.
  const named = members.filter((m) => c.mentions.includes(m.userId))

  async function save() {
    const body = draft.trim()
    if (!body) return
    if (body === c.body || (await onEdit(body))) {
      setEditing(false)
      requestAnimationFrame(() => editBtn.current?.focus())
    }
  }

  return (
    <li data-testid="comment" data-comment-id={c.id} className="text-sm">
      <p className="font-mono text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{c.authorName}</span> · {formatTime(c.createdAt)}
        {c.editedAt ? ' · edited' : ''}
      </p>
      {editing ? (
        <form
          className="mt-1 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <MentionTextarea
            ref={box}
            testId="comment-edit-input"
            label="Edit comment"
            value={draft}
            onChange={setDraft}
            onSubmit={() => void save()}
            onCancel={() => {
              setEditing(false)
              setDraft(c.body)
            }}
            members={members}
            selfId={userId}
          />
          <div className="flex gap-2">
            <Button data-testid="comment-edit-save" type="submit" size="sm" disabled={!draft.trim()}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setDraft(c.body)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p data-testid="comment-body" className="mt-0.5 whitespace-pre-wrap break-words">
          {splitMentions(c.body, named).map((s, i) =>
            s.userId ? (
              <strong key={i} className="font-bold underline decoration-royal/50 underline-offset-2">
                {s.text}
              </strong>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
      )}
      {!editing && (canEdit || canDelete) && (
        <div className="mt-1 flex gap-2">
          {canEdit && (
            <button
              ref={editBtn}
              type="button"
              data-testid="comment-edit"
              aria-label={`Edit comment by ${c.authorName}`}
              onClick={() => {
                setDraft(c.body)
                setEditing(true)
                requestAnimationFrame(() => box.current?.focus())
              }}
              className={cn('flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground', field)}
            >
              <Pencil className="size-3" aria-hidden /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              data-testid="comment-delete"
              aria-label={`Delete comment by ${c.authorName}`}
              onClick={onDelete}
              className={cn('flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive', field)}
            >
              <Trash2 className="size-3" aria-hidden /> Delete
            </button>
          )}
        </div>
      )}
    </li>
  )
}
