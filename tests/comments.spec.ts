/**
 * Comments, threads and @mentions (signed-in boards only).
 *   - Guest boards show none of it.
 *   - Two accounts: comment on a shape with M and an @mention, live badge and
 *     announcement on the other side, mention notification → thread, reply,
 *     resolve, a thread on a deleted shape, delete.
 */
import { test as base, expect as baseExpect, type Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { displayName, shareBoard } from './helpers/share'
import { boardIdFrom, deleteBoard } from './helpers/boards'

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await editor.fill(text)
  await editor.press('Escape')
}

base('guest boards have no comments', async ({ page }) => {
  await page.goto('/try')
  await baseExpect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  await addSticky(page, 300, 300, 'Guest note')
  await page.getByTestId('shape-sticky').first().click()
  await page.keyboard.press('m')
  await page.getByTestId('sidebar-menu').click()
  await baseExpect(page.getByTestId('sidebar-tab-history')).toBeVisible()
  await baseExpect(page.getByTestId('sidebar-tab-comments')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await baseExpect(page.getByTestId('selection-comment')).toHaveCount(0)
  await baseExpect(page.getByTestId('mentions-button')).toHaveCount(0)
})

test.describe('comments on a shared board', () => {
  test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

  test('comment, mention, reply, resolve and delete', async ({ users }) => {
    test.setTimeout(120_000)
    const [a, b] = await users(2)

    // Start B with no unread mentions (earlier runs may have left some).
    await b.page.goto('/home')
    await expect(b.page.getByTestId('mentions-button')).toBeVisible({ timeout: 15_000 })
    await b.page.waitForTimeout(1000)
    if (((await b.page.getByTestId('mentions-button').getAttribute('aria-label')) ?? '').includes('unread')) {
      await b.page.getByTestId('mentions-button').click()
      await b.page.getByTestId('mentions-mark-all').click()
      await expect(b.page.getByTestId('mentions-button')).toHaveAttribute('aria-label', 'Mentions', { timeout: 15_000 })
    }

    const title = `Comments board ${Date.now()}`
    await a.page.goto('/home')
    await a.page.getByTestId('board-title-input').fill(title)
    await a.page.getByTestId('board-create').click()
    await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
    const boardUrl = a.page.url()
    await shareBoard(a, b, boardUrl)
    const bName = await displayName(b.page)
    await expect(a.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
    await b.page.goto(boardUrl)
    await expect(b.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })

    await addSticky(a.page, 300, 300, 'Login page')
    await expect(b.page.getByTestId('shape-sticky')).toContainText('Login page', { timeout: 10_000 })

    // A: select the note, press M → the Comments tab opens with the box focused.
    await a.page.getByTestId('shape-sticky').first().click()
    await a.page.keyboard.press('m')
    await expect(a.page.getByTestId('sidebar-pane-comments')).toBeVisible()
    const input = a.page.getByTestId('comment-input')
    await expect(input).toBeFocused()
    await expect(a.page.getByTestId('comment-target')).toContainText('Sticky note: Login page')

    // @mention B with the keyboard: type part of the name, pick with Enter.
    await input.pressSequentially(`Please review @${bName.slice(0, 2)}`)
    const listbox = a.page.getByRole('listbox', { name: 'People on this board' })
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option', { name: `@${bName}` })).toHaveAttribute('aria-selected', 'true')
    await input.press('Enter')
    await expect(listbox).toHaveCount(0)
    await expect(input).toHaveValue(`Please review @${bName} `)
    await input.pressSequentially('thanks')
    await input.press('Control+Enter')

    const aThreads = a.page.getByTestId('comment-thread')
    await expect(aThreads).toHaveCount(1, { timeout: 15_000 })
    await expect(aThreads.first().getByTestId('comment-body')).toHaveText(`Please review @${bName} thanks`)
    await expect(a.page.getByRole('button', { name: /^1 comment on Sticky note: Login page/ })).toBeVisible()

    // B: the badge and announcement arrive live; the mention shows as unread.
    const bBadge = b.page.getByRole('button', { name: /^1 comment on Sticky note: Login page/ })
    await expect(bBadge).toBeVisible({ timeout: 15_000 })
    await expect(b.page.getByTestId('comments-announcer')).toContainText(/commented on Sticky note: Login page: Please review/, {
      timeout: 10_000,
    })
    await expect(b.page.getByTestId('mentions-button')).toHaveAttribute('aria-label', /1 unread/, { timeout: 15_000 })

    // B opens the mention: lands on the board with the thread focused, mention read.
    await b.page.getByTestId('mentions-button').click()
    await b.page.getByTestId('mention-item').first().click()
    await expect(b.page.getByTestId('sidebar-pane-comments')).toBeVisible({ timeout: 15_000 })
    await expect(b.page.getByTestId('comment-thread').first()).toBeFocused({ timeout: 10_000 })
    await expect(b.page.getByTestId('mentions-button')).toHaveAttribute('aria-label', 'Mentions', { timeout: 15_000 })

    // B replies (B is the thread's non-author: no resolve, can't edit A's comment).
    const bThread = b.page.getByTestId('comment-thread').first()
    await expect(bThread.getByTestId('comment-resolve')).toHaveCount(0)
    await expect(bThread.getByTestId('comment-edit')).toHaveCount(0)
    await bThread.getByTestId('comment-reply-open').click()
    await bThread.getByTestId('comment-reply-input').fill('On it')
    await bThread.getByTestId('comment-reply-send').click()
    await expect(a.page.getByRole('button', { name: /^2 comments on Sticky note: Login page/ })).toBeVisible({ timeout: 15_000 })
    await expect(aThreads.first().getByTestId('comment')).toHaveCount(2)

    // Clicking the thread's shape link pans to and focuses the note.
    await a.page.getByTestId('comment-thread-open').click()
    await expect(a.page.getByTestId('shape-sticky').first()).toBeFocused()

    // A edits their comment.
    await aThreads.first().getByTestId('comment-edit').first().click()
    await a.page.getByTestId('comment-edit-input').fill('Please review the login page')
    await a.page.getByTestId('comment-edit-save').click()
    await expect(b.page.getByTestId('comment-body').first()).toHaveText('Please review the login page', { timeout: 15_000 })

    // A resolves: the thread moves to Resolved and the badge goes.
    await aThreads.first().getByTestId('comment-resolve').click()
    await expect(aThreads).toHaveCount(0, { timeout: 15_000 })
    await expect(a.page.getByTestId('comment-badge')).toHaveCount(0)
    await expect(b.page.getByTestId('comment-badge')).toHaveCount(0, { timeout: 15_000 })
    await a.page.getByTestId('comments-filter-resolved').click()
    await expect(aThreads).toHaveCount(1)

    // A comment on a shape that is then deleted stays, "on a deleted shape".
    await a.page.getByTestId('comments-filter-open').click()
    await addSticky(a.page, 600, 300, 'Doomed')
    await a.page.getByTestId('shape-sticky').filter({ hasText: 'Doomed' }).click()
    await a.page.getByTestId('selection-comment').click()
    await a.page.getByTestId('comment-input').fill('Remove this?')
    await a.page.getByTestId('comment-post').click()
    await expect(aThreads).toHaveCount(1, { timeout: 15_000 })
    await a.page.getByTestId('shape-sticky').filter({ hasText: 'Doomed' }).click()
    await a.page.getByTestId('selection-delete').click()
    await expect(aThreads.first().getByTestId('comment-thread-place')).toContainText('a deleted shape (was Sticky note: Doomed)', {
      timeout: 15_000,
    })

    // A (owner) deletes that thread, confirming in the dialog.
    await aThreads.first().getByTestId('comment-delete').click()
    await a.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(aThreads).toHaveCount(0, { timeout: 15_000 })
    await expect(b.page.getByTestId('comment-thread')).toHaveCount(0, { timeout: 15_000 })

    // Clean up: deleting the board takes its comments and mentions with it.
    await deleteBoard(a.page, boardIdFrom(a.page))
  })
})
