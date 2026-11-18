/** Shapes for the data-model tests. */
import type { BoardShape } from '@/components/board/types'
import type { EntityField } from './dataModel'

let t = 0
export const shape = (id: string, extra: Partial<BoardShape> = {}): BoardShape => ({
  id,
  type: 'entity',
  x: 0,
  y: 0,
  width: 220,
  height: 100,
  props: {},
  createdBy: 'u',
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString(),
  updatedAt: '',
  ...extra,
})
export const f = (name: string, type: EntityField['type'] = 'text', o: Partial<EntityField> = {}): EntityField => ({
  name,
  type,
  pk: false,
  required: false,
  unique: false,
  ...o,
})
export const entity = (id: string, name: string, fields: EntityField[], extra: Partial<BoardShape> = {}) =>
  shape(id, { props: { name, fields }, ...extra })
export const arrow = (id: string, from: string, to: string, cardinality?: string) =>
  shape(id, { type: 'arrow', props: { from, to, ...(cardinality ? { cardinality } : {}) } })
