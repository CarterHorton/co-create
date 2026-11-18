/**
 * View-only links — the owner's part of the Share menu. Create a `/join/<token>`
 * link (shown once: only its hash is stored), copy it, and see or revoke the
 * board's links. Server side: src/actions/links.ts.
 */

import { useId, useState } from 'react'
import { useQuery } from 'deepspace'
import { Copy, Link2, X } from 'lucide-react'
import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui'
import { LiveRegion, useAnnouncer } from '@/components/board/LiveRegion'
import { callAction } from '@/lib/actions'
import { linkState, type ExpiryChoice } from '@/actions/linkTokens'
import type { TeamMember } from './types'

interface BoardLink {
  boardId: string
  ownerId: string
  role: string
  expiresAt?: number | null
  revokedAt?: number | null
}

const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
  never: 'Never',
  '1d': 'In 1 day',
  '7d': 'In 7 days',
  '30d': 'In 30 days',
}

/** The full link for a token, on this origin. */
export function joinUrl(token: string): string {
  return `${window.location.origin}/join/${token}`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ShareLinks({ boardId }: { boardId: string }) {
  const { error, success } = useToast()
  const { records: links } = useQuery<BoardLink>('board_links', { where: { boardId } })
  const { records: members } = useQuery<TeamMember>('team_members', { where: { teamId: boardId } })
  const [expiresIn, setExpiresIn] = useState<ExpiryChoice>('never')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<{ linkId: string; viewers: number } | null>(null)
  const [removeViewers, setRemoveViewers] = useState(false)
  const [busy, setBusy] = useState(false)
  const { message, say } = useAnnouncer()
  const expiryId = useId()
  const linkFieldId = useId()

  const now = Date.now()
  const visible = links
    .filter((l) => !l.data.revokedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const viewersOf = (linkId: string) =>
    members.filter((m) => m.data.viaLink === linkId && m.data.role === 'viewer').length

  async function create() {
    setCreating(true)
    try {
      const res = await callAction<{ token: string }>('boardLinkCreate', { boardId, expiresIn })
      setCreated(joinUrl(res.token))
      say('View-only link created. Copy it now: it is shown only once.')
    } catch (e) {
      error('Could not create link', (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      say('Link copied')
      success('Link copied')
    } catch {
      say('Could not copy. Select the link and copy it yourself.')
    }
  }

  async function revoke() {
    if (!revoking) return
    setBusy(true)
    try {
      const res = await callAction<{ removed: number }>('boardLinkRevoke', {
        linkId: revoking.linkId,
        removeViewers,
      })
      say(
        removeViewers
          ? `Link revoked. ${plural(res.removed, 'viewer', 'viewers')} removed.`
          : 'Link revoked. People who already joined keep view access.',
      )
      setRevoking(null)
    } catch (e) {
      error('Could not revoke link', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${expiryId}-h`} className="mt-4 border-t border-border pt-4" data-testid="share-links">
      <h3 id={`${expiryId}-h`} className="mb-1 text-sm font-bold">
        View-only links
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">Anyone signed in with the link can view, but not edit, this board.</p>

      <div className="mb-2 flex flex-col gap-2">
        <div>
          <Label htmlFor={expiryId} className="mb-1 block text-xs">
            Link expires
          </Label>
          <Select value={expiresIn} onValueChange={(v) => setExpiresIn((v || 'never') as ExpiryChoice)}>
            <SelectTrigger id={expiryId} data-testid="share-link-expiry" className="h-8 rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXPIRY_LABELS) as ExpiryChoice[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {EXPIRY_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="w-full" data-testid="share-link-create" loading={creating} onClick={create}>
          <Link2 className="size-3.5" /> Create view-only link
        </Button>
      </div>

      {created && (
        <div className="mb-3" data-testid="share-link-created">
          <Label htmlFor={linkFieldId} className="mb-1 block text-xs">
            New link (shown once)
          </Label>
          <div className="flex gap-2">
            <Input
              id={linkFieldId}
              readOnly
              value={created}
              data-testid="share-link-url"
              onFocus={(e) => e.currentTarget.select()}
              className="h-8 rounded-none font-mono text-xs"
            />
            <Button size="sm" variant="outline" data-testid="share-link-copy" onClick={copy} aria-label="Copy link">
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active links.</p>
      ) : (
        <ul className="space-y-2" aria-label="Active view-only links" data-testid="share-link-list">
          {visible.map((l) => {
            const expired = linkState(l.data, now) === 'expired'
            const viewers = viewersOf(l.recordId)
            const createdOn = formatDate(Date.parse(l.createdAt))
            return (
              <li
                key={l.recordId}
                data-testid={`share-link-${l.recordId}`}
                className="flex items-center justify-between gap-2 border border-border p-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold">Created {createdOn}</p>
                  <p className="text-muted-foreground">
                    {expired
                      ? 'Expired'
                      : l.data.expiresAt
                        ? `Expires ${formatDate(l.data.expiresAt)}`
                        : 'Never expires'}
                    {' · '}
                    {plural(viewers, 'viewer joined', 'viewers joined')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke link created ${createdOn}`}
                  data-testid={`share-link-revoke-${l.recordId}`}
                  onClick={() => {
                    setRemoveViewers(false)
                    setRevoking({ linkId: l.recordId, viewers })
                  }}
                >
                  <X className="size-3.5" /> Revoke
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <LiveRegion message={message} testId="share-links-status" />

      <Modal open={!!revoking} onClose={() => !busy && setRevoking(null)} size="sm" data-testid="share-link-revoke-dialog">
        <Modal.Header>
          <Modal.Title>Revoke this link?</Modal.Title>
          <Modal.Description>Nobody new can join with it. This can&apos;t be undone.</Modal.Description>
        </Modal.Header>
        <Modal.Body>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${expiryId}-rm`}
              checked={removeViewers}
              onCheckedChange={setRemoveViewers}
              data-testid="share-link-remove-viewers"
            />
            <Label htmlFor={`${expiryId}-rm`} className="text-sm font-normal leading-snug">
              Also remove the {revoking ? plural(revoking.viewers, 'person', 'people') : 'people'} who joined through this
              link
            </Label>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="ghost" onClick={() => setRevoking(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" data-testid="share-link-revoke-confirm" loading={busy} onClick={revoke}>
            Revoke link
          </Button>
        </Modal.Footer>
      </Modal>
    </section>
  )
}
