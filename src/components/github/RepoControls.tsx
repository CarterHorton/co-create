/**
 * GitHub repo links in the UI: the board header's repo menu and the project
 * "GitHub repo" dialog. Writes go through the repoConnect / repoDisconnect
 * actions (src/actions/github.ts); what is shown comes from the stored
 * columns (src/github/repo.ts), so nothing here calls GitHub.
 */

import { useState, type FormEvent } from 'react'
import { ExternalLink, GitBranch } from 'lucide-react'
import { Button, Input, Label, Modal, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { RepoInfo, RepoSource } from '@/github/repo'

type Target = 'board' | 'project'

/** Name (linked to GitHub), description and default branch. */
export function RepoDetails({ repo, testId }: { repo: RepoInfo; testId: string }) {
  return (
    <div data-testid={testId} className="space-y-1 text-sm">
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-bold underline underline-offset-4"
      >
        {repo.fullName}
        <ExternalLink aria-hidden className="size-3" />
        <span className="sr-only">(opens GitHub in a new tab)</span>
      </a>
      {repo.description && <p className="text-xs text-muted-foreground">{repo.description}</p>}
      <p className="font-mono text-xs text-muted-foreground">Default branch: {repo.defaultBranch}</p>
    </div>
  )
}

/** Connect (or change) and disconnect a repo on one board or project. */
function RepoForm({
  target,
  id,
  own,
  onDone,
}: {
  target: Target
  id: string
  /** The repo this board/project has itself (not inherited), if any. */
  own: RepoInfo | null
  onDone?: () => void
}) {
  const { error, success } = useToast()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null)
  const inputId = `repo-input-${target}`

  async function connect(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setBusy('connect')
    try {
      const res = await callAction<{ repo: RepoInfo }>('repoConnect', { target, id, repo: value })
      setValue('')
      success(`Connected ${res.repo.fullName}`)
      onDone?.()
    } catch (err) {
      error('Could not connect repository', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy('disconnect')
    try {
      await callAction('repoDisconnect', { target, id })
      success('Repository disconnected')
    } catch (err) {
      error('Could not disconnect repository', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={connect} className="space-y-2">
        <Label htmlFor={inputId}>{own ? 'Change repository' : 'Public GitHub repository'}</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            data-testid={`repo-input-${target}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="owner/name or github.com link"
            maxLength={300}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" size="sm" loading={busy === 'connect'} disabled={!value.trim() || !!busy} data-testid={`repo-connect-${target}`}>
            Connect
          </Button>
        </div>
      </form>
      {own && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void disconnect()}
          loading={busy === 'disconnect'}
          disabled={!!busy}
          data-testid={`repo-disconnect-${target}`}
        >
          Disconnect {own.fullName}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Only public repositories. Co-Create looks up the name, description and default branch once, when you connect.
      </p>
    </div>
  )
}

/** The repo button next to a board's title. Hidden from non-owners when there's no repo. */
export function BoardRepoMenu({
  boardId,
  isOwner,
  own,
  effective,
}: {
  boardId: string
  isOwner: boolean
  own: RepoInfo | null
  effective: { repo: RepoInfo; source: RepoSource } | null
}) {
  if (!effective && !isOwner) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button data-testid="repo-open" variant="ghost" size="sm" className="min-w-0 gap-1.5">
            <GitBranch aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{effective ? effective.repo.fullName : 'Connect repo'}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 space-y-3 p-4" data-testid="repo-menu">
        <h3 className="text-sm font-bold">GitHub repository</h3>
        {effective ? (
          <>
            <RepoDetails repo={effective.repo} testId="board-repo" />
            <p className="text-xs text-muted-foreground" data-testid="board-repo-source">
              {effective.source === 'project'
                ? "From this board's project."
                : 'Connected to this board.'}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No repository yet. Connect one so the exported spec tells your AI agent where the code lives.
          </p>
        )}
        {isOwner && (
          <>
            {effective?.source === 'project' && (
              <p className="text-xs text-muted-foreground">Connect a different one to override it for this board only.</p>
            )}
            <RepoForm target="board" id={boardId} own={own} />
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** "GitHub repo…" from a project's menu on /home. */
export function ProjectRepoModal({
  project,
  repo,
  open,
  onClose,
}: {
  project: { id: string; name: string } | null
  repo: RepoInfo | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" data-testid="project-repo-dialog">
      <Modal.Header>
        <Modal.Title>GitHub repo for "{project?.name}"</Modal.Title>
        <Modal.Description>
          Every board in this project uses this repository, unless a board connects its own.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body className="space-y-4">
        {repo && <RepoDetails repo={repo} testId="project-repo" />}
        {project && <RepoForm target="project" id={project.id} own={repo} />}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
