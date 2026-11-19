import { describe, expect, it } from 'vitest'
import { canvasRoleFor, isBoardWriterRole } from './board-role'

describe('canvasRoleFor', () => {
  it('downgrades link viewers whatever their app role', () => {
    expect(canvasRoleFor('member', 'viewer')).toBe('viewer')
    expect(canvasRoleFor('admin', 'viewer')).toBe('viewer')
  })
  it('keeps the app role for owners and editors', () => {
    expect(canvasRoleFor('member', 'owner')).toBe('member')
    expect(canvasRoleFor('member', 'editor')).toBe('member')
  })
  it('never upgrades an app viewer, and fails closed without a role', () => {
    expect(canvasRoleFor('viewer', 'editor')).toBe('viewer')
    expect(canvasRoleFor(undefined, 'owner')).toBe('viewer')
    expect(canvasRoleFor('admin', null)).toBe('viewer')
  })
})

describe('isBoardWriterRole', () => {
  it('only viewer rows are read-only', () => {
    expect(isBoardWriterRole('viewer')).toBe(false)
    expect(isBoardWriterRole('editor')).toBe(true)
    expect(isBoardWriterRole('owner')).toBe(true)
    expect(isBoardWriterRole(undefined)).toBe(true)
  })
})
