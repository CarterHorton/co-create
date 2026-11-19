/**
 * The role a board's canvas socket gets. CanvasRoom lets 'member' and 'admin'
 * write and makes everyone else read-only, so a person whose access row on
 * the board says 'viewer' (they joined through a view-only link, see
 * src/actions/links.ts) is downgraded to 'viewer' whatever their app role.
 * Without a known board role (lookup failed) the socket is read-only too.
 * Pure, so it is unit tested directly (board-role.test.ts).
 */
export function canvasRoleFor(appRole: string | undefined, boardRole: string | null): string {
  // No row (or a failed lookup) fails closed: read-only.
  if (boardRole === null || boardRole === 'viewer') return 'viewer'
  return appRole ?? 'viewer'
}

/** May someone with this `team_members` role (or app role) change board content? */
export function isBoardWriterRole(boardRole: string | null | undefined): boolean {
  return boardRole !== 'viewer'
}
