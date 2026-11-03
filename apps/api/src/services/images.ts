import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { AppError } from '../errors'
import type { ImageVariant, Storage } from '../infra/storage'

/** Côté le plus long de la photo principale et de la miniature (ADR-007). */
const FULL_SIZE = 1600
const THUMB_SIZE = 400

/** Types acceptés, lus sur le **contenu** du fichier et non sur son nom ni son type déclaré. */
const ALLOWED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp'])

/** Refuse les images qui s'étendent en mémoire de façon démesurée (« bombes de décompression »). */
const MAX_PIXELS = 40_000_000

/**
 * Vérifie le contenu et ré-encode en webp, en deux tailles. Les métadonnées (EXIF, donc la
 * position GPS) ne sont pas recopiées : on n'appelle jamais `withMetadata()` (ADR-007). L'orientation
 * EXIF est appliquée aux pixels avant d'être perdue, la photo reste dans le bon sens.
 */
export async function processImage(input: Buffer): Promise<Record<ImageVariant, Buffer>> {
  try {
    const source = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    const { format } = await source.metadata()
    if (format === undefined || !ALLOWED_FORMATS.has(format)) throw new Error('format refusé')

    const render = (size: number) =>
      source
        .clone()
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    const [full, thumb] = await Promise.all([render(FULL_SIZE), render(THUMB_SIZE)])
    return { full, thumb }
  } catch {
    // Le détail de sharp n'a pas à être renvoyé : il peut citer des chemins ou des versions.
    throw new AppError('INVALID_IMAGE')
  }
}

/** Traite puis enregistre une photo ; renvoie sa clé, un UUID généré ici (jamais le nom reçu). */
export async function storeImage(storage: Storage, input: Buffer): Promise<string> {
  const images = await processImage(input)
  const key = randomUUID()
  await storage.put(key, images)
  return key
}
