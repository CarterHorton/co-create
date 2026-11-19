import { describe, expect, it } from 'vitest'
import {
  cardinalityOf,
  cleanName,
  dataModelMarkdown,
  entityLabel,
  entitySize,
  fieldsOf,
  readDataModel,
  relationEnds,
  relationLabel,
} from './dataModel'
import { buildMarkdown, buildSections } from './buildSpec'
import { arrow, entity, f, shape } from './dataModel.fixtures'

describe('reading entity props', () => {
  it('sanitizes untrusted fields', () => {
    const s = shape('e', {
      props: { fields: [{ name: '  id\u0000 ', type: 'uuid', pk: true }, { name: 'x', type: 'varchar', required: 'yes' }, null, 'junk'] },
    })
    expect(fieldsOf(s)).toEqual([
      { name: 'id', type: 'uuid', pk: true, required: false, unique: false },
      { name: 'x', type: 'text', pk: false, required: false, unique: false },
    ])
  })
  it('caps name length and field count', () => {
    expect(cleanName('a'.repeat(100))).toHaveLength(63)
    const many = Array.from({ length: 150 }, (_, i) => f(`c${i}`))
    expect(fieldsOf(shape('e', { props: { fields: many } }))).toHaveLength(100)
  })
  it('defaults cardinality to one-to-many', () => {
    expect(cardinalityOf(arrow('a', 'x', 'y'))).toBe('1-n')
    expect(cardinalityOf(arrow('a', 'x', 'y', 'n-n'))).toBe('n-n')
    expect(cardinalityOf(arrow('a', 'x', 'y', 'bogus'))).toBe('1-n')
  })
})

describe('names', () => {
  it('names entities and relations for screen readers', () => {
    const users = entity('u', 'users', [f('id'), f('email'), f('name'), f('a'), f('b')])
    const orders = entity('o', 'orders', [f('id')])
    expect(entityLabel(users)).toBe('Entity users, 5 fields')
    expect(entityLabel(orders)).toBe('Entity orders, 1 field')
    expect(entityLabel(entity('z', '', []))).toBe('Entity untitled table, 0 fields')
    const a = arrow('a', 'u', 'o')
    expect(relationLabel(a, users, orders)).toBe('Relation from users to orders, one to many')
  })
  it('only treats arrows between two entities as relations', () => {
    const users = entity('u', 'users', [])
    const note = shape('n', { type: 'sticky', props: { text: 'hi' } })
    const byId = new Map([users, note].map((s) => [s.id, s]))
    expect(relationEnds(arrow('a', 'u', 'n'), byId)).toBeNull()
    expect(relationEnds(arrow('a', 'u', 'u'), byId)).not.toBeNull()
  })
})

describe('entitySize', () => {
  it('grows with the fields and keeps a wider chosen width', () => {
    const one = entitySize('t', [f('id')])
    const three = entitySize('t', [f('id'), f('a'), f('b')])
    expect(three.height).toBeGreaterThan(one.height)
    expect(entitySize('t', [], 400).width).toBe(400)
    expect(entitySize('t', [f('a_really_long_column_name_for_testing', 'timestamp')]).width).toBeGreaterThan(220)
  })
})

describe('data model in the spec', () => {
  const users = entity('u', 'users', [f('id', 'uuid', { pk: true }), f('email', 'text', { required: true, unique: true })])
  const orders = entity('o', 'orders', [f('id', 'int', { pk: true }), f('note|x')])
  const rel = arrow('r', 'u', 'o')

  it('reads entities and relations, ignoring other arrows', () => {
    const note = shape('n', { type: 'sticky', props: { text: 'hello' } })
    const model = readDataModel([users, orders, rel, note, arrow('x', 'n', 'u')])
    expect(model.entities.map((e) => e.name)).toEqual(['users', 'orders'])
    expect(model.relations).toHaveLength(1)
  })

  it('writes a table per entity and a relations list', () => {
    const md = dataModelMarkdown([users, orders, rel]).join('\n')
    expect(md).toContain('## Data model')
    expect(md).toContain('### users')
    expect(md).toContain('| email | text | — | yes | yes |')
    expect(md).toContain('| id | uuid | PK | yes | — |')
    expect(md).toContain('note\\|x')
    expect(md).toMatch(/- users 1 → ∗ orders \(one to many/)
  })

  it('is empty without entities', () => {
    expect(dataModelMarkdown([shape('n', { type: 'sticky', props: { text: 'x' } })])).toEqual([])
  })

  it('keeps entities out of note sections and appends the data model to the export', () => {
    const note = shape('n', { type: 'sticky', x: 2000, props: { text: 'Build the API' } })
    expect(buildSections([users, orders, rel, note]).map((s) => s.title)).toEqual(['Build the API'])
    const md = buildMarkdown('Shop', [users, orders, rel, note], { now: new Date('2026-01-01') })
    expect(md).toContain('1 section, 1 note, 0 connections')
    expect(md.trimEnd().endsWith('(one to many: each orders row references one users row)')).toBe(true)
    // A board with only tables still exports them.
    expect(buildMarkdown('Shop', [users], { now: new Date('2026-01-01') })).toContain('### users')
  })
})
