/**
 * Whiteboard — the collaborative canvas for one board.
 *
 * Storage-agnostic: it renders and edits whatever BoardStore it's given —
 * the synced CanvasRoom (CloudWhiteboard) or this browser's localStorage
 * (guest mode). Live cursors appear when a `presence` is passed. Everything is plain
 * DOM inside one transformed "world" layer; arrows are an SVG layer in the
 * same coordinate space.
 *
 * Controls: drag empty space to pan, ctrl/⌘ + wheel (or pinch) to zoom, wheel
 * to scroll. Double-click empty space for a sticky, double-click a shape to
 * edit its text. V/S/B/T/A pick tools, Delete removes, ⌘Z / ⇧⌘Z undo/redo.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getUserColor } from 'deepspace'
import {
  ArrowUpRight,
  CornerDownRight,
  FileDown,
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
import { ExportDialog } from './ExportDialog'
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
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'bend'; id: string; sx: number; sy: number; ox: number; oy: number; axis: 'x' | 'y' | 'xy' }
/** What is being text-edited: an existing shape, or one we just asked the server to create. */
type Editing = { id: string } | { pending: { type: ShapeKind; x: number; y: number } } | null

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof Square }[] = [
  { id: 'select', label: 'Select / pan', key: 'v', Icon: MousePointer2 },
  { id: 'sticky', label: 'Sticky note', key: 's', Icon: StickyNote },
  { id: 'box', label: 'Box', key: 'b', Icon: Square },
  { id: 'text', label: 'Text', key: 't', Icon: Type },
  { id: 'arrow', label: 'Arrow — click two shapes', key: 'a', Icon: ArrowUpRight },
]

const ROUTE_ICONS: Record<ArrowRoute, typeof Square> = { straight: Slash, elbow: CornerDownRight, curve: Spline }

const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

interface WhiteboardProps {
  store: BoardStore
  /** Board title, used for the exported Markdown. */
  title: string
  /** Live cursors + avatars; omit for single-user (guest) boards. */
  presence?: BoardPresence
  /** Status badge text when connected, e.g. "Live" or "Saved in this browser". */
  statusLabel?: string
}

const NO_PEERS: BoardPresence['peers'] = []

export function Whiteboard({ store, title, presence, statusLabel }: WhiteboardProps) {
  const { shapes, canWrite, connected, addShape, deleteShape, move, resize, update, undo, redo } = store
  const peers = presence?.peers ?? NO_PEERS
  const updateState = presence?.updateState

  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<StickyColor>('white')
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [arrowFrom, setArrowFrom] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [route, setRoute] = useState<ArrowRoute>('straight')
  const [exportOpen, setExportOpen] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const cursorFrame = useRef<number | null>(null)

  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])

  // A shape we just created arrives from the server with a fresh id; find it
  // by type + position so it opens straight into text editing.
  const editingId = useMemo(() => {
    if (!editing) return null
    if ('id' in editing) return byId.has(editing.id) ? editing.id : null
    const p = editing.pending
    return shapes.find((s) => s.type === p.type && s.x === p.x && s.y === p.y)?.id ?? null
  }, [editing, byId, shapes])
  const activeId = editingId ?? (selectedId && byId.has(selectedId) ? selectedId : null)
  const active = activeId ? byId.get(activeId) : undefined

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

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const r = viewportRef.current?.getBoundingClientRect()
    const px = clientX - (r?.left ?? 0)
    const py = clientY - (r?.top ?? 0)
    setCam((c) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor))
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

  const remove = useCallback(
    (id: string) => {
      // Arrows can't dangle: take any attached to this shape with it.
      for (const s of shapes) {
        if (s.type === 'arrow' && (s.props.from === id || s.props.to === id)) deleteShape(s.id)
      }
      deleteShape(id)
      setSelectedId(null)
      setEditing(null)
    },
    [shapes, deleteShape],
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

  function onBackgroundPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.button !== 1) return
    setEditing(null)
    setSelectedId(null)
    setArrowFrom(null)
    if (e.button === 0 && (tool === 'sticky' || tool === 'box' || tool === 'text')) {
      const w = toWorld(e.clientX, e.clientY)
      create(tool, w.x, w.y)
      return
    }
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
    setPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onShapePointerDown(e: ReactPointerEvent, s: BoardShape) {
    if (e.button !== 0) return
    e.stopPropagation()
    if (editingId === s.id) return
    if (tool === 'arrow') {
      if (s.type !== 'arrow') pickForArrow(s.id)
      return
    }
    setEditing(null)
    setSelectedId(s.id)
    if (!canWrite || s.type === 'arrow') return
    drag.current = { kind: 'move', id: s.id, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, moved: false }
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
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.kind === 'pan') {
      setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy })
    } else if (d.kind === 'move') {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return
      d.moved = true
      move(d.id, Math.round(d.ox + dx / cam.zoom), Math.round(d.oy + dy / cam.zoom))
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
    drag.current = null
    setPanning(false)
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!canWrite) return
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
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

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
      if (mod) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeId && canWrite) {
        e.preventDefault()
        remove(activeId)
        return
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
        setArrowFrom(null)
        setTool('select')
        return
      }
      if (e.key === 'Enter' && active && active.type !== 'arrow' && canWrite) {
        e.preventDefault()
        setEditing({ id: active.id })
        return
      }
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (hit && (hit.id === 'select' || canWrite)) {
        setTool(hit.id)
        setArrowFrom(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, active, canWrite, remove, undo, redo])

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
        className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center border border-foreground bg-background shadow-[4px_4px_0_0_#000]"
      >
        {TOOLS.map(({ id, label, key, Icon }) => (
          <button
            key={id}
            type="button"
            title={`${label} (${key.toUpperCase()})`}
            aria-label={label}
            aria-pressed={tool === id}
            data-testid={`tool-${id}`}
            disabled={id !== 'select' && !canWrite}
            onClick={() => {
              setTool(id)
              setArrowFrom(null)
            }}
            className={cn(
              'flex size-10 items-center justify-center border-r border-border transition-colors disabled:opacity-30',
              tool === id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
        <div className="flex items-center border-r border-border" role="group" aria-label="Arrow style">
          {ARROW_ROUTES.map(({ id, label }) => {
            const Icon = ROUTE_ICONS[id]
            const current = active?.type === 'arrow' ? arrowRoute(active) : route
            return (
              <button
                key={id}
                type="button"
                data-testid={`route-${id}`}
                title={`${label} arrow`}
                aria-label={`${label} arrow`}
                aria-pressed={current === id}
                disabled={!canWrite}
                onClick={() => {
                  setRoute(id)
                  // Switching style resets the bend to that style's default.
                  if (active?.type === 'arrow') update(active.id, { route: id, bend: null })
                }}
                className={cn(
                  'flex h-10 w-8 items-center justify-center transition-colors disabled:opacity-30',
                  current === id ? 'bg-royal/30' : 'hover:bg-royal/20',
                )}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1 border-r border-border px-2" aria-label="Sticky color">
          {(Object.keys(STICKY_COLORS) as StickyColor[]).map((c) => {
            const current = active?.type === 'sticky' ? stickyColor(active) : color
            return (
              <button
                key={c}
                type="button"
                title={`${STICKY_COLORS[c].label} sticky`}
                aria-label={`${STICKY_COLORS[c].label} sticky`}
                aria-pressed={current === c}
                disabled={!canWrite}
                onClick={() => {
                  setColor(c)
                  if (active?.type === 'sticky') update(active.id, { color: c })
                }}
                className={cn(
                  'size-5 border border-foreground disabled:opacity-30',
                  current === c && 'outline outline-2 outline-offset-1 outline-royal/50',
                )}
                style={{ background: STICKY_COLORS[c].bg }}
              />
            )
          })}
        </div>
        <ToolbarButton label="Undo (⌘Z)" onClick={undo} disabled={!canWrite}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo (⇧⌘Z)" onClick={redo} disabled={!canWrite}>
          <Redo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Delete (Del)"
          onClick={() => activeId && remove(activeId)}
          disabled={!canWrite || !activeId}
          last
        >
          <Trash2 className="size-4" />
        </ToolbarButton>
      </div>

      {tool === 'arrow' && (
        <p className="absolute left-1/2 top-20 z-20 -translate-x-1/2 bg-foreground px-3 py-1 font-mono text-xs text-background">
          {arrowFrom ? 'Now click the shape it points to' : 'Click the shape the arrow starts from'}
        </p>
      )}

      {/* Status + presence */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
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
        <button
          type="button"
          data-testid="export-md"
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1.5 border border-foreground bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#000] hover:bg-royal/20"
        >
          <FileDown className="size-3.5" /> Export .md
        </button>
        <span
          data-testid="board-connection"
          className="flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground"
        >
          <span className={cn('size-1.5', connected ? 'bg-success' : 'animate-pulse bg-warning')} />
          {connected ? (canWrite ? (statusLabel ?? 'Live') : 'Live · view only') : 'Connecting…'}
        </span>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center border border-foreground bg-background">
        <ToolbarButton label="Zoom out" onClick={() => zoomAtCenter(1 / 1.2)}>
          <Minus className="size-4" />
        </ToolbarButton>
        <button
          type="button"
          title="Reset zoom"
          onClick={() => setCam({ x: 0, y: 0, zoom: 1 })}
          className="h-10 w-14 border-r border-border font-mono text-xs hover:bg-royal/20"
        >
          {Math.round(cam.zoom * 100)}%
        </button>
        <ToolbarButton label="Zoom in" onClick={() => zoomAtCenter(1.2)} last>
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
          tool === 'select' ? (panning ? 'cursor-grabbing' : 'cursor-default') : 'cursor-crosshair',
        )}
        style={{
          backgroundImage: 'radial-gradient(circle, #d4d4d4 1px, transparent 1px)',
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={onBackgroundPointerDown}
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
              const isActive = a.id === activeId
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
                  {isActive && canWrite && geo.handle && geo.axis && (
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

          {/* Shapes */}
          {boxes.map((s) => (
            <ShapeView
              key={s.id}
              shape={s}
              selected={s.id === activeId}
              arrowSource={s.id === arrowFrom}
              editing={s.id === editingId}
              canWrite={canWrite}
              onPointerDown={(e) => onShapePointerDown(e, s)}
              onResizePointerDown={(e) => onResizePointerDown(e, s)}
              onStartEdit={() => canWrite && setEditing({ id: s.id })}
              onCommit={(text) => {
                if (text !== shapeText(s)) update(s.id, { text })
                setEditing(null)
                setSelectedId(s.id)
              }}
            />
          ))}

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

      {exportOpen && <ExportDialog title={title} shapes={shapes} onClose={() => setExportOpen(false)} />}
    </div>
  )

  function zoomAtCenter(factor: number) {
    const r = viewportRef.current?.getBoundingClientRect()
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  last,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
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
  )
}

interface ShapeViewProps {
  shape: BoardShape
  selected: boolean
  arrowSource: boolean
  editing: boolean
  canWrite: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onResizePointerDown: (e: ReactPointerEvent) => void
  onStartEdit: () => void
  onCommit: (text: string) => void
}

function ShapeView({
  shape: s,
  selected,
  arrowSource,
  editing,
  canWrite,
  onPointerDown,
  onResizePointerDown,
  onStartEdit,
  onCommit,
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
          onCommit={onCommit}
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
      {selected && canWrite && !editing && (
        <div
          role="presentation"
          onPointerDown={onResizePointerDown}
          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize border border-foreground bg-background"
        />
      )}
    </div>
  )
}

function EditText({
  initial,
  className,
  onCommit,
}: {
  initial: string
  className?: string
  onCommit: (text: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <textarea
      data-testid="shape-editor"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          onCommit(value)
        }
      }}
      className={cn(
        'h-full w-full resize-none bg-transparent leading-snug text-inherit outline-none placeholder:text-current placeholder:opacity-40',
        className,
      )}
      placeholder="Type…"
    />
  )
}
