import { jwtVerify, SignJWT } from 'jose'

/** Durée de vie de l'access token (docs/technical/security.md). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60

export interface AccessClaims {
  userId: string
  sessionId: string
}

const encodeSecret = (secret: string) => new TextEncoder().encode(secret)

/** JWT HS256 au contenu minimal : jamais de rôle ni de donnée personnelle (security.md). */
export function signAccessToken(
  secret: string,
  { userId, sessionId }: AccessClaims,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000)
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(encodeSecret(secret))
}

/** Renvoie les claims d'un token valide (signature, algorithme, expiration), sinon `null`. */
export async function verifyAccessToken(
  secret: string,
  token: string,
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
    return { userId: payload.sub, sessionId: payload.sid }
  } catch {
    return null
  }
}
