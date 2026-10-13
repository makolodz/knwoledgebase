import { expect, test } from '@playwright/test'
import { waitForEmailLink } from './mailpit'

const PASSWORD = 'un-mot-de-passe-de-test-e2e'

test('T2.19 — inscription, email lu dans Mailpit, vérification, connexion, session renouvelée', async ({
  page,
  context,
  request,
}) => {
  // Une adresse neuve par exécution : le test ne dépend pas de l'état de la base.
  const email = `parcours-${Date.now()}@example.test`

  // 1. Inscription : le serveur répond pareil que l'adresse existe ou non, personne n'est connecté.
  await page.goto('/register')
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Nom d’affichage').fill('Parcours Complet')
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD)
  // Le texte des libellés est cliquable : cocher la case par son libellé, comme un utilisateur.
  await page.getByText('J’accepte les').click({ position: { x: 5, y: 5 } })
  await page.getByText('Je confirme que je suis majeur').click()
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await expect(page.getByTestId('registered-notice')).toContainText('consultez votre boîte mail')
  await expect(page.getByRole('link', { name: 'Connexion' })).toBeVisible()

  // 2. L'email de vérification arrive dans Mailpit : on clique le lien comme un utilisateur.
  const verificationLink = await waitForEmailLink(
    request,
    email,
    /https?:\/\/\S+\/verify-email\?token=\S+/,
  )
  await page.goto(verificationLink)
  await expect(page.getByTestId('verify-success')).toContainText('vérifiée')

  // Le lien ne sert qu'une fois.
  await page.goto(verificationLink)
  await expect(page.getByTestId('verify-invalid')).toBeVisible()

  // 3. Connexion.
  await page.goto('/login')
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('nav-account')).toHaveText('Parcours Complet')

  // Les cookies de session sont httpOnly : le JavaScript de la page ne peut pas les lire.
  const cookies = await context.cookies()
  const access = cookies.find((cookie) => cookie.name === 'access_token')
  const refresh = cookies.find((cookie) => cookie.name === 'refresh_token')
  expect(access).toMatchObject({ httpOnly: true, path: '/' })
  expect(refresh).toMatchObject({ httpOnly: true, path: '/api/trpc/auth.refresh' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('token')

  await page.goto('/account')
  await expect(page.getByTestId('account-verified')).toHaveText('Adresse vérifiée')
  await expect(page.getByTestId('account-email')).toHaveText(email)

  // 4. La session survit à l'expiration de l'access token (15 min) : on retire son cookie, comme
  //    s'il avait expiré, puis on recharge. Le front renouvelle la session sans redemander le mot
  //    de passe, et le refresh token change (rotation).
  await context.clearCookies({ name: 'access_token' })
  await page.reload()

  await expect(page.getByTestId('account-email')).toHaveText(email)
  await expect(page.getByTestId('nav-account')).toHaveText('Parcours Complet')
  const renewed = (await context.cookies()).find((cookie) => cookie.name === 'refresh_token')
  expect(renewed?.value).toBeTruthy()
  expect(renewed?.value).not.toBe(refresh?.value)
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(true)

  // 5. Déconnexion : retour à l'état de visiteur, la page protégée renvoie vers la connexion.
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page.getByRole('link', { name: 'Connexion' })).toBeVisible()
  await page.goto('/account')
  await expect(page).toHaveURL('/login?redirect=/account')
})
