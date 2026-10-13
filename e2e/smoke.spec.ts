import { expect, test } from '@playwright/test'

test('T1.1 — le front affiche la réponse de health', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Un visiteur sans session reçoit un 401 de `auth.me` puis de `auth.refresh` : le navigateur le
    // signale en console, mais c'est le fonctionnement normal (docs/technical/frontend.md).
    if (message.location().url.includes('/api/trpc/auth.')) return
    consoleErrors.push(message.text())
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Enchères en direct' })).toBeVisible()
  await expect(page.getByTestId('health-status')).toHaveText('ok')
  await expect(page.getByTestId('realtime-status')).toHaveText('Temps réel : connecté')
  expect(consoleErrors).toEqual([])
})
