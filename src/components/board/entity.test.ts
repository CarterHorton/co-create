import { describe, expect, it } from 'vitest'
import { arrow, entity, f, shape } from '@/spec/dataModel.fixtures'
import { shapeName } from './a11y'
import { endLabelPoint, pathStart } from './relation'

describe('entity accessible names', () => {
  const users = entity('u', 'users', [f('id'), f('email'), f('name'), f('a'), f('b')])
  const orders = entity('o', 'orders', [f('id')])
  const note = shape('n', { type: 'sticky', props: { text: 'Checkout' } })
  const byId = new Map([users, orders, note].map((s) => [s.id, s]))

  it('names tables, relations and arrows to tables', () => {
    expect(shapeName(users, byId)).toBe('Entity users, 5 fields')
    expect(shapeName(arrow('r', 'u', 'o', 'n-n'), byId)).toBe('Relation from users to orders, many to many')
    expect(shapeName(arrow('x', 'n', 'u'), byId)).toBe('Arrow from “Checkout” to the users table')
  })
})

describe('relation end labels', () => {
  it('reads the start of a path', () => {
    expect(pathStart('M 10 20 L 30 40')).toEqual({ x: 10, y: 20 })
    expect(pathStart('M -5.5 1e-3 Q 1 2 3 4')).toEqual({ x: -5.5, y: 0.001 })
    expect(pathStart('')).toBeNull()
  })
  it('sits outside the shape, beside the line', () => {
    const s = shape('s', { x: 0, y: 0, width: 100, height: 100 })
    const p = endLabelPoint(s, { x: 100, y: 50 })
    expect(p.x).toBeGreaterThan(100)
    expect(p.y).not.toBe(50)
  })
})
