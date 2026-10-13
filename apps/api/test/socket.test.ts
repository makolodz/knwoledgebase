import type { ClientToServerEvents, ServerToClientEvents } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, listen, WEB_ORIGIN } from './helpers'

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

describe('T1.8 — Socket.IO sur le même serveur que HTTP', () => {
  let app: FastifyInstance
  let url: string
  const sockets: ClientSocket[] = []

  function open(origin: string | undefined, transport: 'websocket' | 'polling'): ClientSocket {
    const socket: ClientSocket = connect(url, {
      transports: [transport],
      reconnection: false,
      ...(origin ? { extraHeaders: { origin } } : {}),
    })
    sockets.push(socket)
    return socket
  }

  function outcome(socket: ClientSocket) {
    return new Promise<'connected' | 'refused'>((resolve) => {
      socket.once('connect', () => resolve('connected'))
      socket.once('connect_error', () => resolve('refused'))
    })
  }

  beforeEach(async () => {
    app = await createTestApp()
    url = await listen(app)
  })
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect())
    await app.close()
  })

  it('accepte une connexion sur le port de l’API, en WebSocket comme en polling', async () => {
    expect(await outcome(open(WEB_ORIGIN, 'websocket'))).toBe('connected')
    expect(await outcome(open(WEB_ORIGIN, 'polling'))).toBe('connected')
    expect(app.io.engine.clientsCount).toBe(2)
  })

  it('accepte un client sans en-tête Origin (script, test)', async () => {
    expect(await outcome(open(undefined, 'websocket'))).toBe('connected')
  })

  it.each(['websocket', 'polling'] as const)(
    'refuse une origine étrangère (%s)',
    async (transport) => {
      expect(await outcome(open('https://site-tiers.example', transport))).toBe('refused')
      expect(app.io.engine.clientsCount).toBe(0)
    },
  )

  it('HTTP continue de répondre sur le même port', async () => {
    const response = await fetch(`${url}/api/trpc/health`)

    expect(response.status).toBe(200)
  })

  it('s’arrête proprement alors que des sockets sont encore connectés', async () => {
    const socket = open(WEB_ORIGIN, 'websocket')
    await outcome(socket)

    await app.close()

    expect(socket.connected).toBe(false)
    await expect(fetch(`${url}/api/trpc/health`)).rejects.toThrow()
  })
})
