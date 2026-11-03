import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadError } from '../api/errors'
import type { AuctionPayload } from '../components/auction-payload'
import { toLocalInput } from '../format'
import { ANA, fill, mountApp, submit } from '../test/app'
import { managedAuction, page } from '../test/auctions'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

const uploadImage = vi.hoisted(() => vi.fn())
vi.mock('../api/images', () => ({
  uploadImage,
  imageSrc: (path: string) => `http://api.test${path}`,
}))

const SELLER = { ...ANA, role: 'seller', emailVerified: true } as const
const ADMIN = { ...ANA, role: 'admin', emailVerified: true } as const
const RULES = { defaultMinIncrement: 100, minDurationMs: 3_600_000, maxDurationMs: 1_209_600_000 }
const PHOTO = {
  key: '3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c',
  url: '/uploads/3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c.webp',
  thumbUrl: '/uploads/3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c.thumb.webp',
}

beforeEach(() => {
  resetTrpcMock()
  uploadImage.mockReset()
  vi.restoreAllMocks()
  trpcMock.auction.rules.query.mockResolvedValue(RULES)
  // Après un enregistrement, la page redirige vers la liste des enchères du vendeur.
  trpcMock.auction.mine.query.mockResolvedValue(page([]))
})

type Wrapper = Awaited<ReturnType<typeof mountApp>>['wrapper']

/** Début dans 2 h, fin 2 h plus tard (heure locale, comme le champ datetime-local). */
function dates(startInHours = 2, durationHours = 2) {
  const start = Date.now() + startInHours * 3_600_000
  const end = start + durationHours * 3_600_000
  return [toLocalInput(new Date(start).toISOString()), toLocalInput(new Date(end).toISOString())]
}

async function addPhoto(
  wrapper: Wrapper,
  file = new File(['x'], 'vase.jpg', { type: 'image/jpeg' }),
) {
  const input = wrapper.get('[data-testid="photo-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

async function fillForm(wrapper: Wrapper, overrides: Record<string, string> = {}) {
  const [startsAt, endsAt] = dates()
  const values: Record<string, string> = {
    '#auction-title': 'Vase ancien',
    '#auction-description': 'Un beau vase.',
    '#auction-starting-price': '10',
    '#auction-starts-at': startsAt ?? '',
    '#auction-ends-at': endsAt ?? '',
    ...overrides,
  }
  for (const [selector, value] of Object.entries(values)) await fill(wrapper, selector, value)
}

describe('création d’une enchère (T3.1 à T3.5 côté écran)', () => {
  it('pré-remplit le pas minimum avec le paramètre global', async () => {
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })

    expect((wrapper.get('#auction-min-increment').element as HTMLInputElement).value).toBe('1,00')
  })

  it('envoie les montants en centimes entiers et les dates en UTC', async () => {
    uploadImage.mockResolvedValue(PHOTO)
    trpcMock.auction.create.mutate.mockResolvedValue(managedAuction({ status: 'draft' }))
    const { wrapper, router } = await mountApp('/seller/auctions/new', { user: SELLER })
    await fillForm(wrapper, { '#auction-starting-price': '19,99' })
    await addPhoto(wrapper)

    await submit(wrapper)

    const sent = trpcMock.auction.create.mutate.mock.calls[0]?.[0] as AuctionPayload
    expect(sent).toMatchObject({
      title: 'Vase ancien',
      description: 'Un beau vase.',
      images: [PHOTO.key],
      startingPrice: 1999,
      minIncrement: 100,
    })
    expect(sent.startsAt).toMatch(/Z$/)
    // La page de la liste est chargée à la demande : la navigation prend un instant.
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/seller/auctions'))
  })

  it('refuse un titre trop court, un prix sous 1 € et l’absence de photo, sans appeler l’API', async () => {
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })
    await fillForm(wrapper, { '#auction-title': 'ab', '#auction-starting-price': '0,99' })

    await submit(wrapper)

    expect(wrapper.text()).toContain('entre 3 et 120 caractères')
    expect(wrapper.text()).toContain('au moins 1 €')
    expect(wrapper.text()).toContain('entre 1 et 5 photos')
    expect(trpcMock.auction.create.mutate).not.toHaveBeenCalled()
  })

  it('refuse un début dans le passé et une durée hors limites', async () => {
    uploadImage.mockResolvedValue(PHOTO)
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })
    const [past, soon] = dates(-3, 1)
    await fillForm(wrapper, { '#auction-starts-at': past ?? '', '#auction-ends-at': soon ?? '' })
    await addPhoto(wrapper)

    await submit(wrapper)
    expect(wrapper.text()).toContain('Le début doit être dans le futur.')

    const [start] = dates(2)
    const [, tooShort] = dates(2, 0.5)
    await fillForm(wrapper, {
      '#auction-starts-at': start ?? '',
      '#auction-ends-at': tooShort ?? '',
    })
    await submit(wrapper)
    expect(wrapper.text()).toContain('La durée doit être comprise entre 1 h à 14 j')
    expect(trpcMock.auction.create.mutate).not.toHaveBeenCalled()
  })

  it('affiche l’erreur du serveur (dates refusées)', async () => {
    uploadImage.mockResolvedValue(PHOTO)
    trpcMock.auction.create.mutate.mockRejectedValue(apiError('INVALID_DATES'))
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })
    await fillForm(wrapper)
    await addPhoto(wrapper)

    await submit(wrapper)

    expect(wrapper.get('[data-testid="form-error"]').text()).toContain('dates')
  })

  it('affiche l’échec d’une photo sans l’ajouter, puis permet de retirer et de réordonner', async () => {
    uploadImage.mockRejectedValueOnce(new UploadError('INVALID_IMAGE'))
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })

    await addPhoto(wrapper, new File(['x'], 'faux.jpg'))
    expect(wrapper.text()).toContain('faux.jpg : Cette photo n’est pas valide')
    expect(wrapper.findAll('[data-testid="photo"]')).toHaveLength(0)

    uploadImage.mockResolvedValueOnce(PHOTO)
    uploadImage.mockResolvedValueOnce({
      key: '4f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c',
      url: '/uploads/4f2b1c9e.webp',
      thumbUrl: '/uploads/4f2b1c9e.thumb.webp',
    })
    await addPhoto(wrapper)
    await addPhoto(wrapper)
    expect(wrapper.findAll('[data-testid="photo"]')).toHaveLength(2)

    await wrapper.get('button[aria-label="Déplacer la photo 1 vers la fin"]').trigger('click')
    expect(wrapper.findAll('[data-testid="photo"] img')[0]?.attributes('src')).toContain('4f2b1c9e')

    await wrapper.get('button[aria-label="Retirer la photo 1"]').trigger('click')
    expect(wrapper.findAll('[data-testid="photo"]')).toHaveLength(1)
  })

  it('limite à 5 photos', async () => {
    uploadImage.mockResolvedValue(PHOTO)
    const { wrapper } = await mountApp('/seller/auctions/new', { user: SELLER })
    for (let index = 0; index < 5; index += 1) await addPhoto(wrapper)

    expect(wrapper.findAll('[data-testid="photo"]')).toHaveLength(5)
    expect(wrapper.find('[data-testid="photo-input"]').exists()).toBe(false)
  })
})

describe('modification (T3.8 côté écran)', () => {
  const id = 'a'.repeat(24)

  it('pré-remplit le formulaire et envoie une modification', async () => {
    trpcMock.auction.getMine.query.mockResolvedValue(
      managedAuction({ id, status: 'draft', title: 'Vase', startingPrice: 2550 }),
    )
    trpcMock.auction.update.mutate.mockResolvedValue(managedAuction({ id }))
    const { wrapper } = await mountApp(`/seller/auctions/${id}/edit`, { user: SELLER })
    expect((wrapper.get('#auction-title').element as HTMLInputElement).value).toBe('Vase')
    expect((wrapper.get('#auction-starting-price').element as HTMLInputElement).value).toBe('25,50')

    await fill(wrapper, '#auction-title', 'Vase XIXe')
    await submit(wrapper)

    expect(trpcMock.auction.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id, title: 'Vase XIXe', startingPrice: 2550 }),
    )
  })

  it('prévient qu’une enchère à venir repart en validation', async () => {
    trpcMock.auction.getMine.query.mockResolvedValue(managedAuction({ id, status: 'scheduled' }))

    const { wrapper } = await mountApp(`/seller/auctions/${id}/edit`, { user: SELLER })

    expect(wrapper.get('[data-testid="rescheduled-warning"]').text()).toContain(
      'renverra l’enchère en validation',
    )
  })

  it('verrouille une enchère refusée (état final)', async () => {
    trpcMock.auction.getMine.query.mockResolvedValue(
      managedAuction({ id, status: 'cancelled', cancelReason: 'Photos floues' }),
    )

    const { wrapper } = await mountApp(`/seller/auctions/${id}/edit`, { user: SELLER })

    // Une enchère refusée est définitive : elle n'est plus modifiable.
    expect(wrapper.find('[data-testid="locked"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('refuse l’accès à une enchère live ou inconnue', async () => {
    trpcMock.auction.getMine.query.mockResolvedValueOnce(managedAuction({ id, status: 'live' }))
    const live = await mountApp(`/seller/auctions/${id}/edit`, { user: SELLER })
    expect(live.wrapper.find('[data-testid="locked"]').exists()).toBe(true)

    trpcMock.auction.getMine.query.mockRejectedValueOnce(apiError('AUCTION_NOT_FOUND', 404))
    const unknown = await mountApp(`/seller/auctions/${id}/edit`, { user: SELLER })
    expect(unknown.wrapper.find('[data-testid="not-found"]').exists()).toBe(true)
  })
})

describe('mes enchères', () => {
  it('liste les enchères avec leur statut et le motif d’un refus', async () => {
    trpcMock.auction.mine.query.mockResolvedValue(
      page([
        managedAuction({ id: '1'.repeat(24), status: 'draft', title: 'En attente' }),
        managedAuction({
          id: '2'.repeat(24),
          status: 'cancelled',
          title: 'Refusée',
          cancelReason: 'Photos floues',
        }),
        managedAuction({ id: '3'.repeat(24), status: 'live', title: 'En cours' }),
      ]),
    )

    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    const rows = wrapper.findAll('[data-testid="auction-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[1]?.get('[data-testid="cancel-reason"]').text()).toBe('Motif : Photos floues')
    // Modifier et annuler seulement pour draft et scheduled.
    expect(rows[0]?.find('[data-testid="edit"]').exists()).toBe(true)
    expect(rows[1]?.find('[data-testid="edit"]').exists()).toBe(false)
    expect(rows[2]?.find('[data-testid="edit"]').exists()).toBe(false)
    expect(rows[2]?.find('[data-testid="cancel"]').exists()).toBe(false)
  })

  it('annule après confirmation puis recharge la liste', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const draft = managedAuction({ id: '1'.repeat(24), status: 'draft' })
    trpcMock.auction.mine.query.mockResolvedValueOnce(page([draft]))
    trpcMock.auction.mine.query.mockResolvedValueOnce(page([]))
    trpcMock.auction.cancel.mutate.mockResolvedValue({ ...draft, status: 'cancelled' })
    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    await wrapper.get('[data-testid="cancel"]').trigger('click')
    await flushPromises()

    expect(trpcMock.auction.cancel.mutate).toHaveBeenCalledWith({ id: draft.id })
    expect(wrapper.find('[data-testid="list-empty"]').exists()).toBe(true)
  })

  it('n’annule pas sans confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    trpcMock.auction.mine.query.mockResolvedValue(page([managedAuction({ status: 'draft' })]))
    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    await wrapper.get('[data-testid="cancel"]').trigger('click')
    await flushPromises()

    expect(trpcMock.auction.cancel.mutate).not.toHaveBeenCalled()
  })

  it('filtre par statut', async () => {
    trpcMock.auction.mine.query.mockResolvedValue(page([]))
    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    await wrapper.get('[data-testid="status-filter"]').setValue('live')
    await flushPromises()

    expect(trpcMock.auction.mine.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'live', page: 1 }),
    )
  })

  it('affiche l’erreur d’une annulation refusée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    trpcMock.auction.mine.query.mockResolvedValue(page([managedAuction({ status: 'scheduled' })]))
    trpcMock.auction.cancel.mutate.mockRejectedValue(apiError('AUCTION_STATE_INVALID', 409))
    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    await wrapper.get('[data-testid="cancel"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="action-error"]').text()).toContain('état actuel')
  })
})

describe('enchères à valider (admin) — T3.11, T3.12 côté écran', () => {
  const draft = managedAuction({ id: '1'.repeat(24), status: 'draft', title: 'À modérer' })

  it('affiche l’aperçu complet : photos, description, prix, dates, vendeur', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValue(page([draft]))

    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })

    const card = wrapper.get('[data-testid="pending-auction"]')
    expect(card.text()).toContain('À modérer')
    expect(card.text()).toContain('Vendeur : Vera')
    expect(card.text()).toContain('10,00')
    expect(card.findAll('img')).toHaveLength(1)
    expect(card.text()).toContain('Un beau vase.')
  })

  it('valide puis recharge', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValueOnce(page([draft]))
    trpcMock.admin.pendingAuctions.query.mockResolvedValueOnce(page([]))
    trpcMock.admin.validate.mutate.mockResolvedValue({ ...draft, status: 'scheduled' })
    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })

    await wrapper.get('[data-testid="validate"]').trigger('click')
    await flushPromises()

    expect(trpcMock.admin.validate.mutate).toHaveBeenCalledWith({ id: draft.id })
    expect(wrapper.get('[data-testid="notice"]').text()).toContain('validée')
    expect(wrapper.find('[data-testid="list-empty"]').exists()).toBe(true)
  })

  it('exige un motif pour refuser', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValue(page([draft]))
    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })
    await wrapper.get('[data-testid="reject"]').trigger('click')

    await wrapper.get('[data-testid="confirm-reject"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="action-error"]').text()).toContain('motif')
    expect(trpcMock.admin.reject.mutate).not.toHaveBeenCalled()
  })

  it('refuse avec le motif saisi', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValue(page([draft]))
    trpcMock.admin.reject.mutate.mockResolvedValue({ ...draft, status: 'cancelled' })
    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })
    await wrapper.get('[data-testid="reject"]').trigger('click')

    await wrapper.get('[data-testid="reason"]').setValue('Photos floues')
    await wrapper.get('[data-testid="confirm-reject"]').trigger('click')
    await flushPromises()

    expect(trpcMock.admin.reject.mutate).toHaveBeenCalledWith({
      id: draft.id,
      reason: 'Photos floues',
    })
  })

  it('affiche l’erreur quand la date de début est passée', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValue(page([draft]))
    trpcMock.admin.validate.mutate.mockRejectedValue(apiError('INVALID_DATES'))
    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })

    await wrapper.get('[data-testid="validate"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="action-error"]').text()).toContain('dates')
  })

  it('affiche un message quand rien n’attend', async () => {
    trpcMock.admin.pendingAuctions.query.mockResolvedValue(page([]))

    const { wrapper } = await mountApp('/admin/auctions/pending', { user: ADMIN })

    expect(wrapper.get('[data-testid="list-empty"]').text()).toContain('Aucune enchère')
  })
})
