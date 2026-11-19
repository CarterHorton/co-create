/**
 * A comment box that suggests board members after "@".
 *
 * Follows the combobox pattern: the textarea keeps focus and points at the
 * highlighted suggestion with aria-activedescendant; ↑/↓ move through the
 * listbox, Enter or Tab picks, Escape closes it. Ctrl/⌘+Enter submits.
 */

import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { MAX_BODY_LENGTH, insertMention, mentionQuery, suggestMembers, type Member } from './model'

export interface MentionTextareaHandle {
  focus: () => void
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** Escape with no suggestions open. */
  onCancel?: () => void
  members: Member[]
  /** Not suggested (yourself). */
  selfId: string
  label: string
  placeholder?: string
  testId?: string
  rows?: number
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { value, onChange, onSubmit, onCancel, members, selfId, label, placeholder, testId, rows = 2 },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), [])
  const listId = useId()
  const hintId = useId()
  const [caret, setCaret] = useState(0)
  /** The mention ("start:query") whose suggestions were closed; typing more reopens them. */
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  /** Where the caret goes once a picked mention is in the value (set before the next keystroke). */
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = area.current
    if (pendingCaret.current === null || !el) return
    el.focus()
    el.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  })

  const q = mentionQuery(value, caret)
  const key = q ? `${q.start}:${q.query}` : null
  const options = q && key !== dismissed ? suggestMembers(members, q.query, selfId) : []
  const open = options.length > 0
  const active = open ? Math.min(highlight, options.length - 1) : -1
  const optionId = (i: number) => `${listId}-opt-${i}`

  function pick(m: Member) {
    if (!q) return
    const next = insertMention(value, q.start, caret, m.name)
    onChange(next.text)
    setCaret(next.caret)
    setHighlight(0)
    // The finished "@Name " would match again; keep it closed until more is typed.
    setDismissed(`${q.start}:${next.text.slice(q.start + 1, next.caret)}`)
    pendingCaret.current = next.caret
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((active + d + options.length) % options.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(options[active])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(key)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
      return
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  const sync = () => setCaret(area.current?.selectionStart ?? 0)

  return (
    <div className="relative">
      <textarea
        ref={area}
        data-testid={testId}
        aria-label={label}
        aria-describedby={hintId}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        value={value}
        rows={rows}
        maxLength={MAX_BODY_LENGTH}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setHighlight(0)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) sync()
        }}
        onClick={sync}
        onBlur={() => setDismissed(key)}
        className="block w-full resize-y border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <p id={hintId} className="sr-only">
        Type @ to mention someone on this board. Control or Command plus Enter posts.
      </p>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People on this board"
          data-testid="mention-suggestions"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto border border-foreground bg-background shadow-[4px_4px_0_0_#000]"
        >
          {options.map((m, i) => (
            <li
              key={m.userId}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // Keep focus in the textarea.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
              className={cn(
                'cursor-pointer px-2 py-1.5 text-sm',
                i === active ? 'bg-foreground text-background' : 'hover:bg-royal/20',
              )}
            >
              @{m.name}
            </li>
          ))}
        </ul>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {open ? `${options.length} ${options.length === 1 ? 'person' : 'people'} found. Use up and down arrows to choose.` : ''}
      </div>
    </div>
  )
})
