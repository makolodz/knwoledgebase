import { MAX_IMAGE_BYTES } from '@encheres/shared'
import { env } from '../env'
import { UploadError } from './errors'
import { trpc } from './trpc'

/** Adresse complète d'une photo : l'API renvoie un chemin (`/uploads/…`), servi par l'API. */
export function imageSrc(path: string): string {
  return `${env.VITE_API_URL}${path}`
}

export interface UploadedImage {
  key: string
  url: string
  thumbUrl: string
}

async function post(file: File): Promise<Response> {
  const body = new FormData()
  body.append('file', file)
  return fetch(`${env.VITE_API_URL}/api/uploads/images`, {
    method: 'POST',
    body,
    credentials: 'include',
  })
}

/**
 * Envoie une photo (`POST /api/uploads/images`). Cette route n'est pas tRPC : si l'access token a
 * expiré (401), on renouvelle la session par un appel tRPC puis on réessaie une fois.
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError('PAYLOAD_TOO_LARGE')

  let response = await post(file)
  if (response.status === 401) {
    await trpc.auth.me.query()
    response = await post(file)
  }
  if (response.ok) return (await response.json()) as UploadedImage

  let code = 'INTERNAL_ERROR'
  try {
    const body = (await response.json()) as { error?: { code?: unknown } }
    if (typeof body.error?.code === 'string') code = body.error.code
  } catch {
    // Réponse sans corps JSON : le code générique suffit.
  }
  throw new UploadError(code)
}
