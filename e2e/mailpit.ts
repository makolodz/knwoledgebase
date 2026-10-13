import { expect, type APIRequestContext } from '@playwright/test'

/** Interface web et API de Mailpit (docker-compose.yml) : il capture tous les emails de l'API. */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025'

interface MailpitSearch {
  messages: { ID: string }[]
}

interface MailpitMessage {
  Text: string
}

/**
 * Attend l'email envoyé à une adresse et renvoie le premier lien qui correspond à `pattern`,
 * comme le ferait un utilisateur qui ouvre sa boîte mail. L'API envoie les emails de la file
 * toutes les 5 secondes (ADR-008) : l'attente est donc de quelques secondes.
 */
export async function waitForEmailLink(
  request: APIRequestContext,
  to: string,
  pattern: RegExp,
): Promise<string> {
  let link: string | null = null

  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        })
        if (!search.ok()) return null
        const { messages } = (await search.json()) as MailpitSearch

        for (const { ID } of messages) {
          const response = await request.get(`${MAILPIT_URL}/api/v1/message/${ID}`)
          const { Text } = (await response.json()) as MailpitMessage
          link = pattern.exec(Text)?.[0] ?? null
          if (link !== null) return link
        }
        return null
      },
      {
        message: `Aucun email avec le lien attendu pour ${to}`,
        timeout: 45_000,
        intervals: [1000],
      },
    )
    .not.toBeNull()

  if (link === null) throw new Error('Lien introuvable')
  return link
}
