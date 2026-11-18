/**
 * Phase 2 acceptance: two users on the same board join one call, see each
 * other, and see mute / camera / leave changes.
 *
 * Chromium runs with fake mic + camera devices so this works headless.
 * Run: npx deepspace test run tests/call.spec.ts
 */
import { test, expect, loadAllTestAccounts, chromiumLaunchOptions } from 'deepspace/testing'
import { shareBoard } from './helpers/share'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

test.use({
  launchOptions: {
    ...chromiumLaunchOptions(),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
})

test('two users join the board call and see each other', async ({ users }) => {
  test.setTimeout(60_000)
  const [a, b] = await users(2)
  for (const u of [a, b]) await u.page.context().grantPermissions(['microphone', 'camera'])

  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Call board ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  await shareBoard(a, b, a.page.url())
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  await b.page.goto(a.page.url())
  await expect(b.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })

  // Both join.
  await a.page.getByTestId('call-join').click()
  await expect(a.page.getByTestId('call-leave')).toBeVisible({ timeout: 20_000 })
  await b.page.getByTestId('call-join').click()
  await expect(b.page.getByTestId('call-leave')).toBeVisible({ timeout: 20_000 })

  for (const u of [a, b]) {
    await expect(u.page.getByTestId('call-participant')).toHaveCount(2, { timeout: 20_000 })
  }
  await expect(b.page.getByTestId('call-rail')).toContainText(a.name || a.email, { timeout: 10_000 })

  // Mic is on after joining; A mutes, B sees it.
  const aTileOnB = b.page.getByTestId('call-participant').filter({ hasNotText: '(you)' })
  await expect(aTileOnB.getByLabel('Mic on')).toBeVisible({ timeout: 15_000 })
  await a.page.getByTestId('call-mic').click()
  await expect(aTileOnB.getByLabel('Muted')).toBeVisible({ timeout: 15_000 })

  // A turns the camera on, B gets a playing video.
  await a.page.getByTestId('call-camera').click()
  const video = aTileOnB.locator('video')
  await expect(video).toHaveCount(1, { timeout: 20_000 })
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0)

  // B receives A's audio track (attached outside the React tree).
  await a.page.getByTestId('call-mic').click()
  await expect(aTileOnB.getByLabel('Mic on')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => b.page.locator('audio[data-call-audio]').count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await b.page.screenshot({ path: 'test-results/call-two-users.png' })

  // A leaves; B is alone again.
  await a.page.getByTestId('call-leave').click()
  await expect(a.page.getByTestId('call-join')).toBeVisible({ timeout: 10_000 })
  await expect(b.page.getByTestId('call-participant')).toHaveCount(1, { timeout: 20_000 })
})
