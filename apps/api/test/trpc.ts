import type { FastifyInstance } from 'fastify'

export interface TestCookie {
  name: string
  value: string
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
  maxAge?: number
  expires?: Date
}

export interface TrpcErrorBody {
  message: string
  data: {
    /** Code métier quand il y en a un, sinon code tRPC. */
    code: string
    httpStatus: number
    path?: string
    fieldErrors?: Record<string, string[]>
    stack?: unknown
  }
}

export interface CallResult<Data = unknown> {
  status: number
  /** Résultat de la procédure, `undefined` en cas d'erreur. */
  data: Data
  /** Erreur renvoyée par tRPC, `undefined` en cas de succès. */
  error: TrpcErrorBody | undefined
  /** Cookies posés (ou retirés) par la réponse. */
  cookies: TestCookie[]
  /** Corps JSON brut, pour vérifier qu'une valeur n'y figure nulle part. */
  raw: string
}

interface StoredCookie {
  value: string
  path: string
}

/**
 * Client de test qui appelle l'API comme le front : requêtes HTTP tRPC réelles (`inject`),
 * cookies conservés entre les appels et envoyés seulement aux chemins qu'ils couvrent. Ce dernier
 * point compte : le refresh token n'est censé partir que vers `auth.refresh`.
 */
export class TestClient {
  private readonly jar = new Map<string, StoredCookie>()

  constructor(
    private readonly app: FastifyInstance,
    private readonly headers: Record<string, string> = {},
  ) {}

  mutate<Data = unknown>(procedure: string, input?: unknown): Promise<CallResult<Data>> {
    return this.send<Data>('POST', procedure, input)
  }

  query<Data = unknown>(procedure: string, input?: unknown): Promise<CallResult<Data>> {
    return this.send<Data>('GET', procedure, input)
  }

  /** Valeur d'un cookie conservé par le client. */
  cookie(name: string): string | undefined {
    return this.jar.get(name)?.value
  }

  /** Pose un cookie à la main, par exemple un ancien refresh token rejoué par un voleur. */
  setCookie(name: string, value: string, path = '/'): void {
    this.jar.set(name, { value, path })
  }

  /** Noms des cookies que le navigateur enverrait à cette procédure. */
  cookiesSentTo(procedure: string): string[] {
    const requestPath = `/api/trpc/${procedure}`
    return [...this.jar.entries()]
      .filter(
        ([, { path }]) =>
          requestPath === path || requestPath.startsWith(`${path}/`) || path === '/',
      )
      .map(([name]) => name)
  }

  private async send<Data>(
    method: 'GET' | 'POST',
    procedure: string,
    input: unknown,
  ): Promise<CallResult<Data>> {
    const requestPath = `/api/trpc/${procedure}`
    const cookie = this.cookiesSentTo(procedure)
      .map((name) => `${name}=${this.jar.get(name)?.value ?? ''}`)
      .join('; ')

    const hasInput = input !== undefined
    const response = await this.app.inject({
      method,
      url:
        method === 'GET' && hasInput
          ? `${requestPath}?input=${encodeURIComponent(JSON.stringify(input))}`
          : requestPath,
      headers: {
        ...this.headers,
        ...(cookie === '' ? {} : { cookie }),
        // Comme le client tRPC du front : tout POST porte ce en-tête, même sans corps.
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' && hasInput ? { payload: JSON.stringify(input) } : {}),
    })

    const cookies = response.cookies as TestCookie[]
    this.store(cookies)

    const body = (response.body === '' ? {} : JSON.parse(response.body)) as {
      result?: { data: Data }
      error?: TrpcErrorBody
    }
    return {
      status: response.statusCode,
      data: body.result?.data as Data,
      error: body.error,
      cookies,
      raw: response.body,
    }
  }

  private store(cookies: TestCookie[]): void {
    for (const cookie of cookies) {
      const removed =
        cookie.value === '' ||
        cookie.maxAge === 0 ||
        (cookie.expires !== undefined && cookie.expires.getTime() <= Date.now())
      if (removed) this.jar.delete(cookie.name)
      else this.jar.set(cookie.name, { value: cookie.value, path: cookie.path ?? '/' })
    }
  }
}
