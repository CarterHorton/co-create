export interface Friendship {
  ownerId: string
  friendId: string
  friendName?: string
}

export interface TeamMember {
  teamId: string
  userId: string
  status?: string
  name?: string
  role?: string
  /** Set when they joined through a view-only link (its board_links recordId). */
  viaLink?: string
}
