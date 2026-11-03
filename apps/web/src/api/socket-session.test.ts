import { describe, expect, it, vi } from 'vitest'
import { reconnect, renewSessionOnAuthError, type SessionSocket } from './socket-session'

function fakeSocket() {
  let listener: (error: Error) => void = () => undefined
  const connect = vi.fn<() => void>()
  const disconnect = vi.fn<() => void>()
  const socket: SessionSocket = {
    on: (_event, next) => {
      listener = next
    },
    connect: () => {
      connect()
    },
    disconnect: () => {
      disconnect()
    },
  }
  return {
    socket,
    connect,
    disconnect,
    fail: (message: string) => {
      listener(new Error(message))
    },
  }
}

describe('renewSessionOnAuthError', () => {
  it('renouvelle la session puis se reconnecte quand le serveur refuse le jeton', async () => {
    const { socket, connect, fail } = fakeSocket()
    const renew = vi.fn().mockResolvedValue(undefined)
    renewSessionOnAuthError(socket, renew)

    fail('NOT_AUTHENTICATED')

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
    expect(renew).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien pour une autre erreur de connexion', () => {
    const { socket, fail } = fakeSocket()
    const renew = vi.fn()
    renewSessionOnAuthError(socket, renew)

    fail('xhr poll error')

    expect(renew).not.toHaveBeenCalled()
  })

  it('ne se reconnecte pas si le renouvellement échoue (pas de boucle)', async () => {
    const { socket, connect, fail } = fakeSocket()
    const renew = vi.fn().mockRejectedValue(new Error('session perdue'))
    renewSessionOnAuthError(socket, renew)

    fail('NOT_AUTHENTICATED')
    await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1))

    expect(connect).not.toHaveBeenCalled()
  })

  it('ignore une seconde erreur pendant un renouvellement en cours', async () => {
    const { socket, connect, fail } = fakeSocket()
    let finish: () => void = () => undefined
    const renew = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    renewSessionOnAuthError(socket, renew)

    fail('NOT_AUTHENTICATED')
    fail('NOT_AUTHENTICATED')
    finish()

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
    expect(renew).toHaveBeenCalledTimes(1)
  })
})

describe('reconnect', () => {
  it('coupe puis rouvre la connexion', () => {
    const { socket, connect, disconnect } = fakeSocket()

    reconnect(socket)

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
