/** A signed-in, synced board: CanvasRoom shapes + PresenceRoom cursors. */

import { usePresenceRoom } from 'deepspace'
import { useBoard } from './useBoard'
import { Whiteboard } from './Whiteboard'

export function CloudWhiteboard({ boardId, title }: { boardId: string; title: string }) {
  const store = useBoard(boardId)
  const presence = usePresenceRoom(`board:${boardId}`)
  return <Whiteboard store={store} title={title} presence={presence} />
}
