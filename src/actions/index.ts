import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { sharingActions } from './sharing'

export const actions: Record<string, ActionHandler<Env>> = {
  ...sharingActions,
}
