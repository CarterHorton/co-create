/**
 * Board call access — the server-side gate on LiveKit tokens.
 *
 * A LiveKit token is the key to a room: whoever holds one for
 * `${appId}:board:<boardId>` hears and sees that board's call. DeepSpace mints
 * a token for any room name it is given, so this worker is the only place
 * that can tie a token to board access. Every path that reaches the
 * `livekit/*` integration (the browser proxy and action tools) runs
 * `authorizeLivekitRequest` first, and it fails closed:
 *
 * - only `livekit/generate-token` (POST) is allowed. `create-room` returns an
 *   admin token, `delete-room` ends anyone's call, `list-rooms` leaks room
 *   names, `settle-room` bills — the app needs none of them;
 * - the body may hold only `roomName` and `displayName`, and is re-serialized
 *   from the validated fields so nothing else reaches the api-worker;
 * - `roomName` must be exactly `${appId}:board:<boardId>` and the caller must
 *   be able to open that board (owner or a team_members row).
 *
 * Pure: board lookup is injected, so this module has no worker dependencies
 * and is unit-tested directly (call-access.test.ts).
 */

/** Board ids are client-generated record ids (`<ms>-<base36>`); allow the plain-id alphabet only. */
const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/** The only fields `livekit/generate-token` may receive from this app. */
const ALLOWED_TOKEN_FIELDS = new Set(['roomName', 'displayName'])

const MAX_DISPLAY_NAME_LENGTH = 200

/** Same shape as the client's `callRoomName` in src/components/call/useCall.ts. */
export function boardCallRoomName(appId: string, boardId: string): string {
  return `${appId}:board:${boardId}`
}

/**
 * The board id in a call room name, or null unless the name is exactly
 * `${appId}:board:<boardId>` with a plain board id.
 */
export function parseBoardCallRoom(roomName: unknown, appId: string): string | null {
  if (typeof roomName !== 'string' || !appId) return null
  const prefix = `${appId}:board:`
  if (!roomName.startsWith(prefix)) return null
  const boardId = roomName.slice(prefix.length)
  return BOARD_ID_RE.test(boardId) ? boardId : null
}

/** True when an integration name addresses LiveKit, in any letter case. */
export function isLivekitIntegration(name: string): boolean {
  return name.toLowerCase() === 'livekit'
}

export type LivekitDecision =
  | { ok: true; body: string; boardId: string }
  | { ok: false; status: 401 | 403; error: string }

export interface LivekitRequest {
  appId: string
  name: string
  endpoint: string
  method: string
  /** Parsed JSON body, or undefined if absent / unparseable. */
  body: unknown
  userId: string | null
  canAccessBoard: (boardId: string) => Promise<boolean>
}

const deny = (error: string): LivekitDecision => ({ ok: false, status: 403, error })

export async function authorizeLivekitRequest(req: LivekitRequest): Promise<LivekitDecision> {
  if (!req.userId) return { ok: false, status: 401, error: 'Sign in required for this integration' }
  if (req.name !== 'livekit' || req.endpoint !== 'generate-token' || req.method.toUpperCase() !== 'POST') {
    return deny('This LiveKit endpoint is not available')
  }
  const body = req.body
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return deny('Invalid call token request')
  const fields = body as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_TOKEN_FIELDS.has(key)) return deny('Invalid call token request')
  }
  const displayName = fields.displayName
  if (
    displayName !== undefined &&
    (typeof displayName !== 'string' || displayName.length > MAX_DISPLAY_NAME_LENGTH)
  ) {
    return deny('Invalid call token request')
  }
  const boardId = parseBoardCallRoom(fields.roomName, req.appId)
  if (boardId === null) return deny("You don't have access to this board's call")
  let allowed = false
  try {
    allowed = await req.canAccessBoard(boardId)
  } catch {
    allowed = false
  }
  if (!allowed) return deny("You don't have access to this board's call")
  return {
    ok: true,
    boardId,
    body: JSON.stringify({
      roomName: boardCallRoomName(req.appId, boardId),
      ...(displayName !== undefined ? { displayName } : {}),
    }),
  }
}
