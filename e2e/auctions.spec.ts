import { execSync } from 'node:child_process'
import { expect, test, type Browser, type Page } from '@playwright/test'

const SEED_PASSWORD = 'mot-de-passe-de-dev-123'
const E2E_MONGO_URL = 'mongodb://127.0.0.1:27017/encheres-e2e'

/** Petit PNG valide (1 pixel) : le serveur le vérifie sur son contenu puis le ré-encode. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Valeur d'un champ `datetime-local` (heure locale du navigateur, qui est celle de ce processus). */
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('/')
}

/** Une session de navigateur à part (cookies séparés) : un vendeur, un admin, un visiteur. */
async function newPage(browser: Browser) {
  const context = await browser.newContext()
  return context.newPage()
}

test.beforeAll(() => {
  // Comptes de développement (admin, vendeur…) sur la base des tests E2E, seulement locale.
  execSync('pnpm seed', { cwd: '..', env: { ...process.env, MONGO_URL: E2E_MONGO_URL } })
})

test('T3.16 — le vendeur crée avec photo, l’admin valide, l’enchère est publique puis passe en direct', async ({
  browser,
}) => {
  // Le début ne peut être précisé qu'à la minute près : il faut attendre jusqu'à ~90 s.
  test.setTimeout(240_000)
  const title = `Vase E2E ${Date.now()}`

  // 1. Le vendeur crée l'enchère avec une photo.
  const seller = await newPage(browser)
  await signIn(seller, 'vendeur@example.test')
  await seller.getByRole('link', { name: 'Mes enchères' }).click()
  await seller.getByTestId('new-auction').click()

  const startsAt = new Date(Date.now() + 60_000)
  startsAt.setSeconds(0, 0)
  startsAt.setMinutes(startsAt.getMinutes() + 1)
  const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000)

  await seller.getByLabel('Titre').fill(title)
  await seller.getByLabel('Description').fill('Un beau vase\nde test.')
  await seller.getByTestId('photo-input').setInputFiles({
    name: 'vase.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(seller.getByTestId('photo')).toHaveCount(1)
  await seller.getByLabel('Prix de départ (€)').fill('12,50')
  await seller.getByLabel('Début', { exact: true }).fill(localInput(startsAt))
  await seller.getByLabel('Fin', { exact: true }).fill(localInput(endsAt))
  await seller.getByRole('button', { name: 'Créer l’enchère' }).click()

  await expect(seller).toHaveURL(/\/seller\/auctions\?saved=1$/)
  await expect(seller.getByTestId('saved-notice')).toBeVisible()
  const row = seller.getByTestId('auction-row').filter({ hasText: title })
  await expect(row).toContainText('En attente de validation')

  // 2. Tant qu'elle n'est pas validée, elle n'est pas publique.
  const visitor = await newPage(browser)
  await visitor.goto('/')
  await visitor.getByTestId('filter-upcoming').click()
  await expect(visitor.getByTestId('auction-card').filter({ hasText: title })).toHaveCount(0)

  // 3. L'admin la valide.
  const admin = await newPage(browser)
  await signIn(admin, 'admin@example.test')
  await admin.getByRole('link', { name: 'À valider' }).click()
  const pending = admin.getByTestId('pending-auction').filter({ hasText: title })
  await expect(pending).toBeVisible()
  await pending.getByTestId('validate').click()
  await expect(admin.getByTestId('notice')).toContainText('validée')
  await expect(pending).toHaveCount(0)

  // 4. Elle apparaît dans « À venir », avec sa photo servie par l'API.
  await visitor.reload()
  await visitor.getByTestId('filter-upcoming').click()
  const card = visitor.getByTestId('auction-card').filter({ hasText: title })
  await expect(card).toBeVisible()
  await expect(card.locator('img')).toHaveJSProperty('complete', true)
  expect(await card.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await card.getByRole('link').click()
  await expect(visitor.getByRole('heading', { name: title })).toBeVisible()
  await expect(visitor.getByTestId('price')).toContainText('12,50')
  await expect(visitor.getByTestId('scheduled-note')).toBeVisible()

  // 5. À `startsAt`, le job d'ouverture la passe en direct.
  await expect
    .poll(
      async () => {
        await visitor.reload()
        return visitor.getByTestId('status-badge').innerText()
      },
      { timeout: 150_000, intervals: [3000] },
    )
    .toBe('En direct')
  await expect(visitor.getByTestId('countdown')).toBeVisible()

  // Le vendeur la voit aussi en direct : elle n'est plus modifiable.
  await seller.reload()
  await expect(row).toContainText('En direct')
  await expect(row.getByTestId('edit')).toHaveCount(0)
})
