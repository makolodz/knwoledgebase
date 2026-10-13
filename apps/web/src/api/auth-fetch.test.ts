import { describe, expect, it, vi } from 'vitest'
import { createAuthFetch } from './auth-fetch'

const API = 'http://localhost:3000'
const REFRESH_URL = `${API}/api/trpc/auth.refresh`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const failure = (code: string, httpStatus = 401) => ({
  error: { message: 'Message du serveur', code: -32001, data: { code, httpStatus } },
})
const success = { result: { data: { ok: true } } }

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

/** `fetch` d'origine contrôlé par le test ; garde la liste des appels. */
function fakeNetwork(handler: Handler) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const baseFetch = vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    return Promise.resolve(handler(url, init))
  }) as unknown as typeof fetch
  return { baseFetch, calls }
}

function setup(handler: Handler) {
  const network = fakeNetwork(handler)
  const onSessionLost = vi.fn()
  const authFetch = createAuthFetch({
    apiUrl: API,
    baseFetch: network.baseFetch,
    onSessionLost,
    conflictRetryDelayMs: 0,
  })
  return { authFetch, onSessionLost, calls: network.calls }
}

const refreshCalls = (calls: { url: string }[]) => calls.filter((call) => call.url === REFRESH_URL)

describe('T2.39 — renouvellement transparent de la session', () => {
  it('laisse passer une réponse réussie, en envoyant les cookies', async () => {
    const { authFetch, calls, onSessionLost } = setup(() => json(success))

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(await response.json()).toEqual(success)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.credentials).toBe('include')
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('ne renouvelle pas la session pour une autre erreur, par exemple des identifiants invalides', async () => {
    const { authFetch, calls } = setup(() => json(failure('INVALID_CREDENTIALS'), 401))

    const response = await authFetch(`${API}/api/trpc/auth.login`, { method: 'POST', body: '{}' })

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(1)
  })

  it('renouvelle la session sur NOT_AUTHENTICATED, puis rejoue la requête une fois', async () => {
    let authenticated = false
    const { authFetch, calls } = setup((url) => {
      if (url === REFRESH_URL) {
        authenticated = true
        return json(success)
      }
      return authenticated ? json(success) : json(failure('NOT_AUTHENTICATED'), 401)
    })

    const response = await authFetch(`${API}/api/trpc/profile.update`, {
      method: 'POST',
      body: '{"name":"Ana"}',
    })

    expect(response.status).toBe(200)
    expect(calls.map((call) => call.url)).toEqual([
      `${API}/api/trpc/profile.update`,
      REFRESH_URL,
      `${API}/api/trpc/profile.update`,
    ])
    // Le corps est renvoyé tel quel au rejeu.
    expect(calls[2]?.init?.body).toBe('{"name":"Ana"}')
    expect(calls[1]?.init).toMatchObject({ method: 'POST', credentials: 'include' })
  })

  it('reconnaît NOT_AUTHENTICATED dans une réponse groupée (statut 207)', async () => {
    let authenticated = false
    const { authFetch, calls } = setup((url) => {
      if (url === REFRESH_URL) {
        authenticated = true
        return json(success)
      }
      return authenticated
        ? json([success, success])
        : json([success, failure('NOT_AUTHENTICATED')], 207)
    })

    const response = await authFetch(`${API}/api/trpc/auth.me,health?batch=1`)

    expect(response.status).toBe(200)
    expect(refreshCalls(calls)).toHaveLength(1)
  })

  it('ne lance qu’un seul renouvellement pour plusieurs requêtes simultanées', async () => {
    let authenticated = false
    const { authFetch, calls } = setup(async (url) => {
      if (url === REFRESH_URL) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        authenticated = true
        return json(success)
      }
      return authenticated ? json(success) : json(failure('NOT_AUTHENTICATED'), 401)
    })

    const responses = await Promise.all([
      authFetch(`${API}/api/trpc/a`),
      authFetch(`${API}/api/trpc/b`),
      authFetch(`${API}/api/trpc/c`),
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(refreshCalls(calls)).toHaveLength(1)
  })

  it('rend la réponse d’origine et signale la session perdue quand le renouvellement échoue', async () => {
    const { authFetch, calls, onSessionLost } = setup((url) =>
      url === REFRESH_URL
        ? json(failure('NOT_AUTHENTICATED'), 401)
        : json(failure('NOT_AUTHENTICATED'), 401),
    )

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(failure('NOT_AUTHENTICATED'))
    expect(refreshCalls(calls)).toHaveLength(1)
    // Pas de rejeu : la requête d'origine n'est partie qu'une fois.
    expect(calls.filter((call) => call.url.endsWith('auth.me'))).toHaveLength(1)
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('ne déconnecte pas l’utilisateur quand le renouvellement échoue faute de réseau', async () => {
    const { authFetch, onSessionLost } = setup((url) => {
      if (url === REFRESH_URL) throw new TypeError('Failed to fetch')
      return json(failure('NOT_AUTHENTICATED'), 401)
    })

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(401)
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('réessaie une fois après un REFRESH_CONFLICT : un autre onglet a déjà renouvelé les cookies', async () => {
    let refreshAttempts = 0
    let authenticated = false
    const { authFetch, calls, onSessionLost } = setup((url) => {
      if (url === REFRESH_URL) {
        refreshAttempts += 1
        if (refreshAttempts === 1) return json(failure('REFRESH_CONFLICT', 409), 409)
        authenticated = true
        return json(success)
      }
      return authenticated ? json(success) : json(failure('NOT_AUTHENTICATED'), 401)
    })

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(200)
    expect(refreshCalls(calls)).toHaveLength(2)
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('abandonne après deux conflits de renouvellement', async () => {
    const { authFetch, calls, onSessionLost } = setup((url) =>
      url === REFRESH_URL
        ? json(failure('REFRESH_CONFLICT', 409), 409)
        : json(failure('NOT_AUTHENTICATED'), 401),
    )

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(401)
    expect(refreshCalls(calls)).toHaveLength(2)
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('ne boucle pas : la requête rejouée qui échoue encore est rendue telle quelle', async () => {
    const { authFetch, calls } = setup((url) =>
      url === REFRESH_URL ? json(success) : json(failure('NOT_AUTHENTICATED'), 401),
    )

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(401)
    expect(refreshCalls(calls)).toHaveLength(1)
    expect(calls).toHaveLength(3)
  })

  it('ne tente pas de renouveler la session quand c’est le renouvellement lui-même qui échoue', async () => {
    const { authFetch, calls } = setup(() => json(failure('NOT_AUTHENTICATED'), 401))

    const response = await authFetch(REFRESH_URL, { method: 'POST' })

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(1)
  })

  it('laisse remonter une panne réseau de la requête elle-même', async () => {
    const { authFetch } = setup(() => {
      throw new TypeError('Failed to fetch')
    })

    await expect(authFetch(`${API}/api/trpc/auth.me`)).rejects.toThrow('Failed to fetch')
  })

  it('ignore une réponse dont le corps n’est pas du JSON', async () => {
    const { authFetch, calls } = setup(() => new Response('Bad Gateway', { status: 401 }))

    const response = await authFetch(`${API}/api/trpc/auth.me`)

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(1)
  })
})
