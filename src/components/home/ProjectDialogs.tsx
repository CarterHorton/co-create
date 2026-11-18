/** Rename and Share dialogs for a project (delete uses ConfirmModal). */

import { useState, type FormEvent } from 'react'
import { useQuery } from 'deepspace'
import { Button, Input, Label, Modal, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { MAX_PROJECT_NAME_LENGTH } from '@/schemas/projects-schema'
import type { Friendship } from '@/components/sharing/types'

export interface ProjectMember {
  projectId: string
  ownerId: string
  userId: string
  name?: string
}

export function RenameProjectModal({
  project,
  open,
  onClose,
}: {
  project: { id: string; name: string } | null
  open: boolean
  onClose: () => void
}) {
  const { error } = useToast()
  // The parent keys this by project, so the field starts from the current name.
  const [name, setName] = useState(project?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!project || !name.trim()) return
    setSaving(true)
    try {
      await callAction('projectRename', { projectId: project.id, name })
      onClose()
    } catch (err) {
      error('Could not rename project', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} size="sm">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>Rename project</Modal.Title>
        </Modal.Header>
        <Modal.Body className="space-y-2">
          <Label htmlFor="project-rename-input">Name</Label>
          <Input
            id="project-rename-input"
            data-testid="project-rename-input"
            value={name}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()} data-testid="project-rename-save">
            Save
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

export function ShareProjectModal({
  project,
  userId,
  open,
  onClose,
}: {
  project: { id: string; name: string } | null
  userId: string
  open: boolean
  onClose: () => void
}) {
  const { error } = useToast()
  const projectId = project?.id ?? ''
  const { records: friends } = useQuery<Friendship>('friendships', { where: { ownerId: userId } })
  const { records: members } = useQuery<ProjectMember>('project_members', { where: { projectId } })
  const [busy, setBusy] = useState<string | null>(null)
  const sharedIds = new Set(members.map((m) => m.data.userId))

  async function toggle(friendId: string, shared: boolean) {
    setBusy(friendId)
    try {
      if (shared) await callAction('projectUnshare', { projectId, userId: friendId })
      else await callAction('projectShare', { projectId, friendId })
    } catch (err) {
      error(shared ? 'Could not unshare project' : 'Could not share project', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" data-testid="project-share-dialog">
      <Modal.Header>
        <Modal.Title>Share "{project?.name}"</Modal.Title>
        <Modal.Description>
          Friends you share a project with can edit every board in it, including boards you move in later. Unsharing
          takes that access away.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet — add them with a friend code on this page.</p>
        ) : (
          <ul className="space-y-1">
            {friends.map((f) => {
              const shared = sharedIds.has(f.data.friendId)
              const name = f.data.friendName || 'Someone'
              return (
                <li
                  key={f.recordId}
                  className="flex items-center justify-between gap-2 text-sm"
                  data-testid={`project-share-${f.data.friendId}`}
                >
                  <span className="min-w-0 truncate">
                    {name}
                    {shared && <span className="ml-2 font-mono text-xs text-muted-foreground">· has access</span>}
                  </span>
                  <Button
                    size="sm"
                    variant={shared ? 'ghost' : 'outline'}
                    aria-label={shared ? `Unshare with ${name}` : `Share with ${name}`}
                    loading={busy === f.data.friendId}
                    onClick={() => void toggle(f.data.friendId, shared)}
                  >
                    {shared ? 'Unshare' : 'Share'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
