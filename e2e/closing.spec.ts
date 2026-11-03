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

/** Exécute un script `mongosh` dans le conteneur de docker-compose.yml et renvoie sa sortie. */
function mongosh(script: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'mongo', 'mongosh', E2E_DB, '--quiet', '--eval', script],
    { cwd: '..', encoding: 'utf8' },
  )
}

/** Insère une enchère `live` du vendeur de test, qui se termine dans 30 minutes. */
function insertLiveAuction(title: string): string {
  const output = mongosh(`
    const seller = db.users.findOne({ email: 'vendeur@example.test' });
    const result = db.auctions.insertOne({
      sellerId: seller._id, title: ${JSON.stringify(title)}, description: 'Enchère de test.',
      images: [], startingPrice: 1000, minIncrement: 100, currentPrice: null,
      currentBidderId: null, nextMinBid: 1000, bidCount: 0,
      startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 1800000),
      status: 'live', winnerId: null, paymentDeadline: null, paymentReminderSentAt: null,
      cancelReason: null, createdAt: new Date(),
    });
    print(result.insertedId.toString());`)
  const id = /[0-9a-f]{24}/.exec(output)?.[0]
  if (id === undefined) throw new Error(`Enchère non insérée : ${output}`)
  return id
}

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/login')
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('/')
  return page
}

test('T5.9 — l’enchère se clôture seule à l’heure : le gagnant le voit en direct et reçoit l’email', async ({
  browser,
  request,
}) => {
  const title = `Vase E2E clôture ${Date.now()}`
  const id = insertLiveAuction(title)

  const ana = await signedInPage(browser, 'acheteur1@example.test')
  const bob = await signedInPage(browser, 'acheteur2@example.test')
  for (const page of [ana, bob]) {
    await page.goto(`/auctions/${id}`)
    await expect(page.getByTestId('realtime-status')).toHaveText('Temps réel : connecté')
  }

  // Ana enchérit, puis Bob la dépasse : Bob sera le gagnant.
  for (const [page, amount] of [
    [ana, '10'],
    [bob, '11'],
  ] as const) {
    await page.getByLabel(/Votre offre/).fill(amount)
    await page.getByTestId('bid-submit').click()
    await expect(page.getByTestId('bid-accepted')).toBeVisible()
  }
  await expect(ana.getByTestId('outbid-note')).toBeVisible()

  // La fin est avancée à quelques secondes : il n'existe pas encore d'écran pour raccourcir la
  // durée (étape 7). Le job de clôture (chaque seconde) fait le reste, sans intervention.
  mongosh(
    `db.auctions.updateOne({ _id: ObjectId('${id}') }, { $set: { endsAt: new Date(Date.now() + 6000) } })`,
  )
  await ana.reload()
  await bob.reload()
  await expect(ana.getByTestId('countdown')).toHaveText(/^00:00:0\d$/)

  // Tous les navigateurs voient la clôture sans recharger.
  await expect(bob.getByTestId('status-badge')).toHaveText('Terminée', { timeout: 30_000 })
  await expect(ana.getByTestId('status-badge')).toHaveText('Terminée', { timeout: 30_000 })
  await expect(bob.getByTestId('winner-note')).toContainText(
    'Vous avez remporté cette enchère pour 11,00',
  )
  await expect(ana.getByTestId('winner-note')).toContainText('Remportée par Acheteur Deux')
  await expect(bob.getByTestId('bid-form')).toHaveCount(0)

  // Le gagnant la retrouve dans « Mes gains », avec son échéance de paiement.
  await bob.getByRole('link', { name: 'Mes gains' }).click()
  const win = bob.getByTestId('my-win').filter({ hasText: title })
  await expect(win.getByTestId('final-price')).toContainText('11,00')
  await expect(win.getByTestId('payment-status')).toContainText('À payer avant le')

  // Ana la voit dans « Mes offres » comme perdue.
  await ana.getByRole('link', { name: 'Mes offres' }).click()
  await expect(
    ana.getByTestId('my-bid').filter({ hasText: title }).getByTestId('standing'),
  ).toHaveText('Perdue')

  // Le gagnant reçoit l'email avec le lien vers ses gains (file d'envoi, puis Mailpit).
  const link = await waitForEmailLink(
    request,
    'acheteur2@example.test',
    /https?:\/\/\S+\/account\/wins/,
  )
  expect(link).toContain('/account/wins')
  // Le vendeur est prévenu aussi.
  await waitForEmailLink(request, 'vendeur@example.test', /https?:\/\/\S+\/seller\/auctions/)
})
