import { describe, expect, it } from 'vitest'
import type { BoardShape } from './types'
import { MAX_SIDE, boardBounds, fitText, jpegToPdf, renderSize } from './pdf'

const shape = (id: string, x: number, y: number, width: number, height: number, type = 'sticky', props = {}): BoardShape => ({
  id,
  type,
  x,
  y,
  width,
  height,
  props,
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
})

describe('boardBounds', () => {
  it('covers every shape, wherever it is', () => {
    const b = boardBounds([shape('a', -500, 100, 180, 180), shape('b', 2000, -300, 220, 120), shape('x', 0, 0, 0, 0, 'arrow', { from: 'a', to: 'b' })])
    expect(b).toEqual({ x: -500, y: -300, width: 2720, height: 580 })
  })

  it('is null for an empty board', () => {
    expect(boardBounds([])).toBeNull()
  })
})

describe('renderSize', () => {
  it('never upscales a small board', () => {
    expect(renderSize({ x: 0, y: 0, width: 300, height: 200 }).scale).toBe(1)
  })

  it('caps a huge board at MAX_SIDE on its longest side', () => {
    const r = renderSize({ x: 0, y: 0, width: 20_000, height: 5_000 })
    expect(Math.max(r.width, r.height)).toBe(MAX_SIDE)
    expect(r.scale).toBeLessThan(0.1)
  })
})

describe('jpegToPdf', () => {
  it('writes a one-page PDF with an exact xref table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
    const pdf = jpegToPdf(jpeg, 800, 600)
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/MediaBox [0 0 600 450]')
    expect(text).toContain('/Width 800 /Height 600')
    expect(text).toContain(`/Length ${jpeg.length}`)

    // Every xref offset points at its "n 0 obj" line, and startxref at "xref".
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(5)
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })
})

describe('fitText', () => {
  /** A canvas stand-in where each character is half the font size wide. */
  const fakeCtx = () => {
    const ctx = {
      font: '',
      measureText: (t: string) => ({ width: t.length * Number(/(\d+)px/.exec(ctx.font)![1]) * 0.5 }),
    }
    return ctx as unknown as CanvasRenderingContext2D
  }
  const box = { size: 16, weight: 'bold ', font: 'sans', width: 196, height: 40 }

  it('keeps every word by shrinking the font instead of dropping lines', () => {
    const ctx = fakeCtx()
    const { lines } = fitText(ctx, 'Digs through computers for spare parts', box)
    expect(lines.join(' ')).toBe('Digs through computers for spare parts')
    expect(ctx.font).not.toBe('bold 16px sans')
  })

  it('leaves text that already fits at its normal size', () => {
    const ctx = fakeCtx()
    expect(fitText(ctx, 'Initial Cutscene', box).lines).toEqual(['Initial Cutscene'])
    expect(ctx.font).toBe('bold 16px sans')
  })

  it('ends with an ellipsis only when even the smallest size cannot fit', () => {
    const { lines } = fitText(fakeCtx(), 'word '.repeat(200), { ...box, height: 30 })
    expect(lines.at(-1)!.endsWith('…')).toBe(true)
  })
})
