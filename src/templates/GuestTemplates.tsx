/**
 * /try: while the guest board is empty, a header button offers the template
 * picker (it also opens right after "Clear"). Picking one adds its shapes to
 * the localStorage board as a single undo step.
 */

import { LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui'
import type { BoardStore } from '@/components/board/types'
import { LiveRegion, useAnnouncer } from '@/components/board/LiveRegion'
import { TemplatePicker } from './TemplatePicker'
import { applyTemplate } from './seed'
import { templateById } from './templates'

interface GuestTemplatesProps {
  store: Pick<BoardStore, 'addShape' | 'batch' | 'shapes'>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** False while a past version is previewed. */
  enabled?: boolean
}

export function GuestTemplates({ store, open, onOpenChange, enabled = true }: GuestTemplatesProps) {
  const empty = store.shapes.length === 0
  const { message, say } = useAnnouncer()
  return (
    <>
      {enabled && empty && (
        <Button
          variant="outline"
          size="sm"
          data-testid="try-template"
          aria-haspopup="dialog"
          onClick={() => onOpenChange(true)}
        >
          <LayoutTemplate aria-hidden="true" /> Start from a template
        </Button>
      )}
      <LiveRegion message={message} testId="template-announcer" />
      <TemplatePicker
        open={open && enabled}
        onClose={() => onOpenChange(false)}
        description="Lay out named sections and prompts on this empty board, so the Markdown export reads as a spec skeleton. Blank keeps it empty."
        onChoose={(id) => {
          const t = templateById(id)
          onOpenChange(false)
          // Templates go on an empty board only.
          if (!t || store.shapes.length) return
          if (applyTemplate(store, t)) say(`${t.name} template added`)
        }}
      />
    </>
  )
}
