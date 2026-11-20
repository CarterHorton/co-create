/** Preview, copy, or download the board as a Markdown spec (built locally, no AI), or the whole board as a PDF. */

import { useMemo, useState } from 'react'
import { Bot, Check, Copy, Download, FileImage } from 'lucide-react'
import { Button, Checkbox, Modal } from '@/components/ui'
import { buildMarkdown, specFileName } from '@/spec/buildSpec'
import type { BoardShape } from './types'
import { boardToPdf } from './pdf'
import { DataModelExport } from './DataModelExport'
import type { RepoInfo } from '@/github/repo'

export interface SpecPublisher {
  publish: (spec: { title: string; markdown: string }) => Promise<void>
  /** Shown after publishing: how an agent fetches it. */
  fetchCommand: string
}

export function ExportDialog({
  title,
  shapes,
  onClose,
  publisher,
  voteCounts,
  repo,
}: {
  title: string
  shapes: BoardShape[]
  onClose: () => void
  publisher?: SpecPublisher
  /** Vote counts by note; offers to write them into the spec when there are any. */
  voteCounts?: ReadonlyMap<string, number>
  /** The board's connected GitHub repo, written near the top of the spec. */
  repo?: RepoInfo | null
}) {
  const hasVotes = !!voteCounts?.size
  const [withVotes, setWithVotes] = useState(true)
  const votes = hasVotes && withVotes ? voteCounts : undefined
  const markdown = useMemo(() => buildMarkdown(title, shapes, { votes, repo }), [title, shapes, votes, repo])
  const fileName = specFileName(title)
  const [copied, setCopied] = useState(false)
  const [publishState, setPublishState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  async function publish() {
    if (!publisher) return
    setPublishState('busy')
    try {
      await publisher.publish({ title, markdown })
      setPublishState('done')
    } catch {
      setPublishState('error')
    }
  }

  const pdfName = fileName.replace(/\.md$/, '.pdf')
  const [pdfState, setPdfState] = useState<'idle' | 'busy' | 'error'>('idle')

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function download() {
    save(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), fileName)
  }

  async function downloadPdf() {
    setPdfState('busy')
    try {
      save(await boardToPdf(title, shapes), pdfName)
      setPdfState('idle')
    } catch {
      setPdfState('error')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (permissions / insecure context): the text is still selectable.
    }
  }

  return (
    <Modal open onClose={onClose} size="xl">
      <Modal.Header>
        <Modal.Title>Export</Modal.Title>
        <Modal.Description>
          Built from the board itself: nearby notes become sections, arrows set the order. Hand{' '}
          <code className="font-mono">{fileName}</code> to your AI agent, or download a PDF picture of the whole board.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body>
        {hasVotes && (
          <label className="mb-3 flex items-center gap-2 text-sm">
            <Checkbox data-testid="export-include-votes" checked={withVotes} onCheckedChange={setWithVotes} />
            Include vote counts next to notes
          </label>
        )}
        <pre
          data-testid="export-preview"
          className="max-h-[50vh] overflow-auto whitespace-pre-wrap border border-border bg-card p-4 font-mono text-xs leading-relaxed"
        >
          {markdown}
        </pre>
        <DataModelExport title={title} shapes={shapes} />
        {publishState === 'done' && publisher && (
          <div data-testid="publish-done" className="mt-3 border border-foreground p-3 text-sm">
            <p className="font-bold">Published. A coding agent can fetch it with:</p>
            <code className="mt-1 block break-all font-mono text-xs">{publisher.fetchCommand}</code>
          </div>
        )}
        {pdfState === 'error' && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Could not make the PDF. Try again.
          </p>
        )}
        {publishState === 'error' && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Could not publish. Check your connection and try again.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        {publisher && (
          <Button
            variant="outline"
            onClick={() => void publish()}
            loading={publishState === 'busy'}
            data-testid="export-publish"
            title="Save this Markdown to the app so coding agents can fetch it"
          >
            <Bot /> {publishState === 'done' ? 'Publish again' : 'Publish for agents'}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => void downloadPdf()}
          loading={pdfState === 'busy'}
          data-testid="export-pdf"
          title="The whole board as one page, at screen resolution"
        >
          <FileImage /> PDF
        </Button>
        <Button variant="outline" onClick={copy} data-testid="export-copy">
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={download} data-testid="export-download">
          <Download /> Download {fileName}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
