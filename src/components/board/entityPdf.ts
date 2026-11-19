/** Entity tables and relation end labels in the PDF picture of the board (canvas 2D). */

import { ENTITY_HEADER, ENTITY_ROW, cardinalityInfo, cardinalityOf, displayName, entityOf } from '@/spec/dataModel'
import { endLabelPoint, pathStart } from './relation'
import type { BoardShape } from './types'

/** The table's name, a rule under it, and one `PK name : type  req uniq` line per field. */
export function drawEntity(ctx: CanvasRenderingContext2D, s: BoardShape, font: string) {
  const e = entityOf(s)
  ctx.save()
  ctx.beginPath()
  ctx.rect(s.x, s.y, s.width, s.height)
  ctx.clip()
  ctx.fillStyle = '#0A0A0A'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `bold 16px ${font}`
  ctx.fillText(displayName(e), s.x + 12, s.y + ENTITY_HEADER / 2)
  ctx.fillRect(s.x, s.y + ENTITY_HEADER - 2, s.width, 2)
  ctx.font = `12px 'JetBrains Mono', monospace`
  e.fields.forEach((f, i) => {
    const y = s.y + ENTITY_HEADER + 4 + ENTITY_ROW * i + ENTITY_ROW / 2
    const marks = [!f.pk && f.required && 'REQ', !f.pk && f.unique && 'UNIQ'].filter(Boolean).join(' ')
    ctx.fillText(`${f.pk ? 'PK' : '  '} ${f.name || '(unnamed)'} : ${f.type}`, s.x + 12, y)
    if (marks) {
      ctx.textAlign = 'right'
      ctx.fillText(marks, s.x + s.width - 12, y)
      ctx.textAlign = 'left'
    }
  })
  ctx.restore()
}

/** "1" / "∗" at each end of a relation arrow. */
export function drawRelationEnds(
  ctx: CanvasRenderingContext2D,
  arrow: BoardShape,
  from: BoardShape,
  to: BoardShape,
  geo: { d: string; tip: { x: number; y: number } },
) {
  const start = pathStart(geo.d)
  if (!start) return
  const [a, b] = cardinalityInfo(cardinalityOf(arrow)).ends
  ctx.save()
  ctx.font = `bold 15px 'JetBrains Mono', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#FFFFFF'
  ctx.fillStyle = '#000000'
  for (const [text, p] of [
    [a, endLabelPoint(from, start)],
    [b, endLabelPoint(to, geo.tip)],
  ] as const) {
    ctx.strokeText(text, p.x, p.y)
    ctx.fillText(text, p.x, p.y)
  }
  ctx.restore()
}
