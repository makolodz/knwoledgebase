import { execFileSync, execSync } from 'node:child_process'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { waitForEmailLink } from './mailpit'

const SEED_PASSWORD = 'mot-de-passe-de-dev-123'
const E2E_DB = 'encheres-e2e'
const E2E_MONGO_URL = `mongodb://127.0.0.1:27017/${E2E_DB}`

test.beforeAll(() => {
  // Comptes de développement (admin, vendeur, deux acheteurs) sur la base des tests E2E.
  execSync('pnpm seed', { cwd: '..', env: { ...process.env, MONGO_URL: E2E_MONGO_URL } })
})

/**
 * Insère directement en base une enchère `live` qui se termine dans 30 s : l'ouverture et la
 * durée minimale d'une heure sont déjà couvertes par T3.16, et il n'existe pas encore d'écran
 * pour raccourcir les paramètres (étape 7). `mongosh` tourne dans le conteneur de docker-compose.yml.
 */
function insertLiveAuction(title: string): string {
  const script = `
    const seller = db.users.findOne({ email: 'vendeur@example.test' });
    const result = db.auctions.insertOne({
      sellerId: seller._id, title: ${JSON.stringify(title)}, description: 'Enchère de test.',
      images: [], startingPrice: 1000, minIncrement: 100, currentPrice: null,
      currentBidderId: null, nextMinBid: 1000, bidCount: 0,
      startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 30000),
      status: 'live', winnerId: null, paymentDeadline: null, paymentReminderSentAt: null,
      cancelReason: null, createdAt: new Date(),
    });
    print(result.insertedId.toString());`
  const output = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'mongo', 'mongosh', E2E_DB, '--quiet', '--eval', script],
    { cwd: '..', encoding: 'utf8' },
  )
  const id = /[0-9a-f]{24}/.exec(output)?.[0]
  if (id === undefined) throw new Error(`Enchère non insérée : ${output}`)
  return id
}

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  // Un contexte par utilisateur : des cookies séparés, comme deux navigateurs.
  const page = await (await browser.newContext()).newPage()
  await page.goto('/login')
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('/')
  return page
}

async function bidOf(page: Page, amount: string) {
  await page.getByLabel(/Votre offre/).fill(amount)
  await page.getByTestId('bid-submit').click()
}

test('T4.27 — deux navigateurs enchérissent : offres en direct, dépassement, prolongation et email', async ({
  browser,
  request,
}) => {
  const title = `Vase E2E offres ${Date.now()}`
  const id = insertLiveAuction(title)

  const ana = await signedInPage(browser, 'acheteur1@example.test')
  const bob = await signedInPage(browser, 'acheteur2@example.test')
  for (const page of [ana, bob]) {
    await page.goto(`/auctions/${id}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByTestId('realtime-status')).toHaveText('Temps réel : connecté')
  }

  // Le compte à rebours part des 30 secondes restantes.
  await expect(ana.getByTestId('countdown')).toHaveText(/^00:00:[0-3]\d$/)

  // 1. Ana enchérit : Bob voit l'offre arriver sans recharger.
  await bidOf(ana, '10')
  await expect(ana.getByTestId('bid-accepted')).toBeVisible()
  await expect(ana.getByTestId('highest-note')).toBeVisible()
  await expect(bob.getByTestId('price')).toContainText('10,00')
  await expect(bob.getByTestId('bid-row').first()).toContainText('Acheteur Un')
  await expect(bob.getByTestId('next-min-bid')).toContainText('11,00')

  // 2. Bob enchérit dans les 30 dernières secondes : l'enchère est prolongée chez les deux.
  await expect(bob.getByLabel(/Votre offre/)).toHaveValue('11,00')
  await bidOf(bob, '11')
  await expect(bob.getByTestId('highest-note')).toBeVisible()
  await expect(ana.getByTestId('outbid-note')).toBeVisible()
  await expect(ana.getByTestId('price')).toContainText('11,00')
  for (const page of [ana, bob]) {
    await expect(page.getByTestId('extended-notice')).toBeVisible()
    // Fin repoussée à environ 2 minutes (anti-sniping), au lieu des 30 secondes d'origine.
    await expect(page.getByTestId('countdown')).toHaveText(/^00:0(1:[5]\d|2:00)$/)
  }

  // 3. Ana ne peut pas enchérir en dessous du minimum : le serveur la refuse aussi.
  await bidOf(ana, '11,50')
  await expect(ana.locator('#bid-amount-error')).toContainText('au moins 12,00')

  // 4. Ana a été dépassée : elle reçoit l'email « offre dépassée » (file, puis Mailpit).
  const link = await waitForEmailLink(
    request,
    'acheteur1@example.test',
    new RegExp(`https?://\\S+/auctions/${id}`),
  )
  expect(link).toContain(`/auctions/${id}`)

  // 5. Un visiteur suit l'enchère sans pouvoir enchérir.
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/auctions/${id}`)
  await expect(visitor.getByTestId('login-to-bid')).toBeVisible()
  await expect(visitor.getByTestId('price')).toContainText('11,00')
  await expect(visitor.getByTestId('bid-row')).toHaveCount(2)
})
