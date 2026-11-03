import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountApp } from '../test/app'
import { page, publicAuction } from '../test/auctions'
import { apiError, networkError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

describe('liste des enchères (T3.13, T3.14 côté écran)', () => {
  it('affiche les cartes : titre, prix, offres, statut, lien et miniature', async () => {
    trpcMock.auction.list.query.mockResolvedValue(
      page([publicAuction({ status: 'live', bidCount: 7, currentPrice: 4500 })]),
    )

    const { wrapper } = await mountApp('/')

    const card = wrapper.get('[data-testid="auction-card"]')
    expect(card.text()).toContain('Vase ancien')
    expect(card.get('[data-testid="card-price"]').text()).toContain('45,00')
    expect(card.text()).toContain('7 offres')
    expect(card.get('[data-testid="status-badge"]').text()).toBe('En direct')
    expect(card.get('a').attributes('href')).toBe(`/auctions/${'a'.repeat(24)}`)
    expect(card.get('img').attributes('src')).toMatch(/\/uploads\/.+\.thumb\.webp$/)
    expect(trpcMock.auction.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'live', sort: 'endingSoon', page: 1 }),
    )
  })

  it('indique « (départ) » tant qu’il n’y a pas d’offre', async () => {
    trpcMock.auction.list.query.mockResolvedValue(page([publicAuction({ status: 'live' })]))

    const { wrapper } = await mountApp('/')

    expect(wrapper.get('[data-testid="card-price"]').text()).toContain('(départ)')
  })

  it('affiche un message quand il n’y a aucune enchère en cours', async () => {
    const { wrapper } = await mountApp('/')

    expect(wrapper.get('[data-testid="list-empty"]').text()).toBe('Aucune enchère en cours.')
  })

  it('recharge avec le filtre « À venir »', async () => {
    const { wrapper } = await mountApp('/')

    await wrapper.get('[data-testid="filter-upcoming"]').trigger('click')
    await flushPromises()

    expect(trpcMock.auction.list.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: 'upcoming', page: 1 }),
    )
    expect(wrapper.get('[data-testid="list-empty"]').text()).toBe('Aucune enchère à venir.')
  })

  it('trie par date récente pour les enchères terminées', async () => {
    const { wrapper } = await mountApp('/')

    await wrapper.get('[data-testid="filter-ended"]').trigger('click')
    await flushPromises()

    expect(trpcMock.auction.list.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: 'ended', sort: 'recent' }),
    )
  })

  it('pagine : la page suivante est demandée', async () => {
    trpcMock.auction.list.query.mockResolvedValue({
      items: [publicAuction()],
      total: 30,
      page: 1,
      limit: 12,
    })
    const { wrapper } = await mountApp('/')
    expect(wrapper.get('[data-testid="page-indicator"]').text()).toBe('Page 1 sur 3')

    await wrapper.findAll('nav[aria-label="Pagination"] button')[1]?.trigger('click')
    await flushPromises()

    expect(trpcMock.auction.list.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    )
  })

  it('affiche une erreur avec « Réessayer » qui relance l’appel', async () => {
    trpcMock.auction.list.query.mockRejectedValueOnce(networkError())
    const { wrapper } = await mountApp('/')
    expect(wrapper.get('[data-testid="list-error"]').text()).toContain('Impossible de joindre')

    trpcMock.auction.list.query.mockResolvedValue(page([publicAuction()]))
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Réessayer')
    await retry?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="auction-card"]').exists()).toBe(true)
  })
})

describe('détail d’une enchère', () => {
  const id = 'a'.repeat(24)

  it('affiche titre, vendeur (nom seul), prix, description et date de début', async () => {
    trpcMock.auction.get.query.mockResolvedValue(publicAuction())

    const { wrapper } = await mountApp(`/auctions/${id}`)

    expect(trpcMock.auction.get.query).toHaveBeenCalledWith({ id })
    expect(wrapper.get('h1').text()).toBe('Vase ancien')
    expect(wrapper.get('[data-testid="seller"]').text()).toBe('Vendu par Vera')
    expect(wrapper.get('[data-testid="price"]').text()).toContain('10,00')
    expect(wrapper.get('[data-testid="description"]').text()).toContain('Un beau vase.')
    expect(wrapper.get('[data-testid="starts-at"]').text()).toContain('dans')
    expect(wrapper.get('[data-testid="scheduled-note"]').text()).toContain('pas encore ouverte')
    expect(wrapper.html()).not.toContain('@')
  })

  it('affiche le compte à rebours d’une enchère en direct', async () => {
    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({
        status: 'live',
        currentPrice: 2000,
        nextMinBid: 2100,
        endsAt: new Date(Date.now() + 90_000).toISOString(),
      }),
    )

    const { wrapper } = await mountApp(`/auctions/${id}`)

    expect(wrapper.get('[data-testid="countdown"]').text()).toMatch(/^00:01:(29|30)$/)
    expect(wrapper.get('[data-testid="next-min-bid"]').text()).toContain('21,00')
  })

  it('n’interprète pas le HTML de la description', async () => {
    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({ description: '<img src=x onerror=alert(1)>' }),
    )

    const { wrapper } = await mountApp(`/auctions/${id}`)

    expect(wrapper.find('[data-testid="description"] img').exists()).toBe(false)
    expect(wrapper.get('[data-testid="description"]').text()).toBe('<img src=x onerror=alert(1)>')
  })

  it('affiche « introuvable » pour une enchère inconnue ou pas encore publique', async () => {
    trpcMock.auction.get.query.mockRejectedValue(apiError('AUCTION_NOT_FOUND', 404))

    const { wrapper } = await mountApp(`/auctions/${id}`)

    expect(wrapper.get('[data-testid="not-found"]').text()).toContain('Enchère introuvable')
  })

  it('change de photo au clic sur une miniature', async () => {
    const second = '4f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c'
    const first = publicAuction().images[0]
    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({
        images: [
          ...(first ? [first] : []),
          {
            key: second,
            url: `/uploads/${second}.webp`,
            thumbUrl: `/uploads/${second}.thumb.webp`,
          },
        ],
      }),
    )
    const { wrapper } = await mountApp(`/auctions/${id}`)

    await wrapper.get('button[aria-label="Afficher la photo 2"]').trigger('click')

    expect(wrapper.get('[data-testid="main-image"]').attributes('src')).toContain(second)
  })
})

describe('accès aux pages réservées', () => {
  const buyer = {
    id: '1',
    name: 'Ana',
    email: 'ana@x.fr',
    role: 'buyer',
    emailVerified: true,
  } as const

  it('redirige un visiteur vers la connexion', async () => {
    const { router } = await mountApp('/seller/auctions')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/seller/auctions')
  })

  it('affiche la page 404 à un acheteur', async () => {
    for (const path of ['/seller/auctions', '/seller/auctions/new', '/admin/auctions/pending']) {
      const { wrapper } = await mountApp(path, { user: buyer })
      expect(wrapper.get('main').text()).toContain('Page introuvable')
    }
  })

  it('propose les liens selon le rôle dans l’en-tête', async () => {
    const seller = await mountApp('/', { user: { ...buyer, role: 'seller' } })
    expect(seller.wrapper.get('header').text()).toContain('Mes enchères')

    const admin = await mountApp('/', { user: { ...buyer, role: 'admin' } })
    expect(admin.wrapper.get('header').text()).toContain('À valider')
    expect(admin.wrapper.get('header').text()).not.toContain('Mes enchères')

    const plain = await mountApp('/', { user: buyer })
    expect(plain.wrapper.get('header').text()).not.toMatch(/Mes enchères|À valider/)
  })
})
