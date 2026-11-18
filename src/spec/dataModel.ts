/**
 * Database schema builder: entity shapes (tables) and the relations drawn
 * between them. Pure functions shared by the board (names, sizing), the
 * Markdown spec ("Data model" section) and the SQL / Prisma exporters.
 *
 * An entity stores its table in props: `name` (string) and `fields`
 * (EntityField[]). It deliberately has no `text` prop, so the note sections
 * of the spec never pick it up. An arrow whose both ends are entities is a
 * relation; `props.cardinality` says how many rows sit on each end, read in
 * the arrow's direction ("1-n": one `from` row has many `to` rows).
 */

import type { BoardShape } from '@/components/board/types'

export const ENTITY = 'entity'

export const FIELD_TYPES = ['text', 'int', 'bigint', 'float', 'bool', 'date', 'timestamp', 'uuid', 'json'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export interface EntityField {
  name: string
  type: FieldType
  /** Part of the primary key. */
  pk: boolean
  /** NOT NULL. */
  required: boolean
  unique: boolean
}

export interface Entity {
  id: string
  name: string
  fields: EntityField[]
}

export type Cardinality = '1-1' | '1-n' | 'n-n'

export const CARDINALITIES: { id: Cardinality; label: string; short: string; ends: [string, string] }[] = [
  { id: '1-1', label: 'One to one', short: '1 – 1', ends: ['1', '1'] },
  { id: '1-n', label: 'One to many', short: '1 – ∗', ends: ['1', '∗'] },
  { id: 'n-n', label: 'Many to many', short: '∗ – ∗', ends: ['∗', '∗'] },
]

export interface Relation {
  id: string
  from: Entity
  to: Entity
  cardinality: Cardinality
}

export interface DataModel {
  entities: Entity[]
  relations: Relation[]
}

/** Limits: Postgres truncates identifiers at 63 bytes; a table this wide is a mistake. */
export const MAX_NAME = 63
export const MAX_FIELDS = 100

const isFieldType = (v: unknown): v is FieldType => typeof v === 'string' && (FIELD_TYPES as readonly string[]).includes(v)

/** Trim, drop control characters and cap the length of a table or field name. */
export function cleanName(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME)
}

/** Read a field from untrusted props (a peer, an old board, a hand-edited file). */
function toField(v: unknown): EntityField | null {
  if (!v || typeof v !== 'object') return null
  const f = v as Record<string, unknown>
  return {
    name: cleanName(f.name),
    type: isFieldType(f.type) ? f.type : 'text',
    pk: f.pk === true,
    required: f.required === true,
    unique: f.unique === true,
  }
}

export function fieldsOf(s: Pick<BoardShape, 'props'>): EntityField[] {
  const raw = s.props.fields
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_FIELDS)
    .map(toField)
    .filter((f): f is EntityField => !!f)
}

export const entityNameOf = (s: Pick<BoardShape, 'props'>) => cleanName(s.props.name)

export function entityOf(s: BoardShape): Entity {
  return { id: s.id, name: entityNameOf(s), fields: fieldsOf(s) }
}

export const isEntity = (s: Pick<BoardShape, 'type'> | undefined): boolean => s?.type === ENTITY

export function cardinalityOf(arrow: Pick<BoardShape, 'props'>): Cardinality {
  const c = arrow.props.cardinality
  return c === '1-1' || c === 'n-n' ? c : '1-n'
}

export const cardinalityInfo = (c: Cardinality) => CARDINALITIES.find((x) => x.id === c)!

/** The two entities an arrow joins, when it is a relation. */
export function relationEnds(
  arrow: BoardShape,
  byId: Map<string, BoardShape>,
): { from: BoardShape; to: BoardShape } | null {
  if (arrow.type !== 'arrow') return null
  const from = byId.get(String(arrow.props.from))
  const to = byId.get(String(arrow.props.to))
  return from && to && isEntity(from) && isEntity(to) ? { from, to } : null
}

/** A table's display name ("untitled table" until named). */
export const displayName = (e: Pick<Entity, 'name'>) => e.name || 'untitled table'

/** "Entity users, 5 fields". */
export function entityLabel(s: BoardShape): string {
  const e = entityOf(s)
  const n = e.fields.length
  return `Entity ${displayName(e)}, ${n} ${n === 1 ? 'field' : 'fields'}`
}

/** "Relation from users to orders, one to many". */
export function relationLabel(arrow: BoardShape, from: BoardShape, to: BoardShape): string {
  return `Relation from ${displayName(entityOf(from))} to ${displayName(entityOf(to))}, ${cardinalityInfo(cardinalityOf(arrow)).label.toLowerCase()}`
}

const byTime = (a: BoardShape, b: BoardShape) =>
  (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.id.localeCompare(b.id)

/** Every entity on the board (creation order) and the relations between them. */
export function readDataModel(shapes: BoardShape[]): DataModel {
  const entityShapes = shapes.filter((s) => isEntity(s)).sort(byTime)
  const entities = entityShapes.map(entityOf)
  const byId = new Map(entities.map((e) => [e.id, e]))
  const relations = shapes
    .filter((s) => s.type === 'arrow')
    .sort(byTime)
    .flatMap((a) => {
      const from = byId.get(String(a.props.from))
      const to = byId.get(String(a.props.to))
      return from && to ? [{ id: a.id, from, to, cardinality: cardinalityOf(a) }] : []
    })
  return { entities, relations }
}

// ── Card layout ─────────────────────────────────────────────────────────

export const ENTITY_HEADER = 40
export const ENTITY_ROW = 26
const ENTITY_PAD = 10
export const ENTITY_MIN_WIDTH = 220
const ENTITY_MAX_WIDTH = 520

/** Size a card to show its name and every field. Keeps a wider width the user chose. */
export function entitySize(name: string, fields: EntityField[], currentWidth = 0): { width: number; height: number } {
  const markers = (f: EntityField) => (f.pk ? 3 : 0) + (f.required ? 4 : 0) + (f.unique ? 3 : 0)
  const longest = Math.max(name.length + 4, ...fields.map((f) => f.name.length + f.type.length + 4 + markers(f)))
  const want = Math.min(ENTITY_MAX_WIDTH, Math.max(ENTITY_MIN_WIDTH, Math.round(longest * 8 + 32)))
  return {
    width: Math.max(want, Math.min(ENTITY_MAX_WIDTH, currentWidth)),
    height: ENTITY_HEADER + Math.max(1, fields.length) * ENTITY_ROW + ENTITY_PAD,
  }
}

/** Props for a freshly drawn entity: one uuid primary key to start from. */
export function newEntityProps(): { name: string; fields: EntityField[] } {
  return { name: 'table', fields: [{ name: 'id', type: 'uuid', pk: true, required: true, unique: true }] }
}

export const DEFAULT_ENTITY_SIZE = entitySize('table', newEntityProps().fields)

// ── Markdown ("Data model" section of the spec) ────────────────────────

/** Escape text for a Markdown table cell. */
const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, '\\`')

/** Lines of the spec's "Data model" section; none when the board has no entities. */
export function dataModelMarkdown(shapes: BoardShape[]): string[] {
  const { entities, relations } = readDataModel(shapes)
  if (!entities.length) return []
  const out: string[] = ['## Data model', '']
  out.push(
    '_Tables drawn on the board. PK = primary key, required = NOT NULL, unique = UNIQUE. ' +
      'Relations are arrows between tables, read in the arrow\'s direction._',
    '',
  )
  for (const e of entities) {
    out.push(`### ${displayName(e)}`, '')
    if (!e.fields.length) {
      out.push('_No fields yet._', '')
      continue
    }
    out.push('| Field | Type | Key | Required | Unique |', '|---|---|---|---|---|')
    for (const f of e.fields) {
      const yes = (b: boolean) => (b ? 'yes' : '—')
      out.push(`| ${cell(f.name || '(unnamed)')} | ${f.type} | ${f.pk ? 'PK' : '—'} | ${yes(f.required || f.pk)} | ${yes(f.unique)} |`)
    }
    out.push('')
  }
  out.push('### Relations', '')
  if (!relations.length) out.push('_No relations: no arrows connect the tables._', '')
  else {
    for (const r of relations) {
      const [a, b] = cardinalityInfo(r.cardinality).ends
      const [from, to] = [displayName(r.from), displayName(r.to)]
      const how =
        r.cardinality === 'n-n'
          ? 'many to many, through a join table'
          : r.cardinality === '1-1'
            ? `one to one: each ${to} row references one ${from} row, at most once`
            : `one to many: each ${to} row references one ${from} row`
      out.push(`- ${from} ${a} → ${b} ${to} (${how})`)
    }
    out.push('')
  }
  return out
}
