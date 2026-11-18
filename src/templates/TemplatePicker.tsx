/**
 * Template picker — a dialog with one radio per template (arrow keys move
 * between them, like any radio group), each with a short description and the
 * sections it starts with.
 *
 *   <TemplatePicker>       the dialog itself (controlled)
 *   <useTemplateChoice>    /home: a "Template: Blank" button beside "New board"
 *                          plus `queue(boardId)` for after the board is created
 */

import { useId, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DEFAULT_TEMPLATE_ID, TEMPLATES, templateById, type BoardTemplate } from './templates'
import { queueTemplate } from './seed'

/** Section names a template starts with, in order ("Problem → Users → …"). */
export function templateOutline(t: BoardTemplate): string[] {
  return t.shapes
    .filter((s) => s.type === 'text' && typeof s.props.section === 'string' && !s.props.subsection)
    .map((s) => String(s.props.section))
}

interface TemplatePickerProps {
  open: boolean
  onClose: () => void
  /** Preselected template. */
  value?: string
  onChoose: (id: string) => void
  title?: string
  description?: string
  confirmText?: string
}

export function TemplatePicker({
  open,
  onClose,
  value = DEFAULT_TEMPLATE_ID,
  onChoose,
  title = 'Start from a template',
  description = 'Each template lays out named sections and prompts, so the Markdown export reads as a spec skeleton.',
  confirmText = 'Use template',
}: TemplatePickerProps) {
  return (
    <Modal open={open} onClose={onClose} size="lg" data-testid="template-picker">
      {/* Mounted only while open, so the selection resets to `value` each time. */}
      {open && (
        <PickerBody
          value={value}
          onClose={onClose}
          onChoose={onChoose}
          title={title}
          description={description}
          confirmText={confirmText}
        />
      )}
    </Modal>
  )
}

function PickerBody({
  value,
  onClose,
  onChoose,
  title,
  description,
  confirmText,
}: Required<Omit<TemplatePickerProps, 'open'>>) {
  const [selected, setSelected] = useState(templateById(value) ? value : DEFAULT_TEMPLATE_ID)
  const name = useId()
  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        // React events bubble through portals: don't also submit a form the picker was opened from.
        e.stopPropagation()
        onChoose(selected)
      }}
    >
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
        <Modal.Description>{description}</Modal.Description>
      </Modal.Header>
      <Modal.Body>
        <fieldset>
          <legend className="sr-only">Template</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => {
              const outline = templateOutline(t)
              const checked = selected === t.id
              return (
                <li key={t.id}>
                  <label
                    data-testid={`template-option-${t.id}`}
                    className={cn(
                      'flex h-full cursor-pointer gap-3 border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                      checked ? 'border-foreground bg-royal/20' : 'border-border hover:border-royal/50',
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={t.id}
                      checked={checked}
                      onChange={() => setSelected(t.id)}
                      className="mt-1 size-4 shrink-0 accent-foreground"
                    />
                    <span className="min-w-0">
                      <span className="block font-bold">{t.name}</span>
                      <span className="block text-sm text-muted-foreground">{t.description}</span>
                      {outline.length > 0 && (
                        <span className="mt-1 block font-mono text-xs text-muted-foreground">
                          <span className="sr-only">Sections: </span>
                          {outline.join(' → ')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-testid="template-confirm">
          {confirmText}
        </Button>
      </Modal.Footer>
    </form>
  )
}

/**
 * For /home's create form: a button naming the chosen template (it opens the
 * picker), and `queue(boardId)` to call once the board exists. The choice
 * resets to Blank after each board.
 */
export function useTemplateChoice() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID)
  const [open, setOpen] = useState(false)
  const current = templateById(templateId) ?? TEMPLATES[0]

  const element = (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="template-choose"
        aria-haspopup="dialog"
        aria-label={`Template: ${current.name}. Change template`}
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate aria-hidden="true" />
        {current.name}
      </Button>
      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        value={templateId}
        title="Choose a template"
        description="The new board starts with these sections and prompts. Blank starts empty."
        confirmText="Choose"
        onChoose={(id) => {
          setTemplateId(id)
          setOpen(false)
        }}
      />
    </>
  )

  const queue = (boardId: string) => {
    queueTemplate(boardId, templateId)
    setTemplateId(DEFAULT_TEMPLATE_ID)
  }

  return { element, queue, templateId }
}
