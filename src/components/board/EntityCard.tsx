/**
 * Database schema builder on the board: the body of an entity (table) card,
 * and the dialog that edits its name and fields.
 *
 * The card shows `name : type` per field with text markers (PK, req, uniq),
 * so keys and constraints never rely on colour. The dialog is a plain form:
 * every control is a labelled input, select, checkbox or button, so the whole
 * table can be built from the keyboard.
 */

import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  ENTITY_HEADER,
  ENTITY_ROW,
  FIELD_TYPES,
  MAX_FIELDS,
  MAX_NAME,
  cleanName,
  displayName,
  entityOf,
  type EntityField,
  type FieldType,
} from '@/spec/dataModel'
import type { BoardShape } from './types'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** The card's content; the shape element around it carries the accessible name. */
export function EntityBody({ shape }: { shape: BoardShape }) {
  const e = entityOf(shape)
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden text-left" data-testid="entity-body">
      <p
        data-testid="entity-name"
        className="flex shrink-0 items-center truncate border-b-2 border-current px-3 font-bold"
        style={{ height: ENTITY_HEADER }}
      >
        {displayName(e)}
      </p>
      <ul className="min-h-0 pt-1">
        {e.fields.map((f, i) => (
          <li
            key={i}
            data-testid="entity-field"
            className="flex items-center gap-1.5 px-3 font-mono text-xs"
            style={{ height: ENTITY_ROW }}
          >
            <span className="w-5 shrink-0 font-bold">{f.pk ? 'PK' : ''}</span>
            <span className={cn('min-w-0 truncate', f.pk && 'underline underline-offset-2')}>{f.name || '(unnamed)'}</span>
            <span className="shrink-0 opacity-60">: {f.type}</span>
            <span className="ml-auto flex shrink-0 gap-1 text-[10px] font-semibold uppercase">
              {f.required && !f.pk && <span title="Required (NOT NULL)">req</span>}
              {f.unique && !f.pk && <span title="Unique">uniq</span>}
            </span>
          </li>
        ))}
        {!e.fields.length && <li className="px-3 font-mono text-xs opacity-60" style={{ height: ENTITY_ROW }}>No fields</li>}
      </ul>
    </div>
  )
}

interface Row extends EntityField {
  key: number
}

/**
 * Edit a table: its name, and its fields (add, remove, reorder; name, type,
 * primary key, required, unique). Nothing is saved until "Save table".
 */
export function EntityDialog({
  shape,
  onSave,
  onClose,
  finalFocus,
}: {
  shape: BoardShape
  onSave: (name: string, fields: EntityField[]) => void
  onClose: () => void
  /** Where focus goes when the dialog closes (the table on the board). */
  finalFocus: () => HTMLElement | null
}) {
  const initial = entityOf(shape)
  const nextKey = useRef(initial.fields.length)
  const [name, setName] = useState(initial.name)
  const [rows, setRows] = useState<Row[]>(() => initial.fields.map((f, i) => ({ ...f, key: i })))
  const listRef = useRef<HTMLOListElement>(null)
  const formId = useId()
  const [openedAt] = useState(() => performance.now())

  /** Focus a control in a row after React re-renders it. */
  const focusIn = (key: number | null, selector: string) =>
    requestAnimationFrame(() => {
      const root = listRef.current
      const el =
        key === null
          ? root?.parentElement?.querySelector<HTMLElement>('[data-testid="entity-add-field"]')
          : root?.querySelector<HTMLElement>(`[data-row="${key}"] ${selector}`)
      el?.focus()
    })

  const patch = (key: number, change: Partial<EntityField>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)))

  const add = () => {
    if (rows.length >= MAX_FIELDS) return
    const key = nextKey.current++
    setRows((rs) => [...rs, { key, name: '', type: 'text', pk: false, required: false, unique: false }])
    focusIn(key, 'input')
  }

  const remove = (i: number) => {
    const next = rows[i + 1] ?? rows[i - 1]
    setRows((rs) => rs.filter((_, j) => j !== i))
    focusIn(next?.key ?? null, 'input')
  }

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const key = rows[i].key
    setRows((rs) => {
      const copy = [...rs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
    // Keep focus on the moved row; at either end its button disables, so use the other one.
    const atEnd = j === 0 || j === rows.length - 1
    focusIn(key, `[data-move="${atEnd ? (dir === -1 ? 'down' : 'up') : dir === -1 ? 'up' : 'down'}"]`)
  }

  const save = () => {
    onSave(
      cleanName(name),
      rows.map(({ name: n, type, pk, required, unique }) => ({ name: cleanName(n), type, pk, required: required || pk, unique })),
    )
  }

  const names = rows.map((r) => r.name.trim().toLowerCase()).filter(Boolean)
  const duplicate = names.find((n, i) => names.indexOf(n) !== i)

  // Board shortcuts listen on window: keep keys typed here (Delete on a checkbox, letters on a select) off the board.
  const keepKeys = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape') e.stopPropagation()
  }

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        // A table drawn with the pointer opens this on pointerdown; that same click's release isn't a click outside.
        if (!open && !(details.reason === 'outside-press' && performance.now() - openedAt < 600)) onClose()
      }}
    >
      <DialogContent
        data-testid="entity-dialog"
        finalFocus={finalFocus}
        onKeyDown={keepKeys}
        className="flex max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col sm:max-w-2xl"
      >
      <DialogHeader>
        <DialogTitle>Edit table</DialogTitle>
        <DialogDescription>
          Name the table and list its fields. Arrows between tables are relations; select one to set how many rows sit on each end.
        </DialogDescription>
      </DialogHeader>
      <div className="-mx-1 flex-1 overflow-y-auto px-1 py-4">
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-name`}>Table name</Label>
            <Input
              id={`${formId}-name`}
              data-testid="entity-name-input"
              value={name}
              maxLength={MAX_NAME}
              autoFocus
              placeholder="e.g. users"
              onChange={(e) => setName(e.target.value)}
              className="rounded-none"
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Fields</legend>
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No fields yet.</p>}
            <ol ref={listRef} className="flex flex-col gap-2">
              {rows.map((r, i) => {
                const label = r.name.trim() || `field ${i + 1}`
                return (
                  <li
                    key={r.key}
                    data-row={r.key}
                    data-testid="entity-field-row"
                    role="group"
                    aria-label={`Field ${i + 1} of ${rows.length}: ${label}`}
                    className="flex flex-wrap items-center gap-2 border border-border p-2"
                  >
                    <Input
                      data-testid="field-name"
                      aria-label={`Field ${i + 1} name`}
                      value={r.name}
                      maxLength={MAX_NAME}
                      placeholder="name"
                      onChange={(e) => patch(r.key, { name: e.target.value })}
                      className="h-8 w-40 rounded-none font-mono"
                    />
                    <select
                      data-testid="field-type"
                      aria-label={`${label} type`}
                      value={r.type}
                      onChange={(e) => patch(r.key, { type: e.target.value as FieldType })}
                      className={cn('h-8 border border-input bg-background px-2 font-mono text-sm', focusRing)}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {(
                      [
                        ['pk', 'PK', 'primary key'],
                        ['required', 'Required', 'required (NOT NULL)'],
                        ['unique', 'Unique', 'unique'],
                      ] as const
                    ).map(([k, text, spoken]) => (
                      <label key={k} className="flex items-center gap-1.5 text-xs font-semibold">
                        <Checkbox
                          data-testid={`field-${k}`}
                          aria-label={`${label} ${spoken}`}
                          checked={k === 'required' ? r.required || r.pk : r[k]}
                          disabled={k === 'required' && r.pk}
                          onCheckedChange={(v) => patch(r.key, { [k]: v })}
                          className="rounded-none"
                        />
                        {text}
                      </label>
                    ))}
                    <span className="ml-auto flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        data-move="up"
                        aria-label={`Move ${label} up`}
                        disabled={i === 0}
                        onClick={() => moveRow(i, -1)}
                        className="size-8 rounded-none"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        data-move="down"
                        aria-label={`Move ${label} down`}
                        disabled={i === rows.length - 1}
                        onClick={() => moveRow(i, 1)}
                        className="size-8 rounded-none"
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        data-testid="field-remove"
                        aria-label={`Remove ${label}`}
                        onClick={() => remove(i)}
                        className="size-8 rounded-none"
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ol>
            <Button
              variant="outline"
              data-testid="entity-add-field"
              onClick={add}
              disabled={rows.length >= MAX_FIELDS}
              className="self-start rounded-none"
            >
              <Plus /> Add field
            </Button>
          </fieldset>
          {duplicate && (
            <p role="status" className="text-sm">
              Two fields are named “{duplicate}”. The SQL export will rename the second one.
            </p>
          )}
        </form>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} className="rounded-none">
          Cancel
        </Button>
        <Button type="submit" form={formId} data-testid="entity-save" className="rounded-none">
          Save table
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
