import { mkdirSync } from 'node:fs'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { MAX_IMAGE_BYTES } from '@encheres/shared'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config/env'
import { AppError } from '../errors'
import { UPLOADS_URL_PREFIX, type Storage } from '../infra/storage'
import { authenticate } from '../services/auth'
import { storeImage } from '../services/images'
import type { RateLimits } from '../services/rate-limits'
import { ACCESS_COOKIE } from '../trpc/cookies'

/**
 * Routes Fastify des photos (docs/technical/api.md) :
 * - `POST /api/uploads/images` : une photo par requête `multipart`, réservée aux vendeurs ;
 * - `GET /uploads/*` : fichiers servis en lecture seule, avec un cache long (ADR-007).
 */
export async function registerUploads(
  app: FastifyInstance,
  config: Config,
  rateLimits: RateLimits,
  storage: Storage,
): Promise<void> {
  mkdirSync(config.uploadDir, { recursive: true })

  await app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } })

  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: UPLOADS_URL_PREFIX,
    // Un fichier n'est jamais modifié, seulement remplacé par une nouvelle clé.
    maxAge: '1y',
    immutable: true,
    index: false,
    list: false,
    dotfiles: 'deny',
    decorateReply: false,
    // Helmet impose `same-origin` : les photos publiques doivent pouvoir être affichées par le
    // front, qui est servi depuis une autre origine.
    setHeaders: (response) => {
      response.header('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })

  app.post('/api/uploads/images', async (request, reply) => {
    try {
      // Dans l'ordre : identité (relue en base), rôle, limite, puis seulement le corps.
      const { user } = await authenticate(config, request.cookies[ACCESS_COOKIE])
      if (user.role !== 'seller') throw new AppError('FORBIDDEN')
      rateLimits.imageUpload.consume(user.id)

      if (!request.isMultipart()) {
        return reply.status(415).send({
          error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Type de contenu non pris en charge.' },
        })
      }
      const file = await request.file()
      if (file === undefined) throw new AppError('INVALID_IMAGE')
      // Dépasser la taille maximale lève une erreur 413, traitée par le gestionnaire global.
      const content = await file.toBuffer()

      const key = await storeImage(storage, content)
      return reply.status(201).send({
        key,
        url: storage.url(key),
        thumbUrl: storage.url(key, 'thumb'),
      })
    } catch (error) {
      if (error instanceof AppError) {
        return reply
          .status(getHTTPStatusCodeFromError(error))
          .send({ error: { code: error.appCode, message: error.message } })
      }
      throw error
    }
  })
}
