import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { imageKeySchema } from '@encheres/shared'

export type ImageVariant = 'full' | 'thumb'

/**
 * Stockage des photos (ADR-007). Le reste du code ne connaît pas le disque : seule cette
 * interface change si le projet passe à un stockage S3-compatible.
 */
export interface Storage {
  /** Enregistre les deux tailles d'une photo sous sa clé. */
  put(key: string, images: Record<ImageVariant, Buffer>): Promise<void>
  /** Supprime les deux tailles ; sans effet si la photo n'existe pas. */
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Chemin public de la photo (servie sous `/uploads/`). */
  url(key: string, variant?: ImageVariant): string
}

/** Préfixe public des photos, servies en lecture seule par Fastify. */
export const UPLOADS_URL_PREFIX = '/uploads/'

function fileName(key: string, variant: ImageVariant): string {
  return variant === 'thumb' ? `${key}.thumb.webp` : `${key}.webp`
}

/**
 * Une clé vient toujours d'un UUID généré par le serveur. Elle est revérifiée ici : un chemin
 * (`../x`) ne doit jamais atteindre le disque, même si un appelant oublie de valider.
 */
function assertKey(key: string): void {
  if (!imageKeySchema.safeParse(key).success) throw new Error('Clé de photo invalide')
}

export function createDiskStorage(directory: string): Storage {
  const pathOf = (key: string, variant: ImageVariant) => join(directory, fileName(key, variant))

  return {
    async put(key, images) {
      assertKey(key)
      await mkdir(directory, { recursive: true })
      await Promise.all([
        writeFile(pathOf(key, 'full'), images.full),
        writeFile(pathOf(key, 'thumb'), images.thumb),
      ])
    },
    async delete(key) {
      assertKey(key)
      await Promise.all([
        rm(pathOf(key, 'full'), { force: true }),
        rm(pathOf(key, 'thumb'), { force: true }),
      ])
    },
    async exists(key) {
      assertKey(key)
      try {
        await access(pathOf(key, 'full'))
        return true
      } catch {
        return false
      }
    },
    url(key, variant = 'full') {
      assertKey(key)
      return `${UPLOADS_URL_PREFIX}${fileName(key, variant)}`
    },
  }
}
