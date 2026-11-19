import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { boardActions } from './boards'
import { sharingActions } from './sharing'
import { historyActions } from './history'
import { timerActions } from './timer'
import { projectActions } from './projects'
import { linkActions } from './links'
import { voteActions } from './votes'
import { commentActions } from './comments'

export const actions: Record<string, ActionHandler<Env>> = {
  ...boardActions,
  ...sharingActions,
  ...historyActions,
  ...timerActions,
  ...projectActions,
  ...linkActions,
  ...voteActions,
  ...commentActions,
}
