/**
 * The export dialog's data-model formats: the board's entity tables as
 * PostgreSQL DDL or a Prisma schema. Shown only when the board has tables.
 */

import { useMemo, useState } from 'react'
import { Check, Copy, Database, Download } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { slug } from '@/spec/buildSpec'
import { isEntity } from '@/spec/dataModel'
import { boardToPostgres } from '@/spec/sql'
import { boardToPrisma } from '@/spec/prisma'
import type { BoardShape } from './types'

type Format = 'sql' | 'prisma'

const FORMATS: { id: Format; label: string; ext: string; mime: string }[] = [
  { id: 'sql', label: 'PostgreSQL', ext: 'sql', mime: 'application/sql' },
  { id: 'prisma', label: 'Prisma', ext: 'prisma', mime: 'text/plain' },
]

export function DataModelExport({ title, shapes }: { title: string; shapes: BoardShape[] }) {
  const hasTables = shapes.some((s) => isEntity(s))
  const [format, setFormat] = useState<Format>('sql')
  const [copied, setCopied] = useState(false)
  const text = useMemo(
    () => (!hasTables ? '' : format === 'sql' ? boardToPostgres(title, shapes) : boardToPrisma(title, shapes)),
    [hasTables, format, title, shapes],
  )
  if (!hasTables) return null
  const info = FORMATS.find((f) => f.id === format)!
  const base = slug(title).replace(/-+/g, '-').replace(/^-|-$/g, '') || 'board'
  const fileName = format === 'prisma' ? 'schema.prisma' : `${base}-schema.sql`

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: `${info.mime};charset=utf-8` }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the text is still selectable in the preview.
    }
  }

  return (
    <section aria-labelledby="data-model-export-heading" data-testid="data-model-export" className="mt-4 border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="data-model-export-heading" className="flex items-center gap-1.5 text-sm font-bold">
          <Database className="size-4" aria-hidden /> Data model
        </h3>
        <div role="group" aria-label="Schema format" className="flex">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`schema-format-${f.id}`}
              aria-pressed={format === f.id}
              onClick={() => setFormat(f.id)}
              className={cn(
                'h-8 border border-foreground px-2 text-xs font-bold uppercase tracking-[0.05em] [&+&]:border-l-0',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                format === f.id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={copy} data-testid="schema-copy" className="rounded-none">
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : `Copy ${info.label}`}
          </Button>
          <Button variant="outline" size="sm" onClick={download} data-testid="schema-download" className="rounded-none">
            <Download /> Download {fileName}
          </Button>
        </span>
      </div>
      <pre
        data-testid="schema-preview"
        tabIndex={0}
        aria-label={`${info.label} schema`}
        className="mt-3 max-h-[30vh] overflow-auto whitespace-pre border border-border bg-card p-3 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {text}
      </pre>
    </section>
  )
}
