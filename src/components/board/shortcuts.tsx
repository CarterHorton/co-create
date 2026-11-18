/**
 * Keyboard shortcuts for the whiteboard, in one place so the key handler,
 * the key badges on buttons, and the hover tooltips can't disagree.
 *
 * "Mod" is ⌘ on Mac and Ctrl elsewhere.
 */

import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

export const SHORTCUTS = {
  select: ['V'],
  sticky: ['N'],
  box: ['B'],
  text: ['T'],
  arrow: ['A'],
  routeStraight: ['1'],
  routeElbow: ['2'],
  routeCurve: ['3'],
  sections: ['G'],
  export: ['E'],
  undo: ['Mod', 'Z'],
  redo: ['Mod', 'Shift', 'Z'],
  delete: ['Del'],
  selectAll: ['Mod', 'A'],
  zoomIn: ['+'],
  zoomOut: ['−'],
  zoomReset: ['0'],
  pan: ['Space', 'Drag'],
  // Keyboard-only editing (the canvas's screen-reader instructions list these too).
  nextShape: ['Tab'],
  editText: ['Enter'],
  moveShape: ['Arrows'],
  resizeShape: ['Alt', 'Arrows'],
  connect: ['C'],
  frame: ['F'],
  noteType: ['Y'],
  // Signed-in boards: vote for the selected sticky note ("upvote").
  vote: ['U'],
  entity: ['D'],
  comment: ['M'],
} as const

export type ShortcutId = keyof typeof SHORTCUTS

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** "⌘Z" on Mac, "Ctrl+Z" elsewhere. */
export function formatKeys(keys: readonly string[]): string {
  const mac = isMac()
  const parts = keys.map((k) => {
    if (k === 'Mod') return mac ? '⌘' : 'Ctrl'
    if (k === 'Shift') return mac ? '⇧' : 'Shift'
    if (k === 'Alt') return mac ? '⌥' : 'Alt'
    return k
  })
  return mac ? parts.join('') : parts.join('+')
}

/**
 * Wraps a control with a tooltip naming what it does and its shortcut.
 * The child keeps its own aria-label; the tooltip is the visual hint.
 */
export function Hint({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string
  shortcut?: ShortcutId
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent
        side={side}
        data-testid="hint"
        className="flex items-center gap-2 rounded-none border border-foreground bg-background px-2 py-1 font-sans text-xs text-foreground shadow-[2px_2px_0_0_#000]"
      >
        <span>{label}</span>
        {shortcut && (
          <kbd data-testid="hint-keys" className="border border-border bg-card px-1 font-mono text-[11px] font-semibold">
            {formatKeys(SHORTCUTS[shortcut])}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/** Small key letter in the corner of a toolbar button. */
export function KeyBadge({ shortcut }: { shortcut: ShortcutId }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[9px] font-semibold leading-none opacity-60"
    >
      {SHORTCUTS[shortcut].join('')}
    </span>
  )
}
