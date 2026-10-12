import { expect, test } from '@playwright/test'

test('T1.1 — le front affiche la réponse de health', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Enchères en direct' })).toBeVisible()
  await expect(page.getByTestId('health-status')).toHaveText('ok')
  await expect(page.getByTestId('realtime-status')).toHaveText('Temps réel : connecté')
  expect(consoleErrors).toEqual([])
})
