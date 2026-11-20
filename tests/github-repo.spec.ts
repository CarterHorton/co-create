/**
 * GitHub repo links: connect a public repo to a project → every board in it
 * shows it (and the spec export names it) → a board overrides it with its own
 * → disconnecting the board's falls back to the project's → disconnecting the
 * project's leaves the board with none. Also checks the server refuses
 * non-owners and bad input before any (paid) GitHub lookup.
 *
 * Makes two real `github/get-repository` lookups (~$0.003, billed to the app
 * owner). Cleans up its own board and project.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { callAction } from './helpers/actions'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs 2 usable test accounts, found ${usableTestAccounts}.`)

const PROJECT_REPO = 'octocat/Hello-World'
const BOARD_REPO = 'octocat/Spoon-Knife'

test('connect a repo to a project, override it on a board, disconnect both', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)
  const ap = a.page
  const stamp = Date.now()
  const projectName = `Repo project ${stamp}`

  await ap.goto('/home')
  await expect(ap.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await ap.getByTestId('board-title-input').fill(`Repo board ${stamp}`)
  await ap.getByTestId('board-create').click()
  await ap.waitForURL(/\/board\//)
  const boardId = ap.url().split('/board/')[1]
  const project = (await callAction(ap, 'projectCreate', { name: projectName })) as { data: { projectId: string } }
  const projectId = project.data.projectId
  expect((await callAction(ap, 'boardMove', { boardId, projectId })).success).toBe(true)

  try {
    // The server checks ownership and input before looking anything up on GitHub.
    await b.page.goto('/home')
    const stranger = await callAction(b.page, 'repoConnect', { target: 'project', id: projectId, repo: PROJECT_REPO })
    expect(stranger).toMatchObject({ success: false, code: 'forbidden' })
    const strangerBoard = await callAction(b.page, 'repoDisconnect', { target: 'board', id: boardId })
    expect(strangerBoard).toMatchObject({ success: false, code: 'forbidden' })
    const bad = await callAction(ap, 'repoConnect', { target: 'board', id: boardId, repo: 'https://gitlab.com/a/b' })
    expect(bad).toMatchObject({ success: false, code: 'bad_request' })

    // Connect a repo to the project from its menu on /home.
    await ap.goto('/home')
    const sidebar = ap.getByTestId('project-sidebar')
    await sidebar.getByRole('button', { name: `Project options for ${projectName}` }).click()
    await ap.getByTestId('project-menu-repo').click()
    const dialog = ap.getByTestId('project-repo-dialog')
    await dialog.getByTestId('repo-input-project').fill(`https://github.com/${PROJECT_REPO}`)
    await dialog.getByTestId('repo-connect-project').click()
    await expect(dialog.getByTestId('project-repo')).toContainText(PROJECT_REPO, { timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Done' }).click()

    // The board in the project inherits it, and the spec export names it.
    await ap.goto(`/board/${boardId}`)
    const repoButton = ap.getByTestId('repo-open')
    await expect(repoButton).toHaveText(PROJECT_REPO, { timeout: 15_000 })
    await repoButton.click()
    const menu = ap.getByTestId('repo-menu')
    await expect(menu.getByTestId('board-repo')).toContainText('Default branch: master')
    await expect(menu.getByTestId('board-repo').getByRole('link')).toHaveAttribute('href', `https://github.com/${PROJECT_REPO}`)
    await expect(menu.getByTestId('board-repo-source')).toHaveText("From this board's project.")
    await expect(menu.getByTestId('repo-disconnect-board')).toHaveCount(0)
    await ap.keyboard.press('Escape')

    await ap.getByTestId('export-md').click()
    await expect(ap.getByTestId('export-preview')).toContainText(
      `**Repository:** [${PROJECT_REPO}](https://github.com/${PROJECT_REPO}) (default branch \`master\`)`,
    )
    await ap.keyboard.press('Escape')

    // Override it on this board only.
    await repoButton.click()
    await menu.getByTestId('repo-input-board').fill(BOARD_REPO)
    await menu.getByTestId('repo-connect-board').click()
    await expect(repoButton).toHaveText(BOARD_REPO, { timeout: 20_000 })
    await expect(menu.getByTestId('board-repo-source')).toHaveText('Connected to this board.')

    // Disconnecting the board's own repo falls back to the project's.
    await menu.getByTestId('repo-disconnect-board').click()
    await expect(repoButton).toHaveText(PROJECT_REPO, { timeout: 15_000 })
    await expect(menu.getByTestId('board-repo-source')).toHaveText("From this board's project.")
    await ap.keyboard.press('Escape')

    // Disconnecting the project's repo removes it from the board that only inherited it.
    const off = await callAction(ap, 'repoDisconnect', { target: 'project', id: projectId })
    expect(off.success).toBe(true)
    await expect(repoButton).toHaveText('Connect repo', { timeout: 15_000 })
  } finally {
    await callAction(ap, 'projectDelete', { projectId })
    await callAction(ap, 'boardDelete', { boardId })
  }
})
