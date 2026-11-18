/**
 * Projects on /home: create, file a board (keyboard), search, sort, pin,
 * share a whole project with a friend and unshare it, delete the project
 * (boards stay), archive, and permanently delete from Archived.
 * Cleans up its own board and project; never unfriends the test accounts.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { befriend, displayName } from './helpers/share'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs 2 usable test accounts, found ${usableTestAccounts}.`)

test('projects, pins, search, archive and project sharing', async ({ users }) => {
  test.setTimeout(150_000)
  const [a, b] = await users(2)
  const stamp = Date.now()
  const title = `Proj board ${stamp}`
  const projectName = `Project ${stamp}`

  await a.page.goto('/home')
  await expect(a.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await a.page.getByTestId('board-title-input').fill(title)
  await a.page.getByTestId('board-create').click()
  await a.page.waitForURL(/\/board\//)
  const boardId = a.page.url().split('/board/')[1]

  await befriend(a, b)
  const bName = await displayName(b.page)
  const ap = a.page
  const card = ap.getByTestId(`board-card-${boardId}`)
  await expect(card).toBeVisible({ timeout: 15_000 })

  // Create a project.
  await ap.getByTestId('project-name-input').fill(projectName)
  await ap.getByTestId('project-create').click()
  const projectButton = ap.getByTestId('project-sidebar').getByRole('button', { name: new RegExp(`^${projectName}`) })
  await expect(projectButton).toBeVisible({ timeout: 15_000 })

  // Move the board into it from the card menu, by keyboard.
  await ap.getByTestId(`board-menu-${boardId}`).focus()
  await ap.keyboard.press('Enter')
  await ap.getByRole('menuitemradio', { name: projectName }).focus()
  await ap.keyboard.press('Enter')
  await expect(ap.getByText(`Moved to ${projectName}`)).toBeVisible({ timeout: 15_000 })

  await projectButton.click()
  await expect(ap.getByTestId('board-view-title')).toHaveText(projectName)
  await expect(projectButton).toHaveAttribute('aria-current', 'true')
  await expect(card).toBeVisible()
  await expect(ap.getByTestId('board-list').locator('li')).toHaveCount(1)

  // Search and sort.
  await ap.getByTestId('view-all').click()
  await ap.getByTestId('board-search').fill(`board ${stamp}`)
  await expect(card).toBeVisible()
  await ap.getByTestId('board-search').fill(`no such board ${stamp}`)
  await expect(card).toHaveCount(0)
  await expect(ap.getByText(/No boards match/)).toBeVisible()
  await ap.getByRole('button', { name: 'Clear search' }).click()
  await expect(card).toBeVisible()
  await ap.getByTestId('board-sort').click()
  await ap.getByRole('option', { name: 'Name' }).click()
  await expect(ap.getByTestId('board-sort')).toContainText('Name')

  // Pin: pinned boards come first and say so in text, not just an icon.
  await ap.getByTestId(`board-menu-${boardId}`).click()
  await ap.getByRole('menuitem', { name: 'Pin to top' }).click()
  await expect(card).toContainText('Pinned')
  await expect(ap.getByTestId('board-list').locator('li').first()).toHaveAttribute('data-testid', `board-item-${boardId}`)

  // Share the project with B: B gets the board.
  await ap.getByTestId('project-sidebar').getByRole('button', { name: `Project options for ${projectName}` }).click()
  await ap.getByRole('menuitem', { name: /Share/ }).click()
  const dialog = ap.getByRole('dialog', { name: new RegExp(projectName) })
  await dialog.getByRole('button', { name: `Share with ${bName}` }).click()
  await expect(dialog.getByRole('button', { name: `Unshare with ${bName}` })).toBeVisible({ timeout: 20_000 })
  await b.page.goto('/home')
  await expect(b.page.getByTestId(`board-card-${boardId}`)).toBeVisible({ timeout: 20_000 })

  // Unshare: B loses it.
  await dialog.getByRole('button', { name: `Unshare with ${bName}` }).click()
  await expect(dialog.getByRole('button', { name: `Share with ${bName}` })).toBeVisible({ timeout: 20_000 })
  await dialog.getByRole('button', { name: 'Done' }).click()
  await b.page.goto('/home')
  await expect(b.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId(`board-card-${boardId}`)).toHaveCount(0, { timeout: 20_000 })

  // Delete the project: the board stays, unassigned.
  await ap.getByTestId('project-sidebar').getByRole('button', { name: `Project options for ${projectName}` }).click()
  await ap.getByRole('menuitem', { name: /Delete/ }).click()
  await ap.getByRole('button', { name: 'Delete project' }).click()
  await expect(projectButton).toHaveCount(0, { timeout: 15_000 })
  await expect(card).toBeVisible()

  // Archive: hidden from All, listed under Archived, deletable from there.
  await ap.getByTestId(`board-menu-${boardId}`).click()
  await ap.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(card).toHaveCount(0, { timeout: 15_000 })
  await ap.getByTestId('view-archived').click()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText('archived')
  await ap.getByTestId(`board-menu-${boardId}`).click()
  await ap.getByRole('menuitem', { name: /Delete permanently/ }).click()
  await ap.getByRole('button', { name: 'Delete board' }).click()
  await expect(card).toHaveCount(0, { timeout: 20_000 })
})
