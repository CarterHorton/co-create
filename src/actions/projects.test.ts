import { describe, expect, it } from 'vitest'
import { parseId, parseProjectName } from './projects'
import { MAX_PROJECT_NAME_LENGTH } from '../schemas/projects-schema'

describe('parseProjectName', () => {
  it('trims and collapses whitespace', () => {
    expect(parseProjectName('  Q3   launch \n')).toBe('Q3 launch')
  })

  it('rejects empty, non-string and over-long names', () => {
    expect(parseProjectName('   ')).toEqual({ error: expect.any(String) })
    expect(parseProjectName(42)).toEqual({ error: expect.any(String) })
    expect(parseProjectName('x'.repeat(MAX_PROJECT_NAME_LENGTH))).toBe('x'.repeat(MAX_PROJECT_NAME_LENGTH))
    expect(parseProjectName('x'.repeat(MAX_PROJECT_NAME_LENGTH + 1))).toEqual({ error: expect.any(String) })
  })
})

describe('parseId', () => {
  it('accepts short non-empty strings only', () => {
    expect(parseId('abc')).toBe('abc')
    expect(parseId('')).toBeNull()
    expect(parseId('  ')).toBeNull()
    expect(parseId(null)).toBeNull()
    expect(parseId('x'.repeat(201))).toBeNull()
  })
})
