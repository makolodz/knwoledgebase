/** Ce que ces fonctions attendent d'un socket : un faux suffit dans les tests. */
export interface SessionSocket {
  on(event: 'connect_error', listener: (error: Error) => void): unknown
  connect(): unknown
  disconnect(): unknown
}

/**
 * Le serveur refuse un socket dont le JWT est invalide ou expiré (`NOT_AUTHENTICATED`). On
 * renouvelle alors la session par l'API (qui repose les cookies), puis on se reconnecte une seule
 * fois : si le renouvellement échoue, le socket reste en erreur et le front passe en visiteur.
 */
export function renewSessionOnAuthError(socket: SessionSocket, renew: () => Promise<void>): void {
  let renewing = false
  socket.on('connect_error', (error) => {
    if (error.message !== 'NOT_AUTHENTICATED' || renewing) return
    renewing = true
    renew()
      .then(() => socket.connect())
      .catch(() => undefined)
      .finally(() => {
        renewing = false
      })
  })
}

/** Reconnecte le socket pour qu'il reparte avec les cookies de la session actuelle. */
export function reconnect(socket: SessionSocket): void {
  socket.disconnect()
  socket.connect()
}
