import { describe, expect, it } from 'vitest'
import { createWheelStepper, stepZoom } from './zoom'

describe('stepZoom', () => {
  it('moves in 25% steps', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1.25, 1)).toBe(1.5)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(0.5, -1)).toBe(0.25)
  })
  it('clamps to 25%–300%', () => {
    expect(stepZoom(0.25, -1)).toBe(0.25)
    expect(stepZoom(3, 1)).toBe(3)
  })
  it('snaps an off-grid zoom to the next round level', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
    expect(stepZoom(1.2000000001, -1)).toBe(1)
  })
})

describe('createWheelStepper', () => {
  it('turns one mouse notch into one step', () => {
    const step = createWheelStepper()
    expect(step(-100)).toBe(1)
    expect(step(100)).toBe(-1)
  })
  it('accumulates small trackpad deltas', () => {
    const step = createWheelStepper()
    expect([step(-10), step(-10), step(-10), step(-10), step(-10)]).toEqual([0, 0, 0, 0, 1])
  })
  it('starts over when the direction reverses', () => {
    const step = createWheelStepper()
    step(-40)
    expect(step(10)).toBe(0)
    expect(step(40)).toBe(-1)
  })
  it('handles line-based wheels (Firefox)', () => {
    expect(createWheelStepper()(3, 1)).toBe(-1)
  })
})
