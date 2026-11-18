/**
 * Turns the board's data model into concrete tables: unique table and column
 * names, primary keys, UNIQUE constraints, and the foreign-key columns and
 * join tables that relations imply. Both exporters (PostgreSQL, Prisma)
 * render this plan, so they always agree.
 *
 *  - 1 → ∗ (arrow from A to B): B gets a column per primary-key column of A
 *    (`a_id`), nullable, with a foreign key to A. A field the user already
 *    added with that name is reused instead.
 *  - 1 → 1: the same, plus UNIQUE on those columns.
 *  - ∗ → ∗: a join table `a_b` whose primary key is both sides' keys, each a
 *    foreign key that cascades on delete.
 *  - A relation to a table without a primary key can't be expressed: it is
 *    skipped with a note.
 */

import { displayName, type DataModel, type FieldType } from './dataModel'

export interface PlannedColumn {
  name: string
  type: FieldType
  notNull: boolean
  /** Added by a relation (not drawn on the board). */
  generated: boolean
}

export interface PlannedForeignKey {
  columns: string[]
  table: PlannedTable
  references: string[]
  onDelete?: 'CASCADE'
  /** Exactly one row on this side (1–1). */
  oneToOne: boolean
}

export interface PlannedTable {
  name: string
  columns: PlannedColumn[]
  primaryKey: string[]
  /** UNIQUE constraints (each a column list). */
  uniques: string[][]
  foreignKeys: PlannedForeignKey[]
  /** A join table made for a many-to-many relation. */
  join: boolean
}

export interface SchemaPlan {
  tables: PlannedTable[]
  /** Relations that couldn't be expressed, as human-readable notes. */
  notes: string[]
}

const IDENT_MAX = 63

/** Make `name` distinct from `taken` by adding _2, _3, … (kept within the identifier limit). */
function unique(name: string, taken: Set<string>): string {
  let base = name.slice(0, IDENT_MAX)
  let out = base
  for (let i = 2; taken.has(out); i++) {
    const suffix = `_${i}`
    base = name.slice(0, IDENT_MAX - suffix.length)
    out = `${base}${suffix}`
  }
  taken.add(out)
  return out
}

/** "users" → "user", "categories" → "category"; leaves "status", "address", "analysis" alone. */
export function singular(name: string): string {
  if (/ies$/i.test(name) && name.length > 3) return `${name.slice(0, -3)}y`
  if (/(ss|us|is)$/i.test(name)) return name
  if (/s$/i.test(name) && name.length > 1) return name.slice(0, -1)
  return name
}

export function planSchema(model: DataModel): SchemaPlan {
  const tableNames = new Set<string>()
  const notes: string[] = []
  const byEntity = new Map<string, PlannedTable>()
  const tables: PlannedTable[] = model.entities.map((e, i) => {
    const colNames = new Set<string>()
    const columns = e.fields.map((f, j) => ({
      name: unique(f.name || `column_${j + 1}`, colNames),
      type: f.type,
      notNull: f.required || f.pk,
      generated: false,
    }))
    const pkCount = e.fields.filter((f) => f.pk).length
    const t: PlannedTable = {
      name: unique(e.name || `table_${i + 1}`, tableNames),
      columns,
      primaryKey: columns.filter((_, j) => e.fields[j].pk).map((c) => c.name),
      // A lone primary key is unique already.
      uniques: columns.filter((_, j) => e.fields[j].unique && !(e.fields[j].pk && pkCount === 1)).map((c) => [c.name]),
      foreignKeys: [],
      join: false,
    }
    byEntity.set(e.id, t)
    return t
  })

  const keyColumns = (t: PlannedTable) => t.primaryKey.map((n) => t.columns.find((c) => c.name === n)!)

  for (const r of model.relations) {
    const parent = byEntity.get(r.from.id)!
    const child = byEntity.get(r.to.id)!
    const self = parent === child
    const parentKey = keyColumns(parent)
    const childKey = keyColumns(child)

    if (r.cardinality === 'n-n') {
      const missing = [parent, child].find((t) => !t.primaryKey.length)
      if (missing) {
        notes.push(
          `Skipped the many-to-many relation ${displayName(r.from)} → ${displayName(r.to)}: "${missing.name}" has no primary key.`,
        )
        continue
      }
      const cols = new Set<string>()
      const side = (t: PlannedTable, key: PlannedColumn[], prefix: string) =>
        key.map((k) => ({ name: unique(`${prefix}${singular(t.name)}_${k.name}`, cols), type: k.type, notNull: true, generated: true }))
      const a = side(parent, parentKey, '')
      const b = side(child, childKey, self ? 'related_' : '')
      const join: PlannedTable = {
        name: unique(`${parent.name}_${child.name}`, tableNames),
        columns: [...a, ...b],
        primaryKey: [...a, ...b].map((c) => c.name),
        uniques: [],
        foreignKeys: [],
        join: true,
      }
      join.foreignKeys.push(
        { columns: a.map((c) => c.name), table: parent, references: parent.primaryKey, onDelete: 'CASCADE', oneToOne: false },
        { columns: b.map((c) => c.name), table: child, references: child.primaryKey, onDelete: 'CASCADE', oneToOne: false },
      )
      tables.push(join)
      continue
    }

    if (!parent.primaryKey.length) {
      notes.push(
        `Skipped the relation ${displayName(r.from)} → ${displayName(r.to)}: "${parent.name}" has no primary key to reference.`,
      )
      continue
    }
    const taken = new Set(child.columns.map((c) => c.name))
    const used = new Set(child.foreignKeys.flatMap((fk) => fk.columns))
    const fkCols = parentKey.map((k) => {
      const want = `${self ? 'parent_' : ''}${singular(parent.name)}_${k.name}`.slice(0, IDENT_MAX)
      // Reuse a field the user drew for this (e.g. orders.user_id), unless another relation already uses it.
      const existing = child.columns.find((c) => c.name === want && !c.generated && !used.has(c.name))
      if (existing && !(self && child.primaryKey.includes(existing.name))) return existing.name
      const col: PlannedColumn = { name: unique(want, taken), type: k.type, notNull: false, generated: true }
      child.columns.push(col)
      return col.name
    })
    const oneToOne = r.cardinality === '1-1'
    if (oneToOne) {
      const same = (x: string[]) => x.length === fkCols.length && x.every((c) => fkCols.includes(c))
      if (!same(child.primaryKey) && !child.uniques.some(same)) child.uniques.push(fkCols)
    }
    child.foreignKeys.push({ columns: fkCols, table: parent, references: parent.primaryKey, oneToOne })
  }
  return { tables, notes }
}
