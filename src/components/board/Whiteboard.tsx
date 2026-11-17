/**
 * Whiteboard — the collaborative canvas for one board.
 *
 * Storage-agnostic: it renders and edits whatever BoardStore it's given —
 * the synced CanvasRoom (useBoard, on /board/:id) or this browser's localStorage
 * (guest mode). Live cursors appear when a `presence` is passed. Everything is plain
 * DOM inside one transformed "world" layer; arrows are an SVG layer in the
 * same coordinate space.
 *
 * Controls: left-drag on empty space box-selects (Shift/Ctrl/⌘ adds); click or
 * Shift-click shapes to select; drag a selected shape to move the whole
 * selection. Middle mouse or Space+drag pans, wheel scrolls, Ctrl/⌘+wheel zooms
 * in 25% steps. Double-click empty space for a sticky, double-click a shape to
 * edit its text. With shapes selected, the bottom bar assigns them to a named
 * section. Delete removes the selection; ⌘Z / ⇧⌘Z undo/redo; ⌘A selects all.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getUserColor } from 'deepspace'
import {
  ArrowUpRight,
  CornerDownRight,
  FileDown,
  Group,
  Tag,
  Ungroup,
  Minus,
  Slash,
  Spline,
  MousePointer2,
  Plus,
  Redo2,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArrowRoute, BoardPresence, BoardShape, BoardStore, ShapeKind } from './types'
import { ExportDialog, type SpecPublisher } from './ExportDialog'
import { buildSections, clusterByProximity, sectionNameOf, subsectionNameOf } from '@/spec/buildSpec'
import { createWheelStepper, stepZoom } from './zoom'
import { Hint, KeyBadge, SHORTCUTS, type ShortcutId } from './shortcuts'
import {
  ARROW_ROUTES,
  DEFAULT_SIZE,
  MIN_SIZE,
  STICKY_COLORS,
  arrowBend,
  arrowGeometry,
  arrowRoute,
  shapeText,
  stickyColor,
  type StickyColor,
} from './shapes'

type Tool = 'select' | ShapeKind
interface Camera {
  x: number
  y: number
  zoom: number
}
type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | {
      kind: 'move'
      sx: number
      sy: number
      origins: { id: string; x: number; y: number }[]
      moved: boolean
      /** Clicked (not dragged) inside a multi-selection: narrow to this shape on release. */
      collapseTo?: string
    }
  | { kind: 'marquee'; wx: number; wy: number; base: string[] }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'bend'; id: string; sx: number; sy: number; ox: number; oy: number; axis: 'x' | 'y' | 'xy' }
/** What is being text-edited: an existing shape, or one we just asked the server to create. */
type Editing = { id: string } | { pending: { type: ShapeKind; x: number; y: number } } | null

const TOOLS: { id: Tool; label: string; shortcut: ShortcutId; Icon: typeof Square }[] = [
  { id: 'select', label: 'Select (drag to box-select)', shortcut: 'select', Icon: MousePointer2 },
  { id: 'sticky', label: 'Sticky note', shortcut: 'sticky', Icon: StickyNote },
  { id: 'box', label: 'Box', shortcut: 'box', Icon: Square },
  { id: 'text', label: 'Text', shortcut: 'text', Icon: Type },
  { id: 'arrow', label: 'Arrow (click two shapes)', shortcut: 'arrow', Icon: ArrowUpRight },
]
const ROUTE_SHORTCUT: Record<ArrowRoute, ShortcutId> = { straight: 'routeStraight', elbow: 'routeElbow', curve: 'routeCurve' }
/** Single-key shortcut → action. */
const keyOf = (id: ShortcutId) => SHORTCUTS[id][0].toLowerCase()

const ROUTE_ICONS: Record<ArrowRoute, typeof Square> = { straight: Slash, elbow: CornerDownRight, curve: Spline }


interface WhiteboardProps {
  store: BoardStore
  /** Board title, used for the exported Markdown. */
  title: string
  /** Live cursors + avatars; omit for single-user (guest) boards. */
  presence?: BoardPresence
  /** Status badge text when connected (overrides "Live" / "Live · view only"). */
  statusLabel?: string
  /** Lets the export dialog publish the spec for agents (signed-in boards). */
  publisher?: SpecPublisher
}

const NO_PEERS: BoardPresence['peers'] = []

export function Whiteboard({ store, title, presence, statusLabel, publisher }: WhiteboardProps) {
  const { shapes, canWrite, connected, addShape, deleteShape, move, resize, update, undo, redo } = store
  const batch = useCallback((fn: () => void) => (store.batch ? store.batch(fn) : fn()), [store])
  const peers = presence?.peers ?? NO_PEERS
  const updateState = presence?.updateState

  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<StickyColor>('white')
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [selected, setSelected] = useState<string[]>([])
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [arrowFrom, setArrowFrom] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [route, setRoute] = useState<ArrowRoute>('straight')
  const [exportOpen, setExportOpen] = useState(false)
  const [showSections, setShowSections] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const cursorFrame = useRef<number | null>(null)
  /** Set when this pointerdown created a shape, so the follow-up mousedown doesn't steal focus from its editor. */
  const justCreated = useRef(false)

  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])

  // A shape we just created arrives from the server with a fresh id; find it
  // by type + position so it opens straight into text editing.
  const editingId = useMemo(() => {
    if (!editing) return null
    if ('id' in editing) return byId.has(editing.id) ? editing.id : null
    const p = editing.pending
    return shapes.find((s) => s.type === p.type && s.x === p.x && s.y === p.y)?.id ?? null
  }, [editing, byId, shapes])
  /** Live selection (ids that still exist). */
  const selectedSet = useMemo(() => new Set(selected.filter((id) => byId.has(id))), [selected, byId])
  /** The single shape that single-shape controls act on (text edit, resize, arrow bend). */
  const activeId = editingId ?? (selectedSet.size === 1 ? [...selectedSet][0] : null)
  const active = activeId ? byId.get(activeId) : undefined
  const selectedShapes = useMemo(() => [...selectedSet].map((id) => byId.get(id)!), [selectedSet, byId])
  const setSelectedId = useCallback((id: string | null) => setSelected(id ? [id] : []), [])
  /** Section names on the board → the subsection names used in each (first spelling wins). */
  const sectionNames = useMemo(() => {
    const seen = new Map<string, { name: string; subs: Map<string, string> }>()
    for (const s of shapes) {
      const n = sectionNameOf(s)
      if (!n) continue
      if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), { name: n, subs: new Map() })
      const sub = subsectionNameOf(s)
      const subs = seen.get(n.toLowerCase())!.subs
      if (sub && !subs.has(sub.toLowerCase())) subs.set(sub.toLowerCase(), sub)
    }
    const sort = (xs: string[]) => xs.sort((a, b) => a.localeCompare(b))
    return new Map([...seen.values()].map((v) => [v.name, sort([...v.subs.values()])]))
  }, [shapes])
  const selectedNotes = selectedShapes.filter((x) => x.type !== 'arrow')
  const assignSection = (name: string | null, subsection: string | null = null) =>
    batch(() => {
      for (const x of selectedNotes) update(x.id, { section: name, subsection: name ? subsection : null })
    })

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewportRef.current?.getBoundingClientRect()
      return {
        x: (clientX - (r?.left ?? 0) - cam.x) / cam.zoom,
        y: (clientY - (r?.top ?? 0) - cam.y) / cam.zoom,
      }
    },
    [cam],
  )

  /** Step one 25% zoom level in (1) or out (-1), keeping the point under (clientX, clientY) fixed. */
  const zoomAt = useCallback((clientX: number, clientY: number, dir: 1 | -1) => {
    const r = viewportRef.current?.getBoundingClientRect()
    const px = clientX - (r?.left ?? 0)
    const py = clientY - (r?.top ?? 0)
    setCam((c) => {
      const zoom = stepZoom(c.zoom, dir)
      if (zoom === c.zoom) return c
      return { zoom, x: px - ((px - c.x) * zoom) / c.zoom, y: py - ((py - c.y) * zoom) / c.zoom }
    })
  }, [])

  // ── Create / delete ────────────────────────────────────────────────────

  const create = useCallback(
    (type: Exclude<ShapeKind, 'arrow'>, wx: number, wy: number) => {
      if (!canWrite) return
      const { width, height } = DEFAULT_SIZE[type]
      const x = Math.round(wx - width / 2)
      const y = Math.round(wy - height / 2)
      addShape({ type, x, y, width, height, props: { text: '', ...(type === 'sticky' ? { color } : {}) } })
      setEditing({ pending: { type, x, y } })
      setSelectedId(null)
      setTool('select')
    },
    [addShape, canWrite, color],
  )

  const removeMany = useCallback(
    (ids: Iterable<string>) => {
      const doomed = new Set(ids)
      // Arrows can't dangle: take any attached to a deleted shape with it.
      for (const s of shapes) {
        if (s.type === 'arrow' && (doomed.has(String(s.props.from)) || doomed.has(String(s.props.to)))) doomed.add(s.id)
      }
      const order = shapes.filter((s) => doomed.has(s.id))
      batch(() => {
        for (const s of [...order.filter((x) => x.type === 'arrow'), ...order.filter((x) => x.type !== 'arrow')]) deleteShape(s.id)
      })
      setSelected([])
      setEditing(null)
    },
    [shapes, deleteShape, batch],
  )

  /** Shapes touched by a world-space rectangle, plus arrows whose both ends are selected. */
  const hitTest = useCallback(
    (x0: number, y0: number, x1: number, y1: number, base: string[]) => {
      const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)]
      const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)]
      const ids = new Set(base)
      for (const s of shapes) {
        if (s.type !== 'arrow' && s.x < r && s.x + s.width > l && s.y < b && s.y + s.height > t) ids.add(s.id)
      }
      for (const s of shapes) {
        if (s.type === 'arrow' && ids.has(String(s.props.from)) && ids.has(String(s.props.to))) ids.add(s.id)
      }
      return [...ids]
    },
    [shapes],
  )

  const pickForArrow = useCallback(
    (id: string) => {
      if (!arrowFrom) return setArrowFrom(id)
      if (arrowFrom !== id) {
        addShape({ type: 'arrow', x: 0, y: 0, width: 0, height: 0, props: { from: arrowFrom, to: id, route } })
      }
      setArrowFrom(null)
      setTool('select')
    },
    [arrowFrom, addShape, route],
  )

  // ── Pointer handling ───────────────────────────────────────────────────

  function startPan(e: ReactPointerEvent) {
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
    setPanning(true)
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  function onBackgroundPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Middle mouse (or Space + left) pans, from anywhere — shapes let these bubble here.
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    setEditing(null)
    setArrowFrom(null)
    const w = toWorld(e.clientX, e.clientY)
    if (tool === 'sticky' || tool === 'box' || tool === 'text') {
      justCreated.current = true
      create(tool, w.x, w.y)
      return
    }
    // Left-drag on empty canvas: box-select. Shift/Ctrl/⌘ adds to the selection.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const base = additive ? [...selectedSet] : []
    setSelected(base)
    drag.current = { kind: 'marquee', wx: w.x, wy: w.y, base }
    setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onShapePointerDown(e: ReactPointerEvent, s: BoardShape) {
    if (e.button !== 0 || spaceHeld) return // let pans bubble to the viewport
    e.stopPropagation()
    if (editingId === s.id) return
    if (tool === 'arrow') {
      if (s.type !== 'arrow') pickForArrow(s.id)
      return
    }
    setEditing(null)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected((prev) => (prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]))
      return
    }
    const inSelection = selectedSet.has(s.id)
    const ids = inSelection ? [...selectedSet] : [s.id]
    if (!inSelection) setSelected([s.id])
    if (!canWrite) return
    const origins = ids
      .map((id) => byId.get(id))
      .filter((x): x is BoardShape => !!x && x.type !== 'arrow')
      .map((x) => ({ id: x.id, x: x.x, y: x.y }))
    if (!origins.length) return
    drag.current = {
      kind: 'move',
      sx: e.clientX,
      sy: e.clientY,
      origins,
      moved: false,
      collapseTo: inSelection && selectedSet.size > 1 ? s.id : undefined,
    }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  function onResizePointerDown(e: ReactPointerEvent, s: BoardShape) {
    e.stopPropagation()
    drag.current = { kind: 'resize', id: s.id, sx: e.clientX, sy: e.clientY, ow: s.width, oh: s.height }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  function onBendPointerDown(e: ReactPointerEvent, a: BoardShape, from: BoardShape, to: BoardShape, axis: 'x' | 'y' | 'xy') {
    e.stopPropagation()
    if (!canWrite) return
    const b = arrowBend(a, from, to)
    drag.current = { kind: 'bend', id: a.id, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, axis }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    broadcastCursor(e.clientX, e.clientY)
    const d = drag.current
    if (!d) return
    if (d.kind === 'marquee') {
      const w = toWorld(e.clientX, e.clientY)
      setMarquee({ x0: d.wx, y0: d.wy, x1: w.x, y1: w.y })
      setSelected(hitTest(d.wx, d.wy, w.x, w.y, d.base))
      return
    }
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.kind === 'pan') {
      setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy })
    } else if (d.kind === 'move') {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return
      d.moved = true
      for (const o of d.origins) move(o.id, Math.round(o.x + dx / cam.zoom), Math.round(o.y + dy / cam.zoom))
    } else if (d.kind === 'bend') {
      update(d.id, {
        bend: {
          x: d.axis === 'y' ? d.ox : Math.round(d.ox + dx / cam.zoom),
          y: d.axis === 'x' ? d.oy : Math.round(d.oy + dy / cam.zoom),
        },
      })
    } else {
      resize(
        d.id,
        Math.max(MIN_SIZE, Math.round(d.ow + dx / cam.zoom)),
        Math.max(MIN_SIZE, Math.round(d.oh + dy / cam.zoom)),
      )
    }
  }

  function onPointerUp() {
    const d = drag.current
    if (d?.kind === 'move' && !d.moved && d.collapseTo) setSelected([d.collapseTo])
    drag.current = null
    setPanning(false)
    setMarquee(null)
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!canWrite) return
    // A drag captures the pointer on the viewport, so a double-click on a shape
    // can arrive here instead of on the shape. Hit-test what's really under it.
    const hit = document.elementFromPoint(e.clientX, e.clientY)
    const shapeEl = hit?.closest<HTMLElement>('[data-shape-id]')
    if (shapeEl) {
      const id = shapeEl.dataset.shapeId!
      if (byId.get(id)?.type !== 'arrow') setEditing({ id })
      return
    }
    if (hit?.closest('[data-testid="board-arrow"]')) return
    const w = toWorld(e.clientX, e.clientY)
    create('sticky', w.x, w.y)
  }

  // Live cursors, throttled to one update per frame.
  const pendingCursor = useRef<{ x: number; y: number } | null>(null)
  function broadcastCursor(clientX: number, clientY: number) {
    pendingCursor.current = toWorld(clientX, clientY)
    if (cursorFrame.current !== null) return
    cursorFrame.current = requestAnimationFrame(() => {
      cursorFrame.current = null
      if (pendingCursor.current) updateState?.({ cursor: pendingCursor.current })
    })
  }

  // ── Wheel (needs a non-passive listener to preventDefault) ─────────────

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const wheelStep = createWheelStepper()
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const dir = wheelStep(e.deltaY, e.deltaMode)
        if (dir) zoomAt(e.clientX, e.clientY, dir)
      } else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /** Pick an arrow style; also restyles any selected arrows (resetting their bend). */
  const applyRoute = useCallback(
    (id: ArrowRoute) => {
      setRoute(id)
      for (const a of selectedShapes) if (a.type === 'arrow') update(a.id, { route: id, bend: null })
    },
    [selectedShapes, update],
  )

  const zoomAtCenter = useCallback(
    (dir: 1 | -1) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, dir)
    },
    [zoomAt],
  )

  // ── Keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelected(shapes.map((s) => s.id))
        return
      }
      if (mod) return
      if (e.key === ' ') {
        e.preventDefault()
        setSpaceHeld(true)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSet.size && canWrite) {
        e.preventDefault()
        removeMany(selectedSet)
        return
      }
      if (e.key === 'Escape') {
        setSelected([])
        setArrowFrom(null)
        setTool('select')
        return
      }
      if (e.key === 'Enter' && active && active.type !== 'arrow' && canWrite) {
        e.preventDefault()
        setEditing({ id: active.id })
        return
      }
      const k = e.key.toLowerCase()
      const hit = TOOLS.find((x) => keyOf(x.shortcut) === k)
      if (hit && (hit.id === 'select' || canWrite)) {
        setTool(hit.id)
        setArrowFrom(null)
        return
      }
      const routeHit = ARROW_ROUTES.find((r) => keyOf(ROUTE_SHORTCUT[r.id]) === k)
      if (routeHit && canWrite) return applyRoute(routeHit.id)
      if (k === keyOf('sections')) return setShowSections((v) => !v)
      if (k === keyOf('export')) return setExportOpen(true)
      if (e.key === '+' || e.key === '=') return zoomAtCenter(1)
      if (e.key === '-' || e.key === '_') return zoomAtCenter(-1)
      if (e.key === '0') return setCam({ x: 0, y: 0, zoom: 1 })
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false)
    }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [active, canWrite, removeMany, undo, redo, selectedSet, shapes, applyRoute, zoomAtCenter])

  useEffect(() => () => {
    if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  const arrows = shapes.filter((s) => s.type === 'arrow')
  const boxes = shapes.filter((s) => s.type !== 'arrow')
  const grid = 24 * cam.zoom

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* Toolbar */}
      <div
        role="toolbar"
        aria-label="Board tools"
        className="absolute left-4 top-4 z-20 flex items-center border border-foreground bg-background shadow-[4px_4px_0_0_#000]"
      >
        {TOOLS.map(({ id, label, shortcut, Icon }) => (
          <Hint key={id} label={label} shortcut={shortcut}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={tool === id}
            data-testid={`tool-${id}`}
            disabled={id !== 'select' && !canWrite}
            onClick={() => {
              setTool(id)
              setArrowFrom(null)
            }}
            className={cn(
              'relative flex size-10 items-center justify-center border-r border-border transition-colors disabled:opacity-30',
              tool === id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
            )}
          >
            <Icon className="size-4" />
            <KeyBadge shortcut={shortcut} />
          </button>
          </Hint>
        ))}
        <div className="flex items-center border-r border-border" role="group" aria-label="Arrow style">
          {ARROW_ROUTES.map(({ id, label }) => {
            const Icon = ROUTE_ICONS[id]
            const selArrows = selectedShapes.filter((x) => x.type === 'arrow')
            const current = selArrows.length ? arrowRoute(selArrows[0]) : route
            return (
              <Hint key={id} label={`${label} arrow`} shortcut={ROUTE_SHORTCUT[id]}>
              <button
                type="button"
                data-testid={`route-${id}`}
                aria-label={`${label} arrow`}
                aria-pressed={current === id}
                disabled={!canWrite}
                onClick={() => applyRoute(id)}
                className={cn(
                  'relative flex h-10 w-8 items-center justify-center transition-colors disabled:opacity-30',
                  current === id ? 'bg-royal/30' : 'hover:bg-royal/20',
                )}
              >
                <Icon className="size-4" />
                <KeyBadge shortcut={ROUTE_SHORTCUT[id]} />
              </button>
              </Hint>
            )
          })}
        </div>
        <div className="flex items-center gap-1 border-r border-border px-2" aria-label="Sticky color">
          {(Object.keys(STICKY_COLORS) as StickyColor[]).map((c) => {
            const selStickies = selectedShapes.filter((x) => x.type === 'sticky')
            const current = selStickies.length ? stickyColor(selStickies[0]) : color
            return (
              <Hint key={c} label={`${STICKY_COLORS[c].label} sticky`}>
              <button
                type="button"
                aria-label={`${STICKY_COLORS[c].label} sticky`}
                aria-pressed={current === c}
                disabled={!canWrite}
                onClick={() => {
                  setColor(c)
                  for (const st of selStickies) update(st.id, { color: c })
                }}
                className={cn(
                  'size-5 border border-foreground disabled:opacity-30',
                  current === c && 'outline outline-2 outline-offset-1 outline-royal/50',
                )}
                style={{ background: STICKY_COLORS[c].bg }}
              />
              </Hint>
            )
          })}
        </div>
        <ToolbarButton label="Undo" shortcut="undo" onClick={undo} disabled={!canWrite}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo" shortcut="redo" onClick={redo} disabled={!canWrite}>
          <Redo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Delete selected"
          shortcut="delete"
          onClick={() => removeMany(selectedSet)}
          disabled={!canWrite || !selectedSet.size}
          last
        >
          <Trash2 className="size-4" />
        </ToolbarButton>
      </div>

      {tool === 'arrow' && (
        <p className="absolute left-4 top-20 z-20 bg-foreground px-3 py-1 font-mono text-xs text-background">
          {arrowFrom ? 'Now click the shape it points to' : 'Click the shape the arrow starts from'}
        </p>
      )}

      {/* Status + presence */}
      {/* Second row on normal widths so it never collides with the toolbar; shares the top row on very wide screens. */}
      <div className="absolute right-4 top-[68px] z-20 flex items-center gap-3 min-[1600px]:top-4">
        <div className="flex -space-x-1">
          {peers.map((p) => (
            <span
              key={p.userId}
              title={p.userName}
              className="flex size-7 items-center justify-center border border-foreground text-xs font-bold text-white"
              style={{ background: getUserColor(p.userId) }}
            >
              {(p.userName?.[0] ?? '?').toUpperCase()}
            </span>
          ))}
        </div>
        <Hint label="Outline the sections the export will use" shortcut="sections">
        <button
          type="button"
          data-testid="toggle-sections"
          aria-pressed={showSections}
          onClick={() => setShowSections((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 border border-foreground px-2.5 py-1 text-xs font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#000]',
            showSections ? 'bg-foreground text-background' : 'bg-background hover:bg-royal/20',
          )}
        >
          <Group className="size-3.5" /> Sections
        </button>
        </Hint>
        <Hint label="Export the board as Markdown" shortcut="export">
        <button
          type="button"
          data-testid="export-md"
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1.5 border border-foreground bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#000] hover:bg-royal/20"
        >
          <FileDown className="size-3.5" /> Export .md
        </button>
        </Hint>
        <span
          data-testid="board-connection"
          className="flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground"
        >
          <span className={cn('size-1.5', connected ? 'bg-success' : 'animate-pulse bg-warning')} />
          {connected ? (statusLabel ?? (canWrite ? 'Live' : 'Live · view only')) : 'Connecting…'}
        </span>
      </div>

      {canWrite && selectedNotes.length > 0 && !editingId && (
        <SelectionBar
          key={selectedNotes.map((x) => x.id).join(',')}
          shapes={selectedNotes}
          sectionNames={sectionNames}
          onAssign={(name, sub) => assignSection(name, sub)}
          onUngroup={() => assignSection(null)}
          onDelete={() => removeMany(selectedSet)}
        />
      )}

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center border border-foreground bg-background">
        <ToolbarButton label="Zoom out" shortcut="zoomOut" side="top" onClick={() => zoomAtCenter(-1)}>
          <Minus className="size-4" />
        </ToolbarButton>
        <Hint label="Reset zoom to 100%" shortcut="zoomReset" side="top">
        <button
          type="button"
          aria-label="Reset zoom"
          data-testid="zoom-level"
          onClick={() => setCam({ x: 0, y: 0, zoom: 1 })}
          className="h-10 w-14 border-r border-border font-mono text-xs hover:bg-royal/20"
        >
          {Math.round(cam.zoom * 100)}%
        </button>
        </Hint>
        <ToolbarButton label="Zoom in" shortcut="zoomIn" side="top" onClick={() => zoomAtCenter(1)} last>
          <Plus className="size-4" />
        </ToolbarButton>
      </div>

      {shapes.length === 0 && connected && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 z-10 text-center font-mono text-sm text-muted-foreground">
          Double-click anywhere to add a sticky note
        </p>
      )}

      {/* Viewport */}
      <div
        ref={viewportRef}
        data-testid="board-viewport"
        className={cn(
          'absolute inset-0 touch-none select-none',
          panning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
        )}
        style={{
          backgroundImage: 'radial-gradient(circle, #d4d4d4 1px, transparent 1px)',
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={onBackgroundPointerDown}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault() // no browser autoscroll on middle-drag
          // The new shape's text box was focused during pointerdown; the
          // mousedown's default focus change would blur (and close) it.
          if (justCreated.current) {
            justCreated.current = false
            e.preventDefault()
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => updateState?.({ cursor: null })}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}
        >
          {/* Arrows */}
          <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1}>
            <defs>
              <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#000" />
              </marker>
              <marker id="arrowhead-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#4169E1" fillOpacity={0.5} />
              </marker>
            </defs>
            {arrows.map((a) => {
              const from = byId.get(String(a.props.from))
              const to = byId.get(String(a.props.to))
              if (!from || !to) return null
              const geo = arrowGeometry(from, to, arrowRoute(a), arrowBend(a, from, to))
              const isActive = selectedSet.has(a.id)
              const hs = 10 / cam.zoom
              return (
                <g key={a.id} data-testid="board-arrow" data-route={arrowRoute(a)}>
                  <path d={geo.d} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" onPointerDown={(e) => onShapePointerDown(e, a)} />
                  <path
                    d={geo.d}
                    fill="none"
                    stroke={isActive ? 'rgba(65,105,225,0.5)' : '#000'}
                    strokeWidth={2}
                    strokeLinejoin="miter"
                    markerEnd={`url(#${isActive ? 'arrowhead-active' : 'arrowhead'})`}
                    pointerEvents="none"
                  />
                  {a.id === activeId && canWrite && geo.handle && geo.axis && (
                    <rect
                      data-testid="arrow-bend-handle"
                      x={geo.handle.x - hs / 2}
                      y={geo.handle.y - hs / 2}
                      width={hs}
                      height={hs}
                      fill="#fff"
                      stroke="#000"
                      strokeWidth={1.5 / cam.zoom}
                      className={geo.axis === 'x' ? 'cursor-ew-resize' : geo.axis === 'y' ? 'cursor-ns-resize' : 'cursor-move'}
                      onPointerDown={(e) => onBendPointerDown(e, a, from, to, geo.axis!)}
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {showSections && <SectionsOverlay shapes={shapes} zoom={cam.zoom} />}

          {/* Shapes */}
          {boxes.map((s) => (
            <ShapeView
              key={s.id}
              shape={s}
              selected={selectedSet.has(s.id)}
              showHandles={s.id === activeId}
              showSectionTag={!showSections}
              arrowSource={s.id === arrowFrom}
              editing={s.id === editingId}
              canWrite={canWrite}
              onPointerDown={(e) => onShapePointerDown(e, s)}
              onResizePointerDown={(e) => onResizePointerDown(e, s)}
              onStartEdit={() => canWrite && setEditing({ id: s.id })}
              onSave={(text) => update(s.id, { text })}
              onDone={() => {
                setEditing(null)
                setSelectedId(s.id)
              }}
            />
          ))}

          {marquee && (
            <div
              data-testid="marquee"
              className="pointer-events-none absolute border border-dashed border-royal/50 bg-royal/10"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {/* Other people's cursors */}
          {peers.map((p) => {
            const c = p.state.cursor as { x: number; y: number } | null | undefined
            if (!c) return null
            const col = getUserColor(p.userId)
            return (
              <div
                key={p.userId}
                data-testid="peer-cursor"
                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${1 / cam.zoom})` }}
              >
                <MousePointer2 className="size-5" style={{ color: col, fill: col }} />
                <span className="ml-4 whitespace-nowrap px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: col }}>
                  {p.userName}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {exportOpen && (
        <ExportDialog title={title} shapes={shapes} publisher={publisher} onClose={() => setExportOpen(false)} />
      )}
    </div>
  )

}

function ToolbarButton({
  label,
  shortcut,
  side,
  onClick,
  disabled,
  last,
  children,
}: {
  label: string
  shortcut?: ShortcutId
  side?: 'top' | 'bottom'
  onClick: () => void
  disabled?: boolean
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <Hint label={label} shortcut={shortcut} side={side}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex size-10 items-center justify-center transition-colors hover:bg-royal/20 disabled:opacity-30 disabled:hover:bg-transparent',
          !last && 'border-r border-border',
        )}
      >
        {children}
      </button>
    </Hint>
  )
}

interface ShapeViewProps {
  shape: BoardShape
  selected: boolean
  /** Show the resize handle (single selection only). */
  showHandles: boolean
  /** Show the shape's section-name tag (hidden while the Sections overlay labels them). */
  showSectionTag: boolean
  arrowSource: boolean
  editing: boolean
  canWrite: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onResizePointerDown: (e: ReactPointerEvent) => void
  onStartEdit: () => void
  /** Persist the text (also called when editing ends by clicking elsewhere). */
  onSave: (text: string) => void
  /** Leave edit mode, keeping the shape selected (Enter / Escape / blur). */
  onDone: () => void
}

function ShapeView({
  shape: s,
  selected,
  showHandles,
  showSectionTag,
  arrowSource,
  editing,
  canWrite,
  onPointerDown,
  onResizePointerDown,
  onStartEdit,
  onSave,
  onDone,
}: ShapeViewProps) {
  const text = shapeText(s)
  const sticky = s.type === 'sticky' ? STICKY_COLORS[stickyColor(s)] : null

  return (
    <div
      data-testid={`shape-${s.type}`}
      data-shape-id={s.id}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit()
      }}
      className={cn(
        'absolute flex',
        s.type === 'sticky' && 'items-start p-4 shadow-[4px_4px_0_0_#000] border border-foreground',
        s.type === 'box' && 'items-center justify-center border-2 border-foreground bg-background p-3 text-center',
        s.type === 'text' && 'items-start',
        canWrite && !editing ? 'cursor-move' : '',
        (selected || arrowSource) && 'outline outline-2 outline-offset-4 outline-royal/50',
      )}
      style={{
        left: s.x,
        top: s.y,
        width: s.width,
        height: s.height,
        background: sticky?.bg,
        color: sticky?.fg,
      }}
    >
      {editing ? (
        <EditText
          initial={text}
          className={cn(s.type === 'box' && 'text-center', s.type === 'text' && 'text-xl font-bold')}
          onSave={onSave}
          onDone={onDone}
        />
      ) : (
        <p
          className={cn(
            'w-full overflow-hidden whitespace-pre-wrap break-words leading-snug',
            s.type === 'sticky' && 'text-base',
            s.type === 'box' && 'text-base font-bold',
            s.type === 'text' && 'text-xl font-bold',
            !text && 'opacity-40',
          )}
        >
          {text || (canWrite ? 'Double-click to write' : '')}
        </p>
      )}
      {showSectionTag && sectionNameOf(s) && (
        <span
          data-testid="shape-section-tag"
          className="pointer-events-none absolute bottom-full left-0 mb-1.5 max-w-full truncate border border-royal/50 bg-background px-1 font-mono text-[10px] leading-4 text-foreground"
        >
          {sectionNameOf(s)}
          {subsectionNameOf(s) && ` › ${subsectionNameOf(s)}`}
        </span>
      )}
      {showHandles && canWrite && !editing && (
        <div
          role="presentation"
          onPointerDown={onResizePointerDown}
          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize border border-foreground bg-background"
        />
      )}
    </div>
  )
}

/**
 * Text editor for a shape. Whatever is typed is saved however editing ends:
 * Enter (Shift+Enter adds a line), Escape, blur, or the editor being removed
 * because the user clicked another shape or the canvas. That last case
 * matters: the click ends editing during pointerdown, which unmounts the
 * textarea before the browser's blur would fire.
 */
function EditText({
  initial,
  className,
  onSave,
  onDone,
}: {
  initial: string
  className?: string
  onSave: (text: string) => void
  onDone: () => void
}) {
  const [value, setValue] = useState(initial)
  const latest = useRef(initial)
  const saved = useRef(initial)
  const saveRef = useRef(onSave)
  useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  const flush = useCallback(() => {
    if (latest.current === saved.current) return
    saved.current = latest.current
    saveRef.current(latest.current)
  }, [])

  // Save on unmount (click-away), not only on blur.
  useEffect(() => flush, [flush])

  const finish = () => {
    flush()
    onDone()
  }

  return (
    <textarea
      data-testid="shape-editor"
      autoFocus
      value={value}
      onChange={(e) => {
        latest.current = e.target.value
        setValue(e.target.value)
      }}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={finish}
      onKeyDown={(e) => {
        // Enter finishes; Shift+Enter is a new line. Leave IME composition alone.
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault()
          finish()
        }
      }}
      className={cn(
        'h-full w-full resize-none bg-transparent leading-snug text-inherit outline-none placeholder:text-current placeholder:opacity-40',
        className,
      )}
      placeholder="Type… (Enter to finish, Shift+Enter for a new line)"
    />
  )
}

/**
 * Outlines each section exactly as the Markdown export will group and number
 * it, so people can arrange the board before exporting.
 */
function SectionsOverlay({ shapes, zoom }: { shapes: BoardShape[]; zoom: number }) {
  const sections = useMemo(() => buildSections(shapes), [shapes])
  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])
  const pad = 16
  return (
    <>
      {sections.map((sec) => {
        const members = [...sec.ids].map((id) => byId.get(id)).filter((s): s is BoardShape => !!s)
        // A named section can be spread across the board: one outline per clump
        // (a looser gap than proximity grouping, so a cluster you picked stays one box).
        const clumps = sec.assigned ? clusterByProximity(members, 200) : [members]
        return clumps.map((clump, i) => {
          if (!clump.length) return null
          const x = Math.min(...clump.map((s) => s.x)) - pad
          const y = Math.min(...clump.map((s) => s.y)) - pad
          const w = Math.max(...clump.map((s) => s.x + s.width)) - x + pad
          const h = Math.max(...clump.map((s) => s.y + s.height)) - y + pad
          return (
            <div
              key={`${sec.anchor}:${i}`}
              data-testid="section-outline"
              data-section={sec.title}
              className={cn(
                'pointer-events-none absolute border-2 border-dashed border-royal/50',
                sec.assigned ? 'bg-royal/10' : 'bg-royal/5',
              )}
              style={{ left: x, top: y, width: w, height: h }}
            >
              <span
                className="absolute left-0 origin-bottom-left whitespace-nowrap bg-foreground px-1.5 py-0.5 font-mono text-xs font-semibold text-background"
                style={{ bottom: '100%', transform: `scale(${1 / zoom})` }}
              >
                {sec.index}. {sec.title}
              </span>
            </div>
          )
        })
      })}
      {sections.flatMap((sec) =>
        sec.subsections.flatMap((sub) => {
          const members = [...sub.ids].map((id) => byId.get(id)).filter((s): s is BoardShape => !!s)
          return clusterByProximity(members, 200).map((clump, i) => {
            const subPad = pad / 2
            const x = Math.min(...clump.map((s) => s.x)) - subPad
            const y = Math.min(...clump.map((s) => s.y)) - subPad
            const w = Math.max(...clump.map((s) => s.x + s.width)) - x + subPad
            const h = Math.max(...clump.map((s) => s.y + s.height)) - y + subPad
            return (
              <div
                key={`${sec.anchor}/${sub.anchor}:${i}`}
                data-testid="subsection-outline"
                data-subsection={sub.title}
                className="pointer-events-none absolute border border-dashed border-foreground/60"
                style={{ left: x, top: y, width: w, height: h }}
              >
                <span
                  className="absolute right-0 origin-bottom-right whitespace-nowrap border border-foreground bg-background px-1 py-px font-mono text-[11px] font-semibold"
                  style={{ bottom: '100%', transform: `scale(${1 / zoom})` }}
                >
                  {sec.index}.{sub.index} {sub.title}
                </span>
              </div>
            )
          })
        }),
      )}
    </>
  )
}

/**
 * Floating bar for the current selection: name a section (and optionally a
 * subsection within it, e.g. Front-end › Login page) and assign the selected
 * shapes to it (they become one section in the export, wherever they sit),
 * remove them from their section, or delete them.
 */
function SelectionBar({
  shapes,
  sectionNames,
  onAssign,
  onUngroup,
  onDelete,
}: {
  shapes: BoardShape[]
  /** Section name → subsection names already used in it. */
  sectionNames: Map<string, string[]>
  onAssign: (name: string, subsection: string | null) => void
  onUngroup: () => void
  onDelete: () => void
}) {
  const current = new Set(shapes.map(sectionNameOf))
  const currentSub = new Set(shapes.map(subsectionNameOf))
  const [name, setName] = useState(current.size === 1 ? [...current][0] : '')
  const [sub, setSub] = useState(current.size === 1 && currentSub.size === 1 ? [...currentSub][0] : '')
  const anyAssigned = shapes.some((x) => sectionNameOf(x))
  const subNames = [...sectionNames].find(([n]) => n.toLowerCase() === name.trim().toLowerCase())?.[1] ?? []
  const assign = () => {
    if (name.trim()) onAssign(name.trim(), sub.trim() || null)
  }
  const field = 'h-8 border border-input bg-background px-2 text-sm outline-none focus-visible:border-royal/50'
  return (
    <div
      data-testid="selection-bar"
      className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-13rem)] flex-wrap items-center gap-2 border border-foreground bg-background p-1.5 shadow-[4px_4px_0_0_#000]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span data-testid="selection-count" className="whitespace-nowrap px-1.5 font-mono text-xs font-semibold">
        {shapes.length} selected
      </span>
      <form
        className="flex flex-wrap items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          assign()
        }}
      >
        <Tag className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          data-testid="section-name-input"
          aria-label="Section name"
          list="board-section-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Section, e.g. Front-end"
          maxLength={80}
          className={cn(field, 'w-40')}
        />
        <datalist id="board-section-names">
          {[...sectionNames.keys()].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <span aria-hidden className="font-mono text-xs text-muted-foreground">
          ›
        </span>
        <input
          data-testid="subsection-name-input"
          aria-label="Subsection name (optional)"
          list="board-subsection-names"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          disabled={!name.trim()}
          placeholder="Subsection (optional)"
          maxLength={80}
          className={cn(field, 'w-40 disabled:opacity-40')}
        />
        <datalist id="board-subsection-names">
          {subNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button
          type="submit"
          data-testid="section-assign"
          disabled={!name.trim()}
          className="h-8 bg-foreground px-3 text-xs font-bold uppercase tracking-[0.05em] text-background disabled:opacity-30"
        >
          Assign
        </button>
      </form>
      {anyAssigned && (
        <Hint label="Remove from its section (groups by position again)" side="top">
        <button
          type="button"
          data-testid="section-remove"
          onClick={onUngroup}
          className="flex h-8 items-center gap-1 border border-foreground px-2 text-xs font-bold uppercase tracking-[0.05em] hover:bg-royal/20"
        >
          <Ungroup className="size-3.5" /> Ungroup
        </button>
        </Hint>
      )}
      <Hint label="Delete selected" shortcut="delete" side="top">
      <button
        type="button"
        data-testid="selection-delete"
        aria-label="Delete selected"
        onClick={onDelete}
        className="flex size-8 items-center justify-center border border-foreground hover:bg-royal/20"
      >
        <Trash2 className="size-3.5" />
      </button>
      </Hint>
    </div>
  )
}
