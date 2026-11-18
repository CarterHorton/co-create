/**
 * Board → one-page PDF of the whole board.
 *
 * The board is redrawn from its shapes onto a canvas (so the export covers
 * everything, not just what's on screen), at most MAX_SIDE px on its longest
 * side and never above 1 canvas px per board px — deliberately not high
 * resolution, so files stay small. The canvas becomes one JPEG, wrapped in a
 * minimal hand-written PDF: no PDF library needed.
 */

import { arrowBend, arrowGeometry, arrowRoute, shapeColors, shapeText } from './shapes'
import { drawEntity, drawRelationEnds } from './entityPdf'
import type { BoardShape } from './types'

/** Longest side of the rendered image, in px. */
export const MAX_SIDE = 1600
const JPEG_QUALITY = 0.8
const PAD = 40
const HEADER = 56

type Rect = { x: number; y: number; width: number; height: number }

/** World-space rectangle around every note, box, label and arrow handle. */
export function boardBounds(shapes: BoardShape[]): Rect | null {
  const byId = new Map(shapes.map((s) => [s.id, s]))
  const xs: number[] = []
  const ys: number[] = []
  for (const s of shapes) {
    if (s.type === 'arrow') {
      const from = byId.get(String(s.props.from))
      const to = byId.get(String(s.props.to))
      const h = from && to ? arrowGeometry(from, to, arrowRoute(s), arrowBend(s, from, to)).handle : undefined
      if (h) xs.push(h.x), ys.push(h.y)
      continue
    }
    xs.push(s.x, s.x + s.width)
    ys.push(s.y, s.y + s.height)
  }
  if (!xs.length) return null
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Canvas size and scale for a board of this size: capped, never upscaled. */
export function renderSize(bounds: Rect | null): { width: number; height: number; scale: number } {
  const w = (bounds?.width ?? 400) + PAD * 2
  const h = (bounds?.height ?? 200) + PAD * 2 + HEADER
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale }
}

/** Greedy word wrap; long words are broken by character. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= maxWidth) {
        line = next
        continue
      }
      if (line) lines.push(line)
      line = ''
      let rest = word
      while (ctx.measureText(rest).width > maxWidth && rest.length > 1) {
        let n = rest.length - 1
        while (n > 1 && ctx.measureText(rest.slice(0, n)).width > maxWidth) n--
        lines.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

/** Draw the whole board on a new canvas. Browser only. */
export function renderBoard(title: string, shapes: BoardShape[]): HTMLCanvasElement {
  const bounds = boardBounds(shapes)
  const { width, height, scale } = renderSize(bounds)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.scale(scale, scale)

  ctx.fillStyle = '#0A0A0A'
  ctx.font = `bold 24px ${font}`
  ctx.textBaseline = 'top'
  ctx.fillText(title.trim() || 'Untitled board', PAD, PAD - 8)

  if (!bounds) return canvas
  ctx.translate(PAD - bounds.x, PAD + HEADER - bounds.y)
  const byId = new Map(shapes.map((s) => [s.id, s]))

  // Arrows under the shapes, as on the board.
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineWidth = 2
  for (const a of shapes) {
    if (a.type !== 'arrow') continue
    const from = byId.get(String(a.props.from))
    const to = byId.get(String(a.props.to))
    if (!from || !to) continue
    const geo = arrowGeometry(from, to, arrowRoute(a), arrowBend(a, from, to))
    ctx.stroke(new Path2D(geo.d))
    const ang = Math.atan2(geo.tip.y - geo.tail.y, geo.tip.x - geo.tail.x)
    ctx.beginPath()
    ctx.moveTo(geo.tip.x, geo.tip.y)
    ctx.lineTo(geo.tip.x - 12 * Math.cos(ang - 0.45), geo.tip.y - 12 * Math.sin(ang - 0.45))
    ctx.lineTo(geo.tip.x - 12 * Math.cos(ang + 0.45), geo.tip.y - 12 * Math.sin(ang + 0.45))
    ctx.closePath()
    ctx.fill()
    if (from.type === 'entity' && to.type === 'entity') drawRelationEnds(ctx, a, from, to, geo)
  }

  for (const s of shapes) {
    if (s.type === 'arrow') continue
    const colors = shapeColors(s)
    if (s.type === 'sticky') {
      ctx.fillStyle = '#000000'
      ctx.fillRect(s.x + 4, s.y + 4, s.width, s.height) // hard shadow
      ctx.fillStyle = '#FFFFFF' // translucent sticky colors sit on white, not the shadow
      ctx.fillRect(s.x, s.y, s.width, s.height)
    }
    if (s.type !== 'text') {
      ctx.fillStyle = colors.background ?? '#FFFFFF'
      ctx.fillRect(s.x, s.y, s.width, s.height)
      ctx.strokeStyle = colors.borderColor ?? '#000000'
      ctx.lineWidth = s.type === 'box' ? 2 : 1
      const inset = ctx.lineWidth / 2
      ctx.strokeRect(s.x + inset, s.y + inset, s.width - inset * 2, s.height - inset * 2)
    }
    if (s.type === 'entity') {
      drawEntity(ctx, s, font)
      continue
    }

    const text = shapeText(s).trim()
    if (!text) continue
    const size = s.type === 'text' ? 20 : 16
    const lineH = Math.round(size * 1.35)
    const padX = s.type === 'sticky' ? 16 : s.type === 'box' ? 12 : 0
    const padY = s.type === 'sticky' ? 16 : s.type === 'box' ? 12 : 0
    ctx.font = `${s.type === 'sticky' ? '' : 'bold '}${size}px ${font}`
    ctx.fillStyle = colors.color ?? '#0A0A0A'
    ctx.textBaseline = 'top'
    const maxLines = Math.max(1, Math.floor((s.height - padY * 2) / lineH))
    const lines = wrap(ctx, text, Math.max(10, s.width - padX * 2)).slice(0, maxLines)
    ctx.save()
    ctx.beginPath()
    ctx.rect(s.x, s.y, s.width, s.height)
    ctx.clip()
    // Boxes center their text, like on the board.
    const top = s.type === 'box' ? s.y + (s.height - lines.length * lineH) / 2 : s.y + padY
    ctx.textAlign = s.type === 'box' ? 'center' : 'left'
    const x = s.type === 'box' ? s.x + s.width / 2 : s.x + padX
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH))
    ctx.restore()
  }
  return canvas
}

const enc = new TextEncoder()

/**
 * Wrap one baseline JPEG in a single-page PDF sized to it (1 px = 0.75 pt,
 * i.e. 96 dpi). Byte offsets in the xref table are exact.
 */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const pw = +(width * 0.75).toFixed(2)
  const ph = +(height * 0.75).toFixed(2)
  const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let size = 0
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b
    parts.push(bytes)
    size += bytes.length
  }
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = size
    push(`${n} 0 obj\n`)
    if (typeof body === 'string') push(body)
    else body()
    push('\nendobj\n')
  }

  push('%PDF-1.4\n%âãÏÓ\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  obj(4, () => {
    push(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    )
    push(jpeg)
    push('\nendstream')
  })
  obj(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)

  const xref = size
  push(`xref\n0 6\n0000000000 65535 f \n`)
  for (let n = 1; n <= 5; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Render the board and return it as a PDF blob. Browser only. */
export async function boardToPdf(title: string, shapes: BoardShape[]): Promise<Blob> {
  const canvas = renderBoard(title, shapes)
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the board'))), 'image/jpeg', JPEG_QUALITY),
  )
  const bytes = jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height)
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
