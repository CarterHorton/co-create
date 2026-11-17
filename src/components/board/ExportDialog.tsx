/** Preview, copy, or download the board as a Markdown spec (built locally, no AI). */

import { useMemo, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { buildMarkdown, specFileName } from '@/spec/buildSpec'
import type { BoardShape } from './types'

export function ExportDialog({
  title,
  shapes,
  onClose,
}: {
  title: string
  shapes: BoardShape[]
  onClose: () => void
}) {
  const markdown = useMemo(() => buildMarkdown(title, shapes), [title, shapes])
  const fileName = specFileName(title)
  const [copied, setCopied] = useState(false)

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
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
        <Modal.Title>Export as Markdown</Modal.Title>
        <Modal.Description>
          Built from the board itself: nearby notes become sections, arrows set the order. Hand{' '}
          <code className="font-mono">{fileName}</code> to your AI agent.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body>
        <pre
          data-testid="export-preview"
          className="max-h-[50vh] overflow-auto whitespace-pre-wrap border border-border bg-card p-4 font-mono text-xs leading-relaxed"
        >
          {markdown}
        </pre>
      </Modal.Body>
      <Modal.Footer>
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
