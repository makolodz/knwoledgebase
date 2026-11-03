import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from './db'
import { WEB_ORIGIN, createTestApp, testConfig } from './helpers'
import { createSeller, jpegBuffer, logIn, multipartBody, uploadImage } from './images'
import { TestClient } from './trpc'
import { createUser } from './users'

useTestDb()

const config = testConfig()
let app: FastifyInstance
let seller: TestClient

beforeAll(async () => {
  app = await createTestApp({ config: { uploadDir: config.uploadDir } })
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  seller = new TestClient(app)
  await createSeller()
  await logIn(seller, 'vendeur@x.fr')
})

async function stored(key: string, variant: 'full' | 'thumb' = 'full') {
  const name = variant === 'thumb' ? `${key}.thumb.webp` : `${key}.webp`
  return readFile(join(config.uploadDir, name))
}

describe('T3.7 — photo enregistrée', () => {
  it('reçoit une clé UUID du serveur, jamais le nom du fichier envoyé', async () => {
    const response = await uploadImage(seller, await jpegBuffer(), '../../etc/passwd.jpg')

    expect(response.statusCode).toBe(201)
    const body = response.json<{ key: string; url: string; thumbUrl: string }>()
    expect(body.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(body.url).toBe(`/uploads/${body.key}.webp`)
    expect(body.thumbUrl).toBe(`/uploads/${body.key}.thumb.webp`)
    expect(response.body).not.toContain('passwd')
  })

  it('ré-encode en webp en deux tailles, sans agrandir', async () => {
    const { key } = (await uploadImage(seller, await jpegBuffer({ width: 3000 }))).json<{
      key: string
    }>()

    const full = await sharp(await stored(key)).metadata()
    const thumb = await sharp(await stored(key, 'thumb')).metadata()
    expect(full).toMatchObject({ format: 'webp', width: 1600 })
    expect(thumb).toMatchObject({ format: 'webp', width: 400 })

    const small = (await uploadImage(seller, await jpegBuffer({ width: 300 }))).json<{
      key: string
    }>()
    expect((await sharp(await stored(small.key)).metadata()).width).toBe(300)
  })

  it('supprime les EXIF, position GPS comprise', async () => {
    const original = await jpegBuffer({ withGps: true })
    expect((await sharp(original).metadata()).exif).toBeDefined()

    const { key } = (await uploadImage(seller, original)).json<{ key: string }>()

    for (const variant of ['full', 'thumb'] as const) {
      const file = await stored(key, variant)
      expect((await sharp(file).metadata()).exif).toBeUndefined()
      expect(file.includes(Buffer.from('secret-gps-paris'))).toBe(false)
    }
  })

  it('accepte jpeg, png et webp', async () => {
    const base = sharp({ create: { width: 50, height: 50, channels: 3, background: '#369' } })
    const images = [await base.clone().png().toBuffer(), await base.clone().webp().toBuffer()]

    for (const image of images) {
      expect((await uploadImage(seller, image)).statusCode).toBe(201)
    }
  })
})

describe('T3.6 — contenu vérifié', () => {
  it('refuse un fichier qui n’est pas une image, même renommé en .jpg', async () => {
    const response = await uploadImage(seller, Buffer.from('<?php echo 1; ?>'), 'photo.jpg')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: { code: 'INVALID_IMAGE', message: 'Photo invalide.' },
    })
  })

  it('refuse un type déclaré image/jpeg dont le contenu est autre (SVG, GIF)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>')
    const gif = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#000' } })
      .gif()
      .toBuffer()

    for (const content of [svg, gif]) {
      expect((await uploadImage(seller, content, 'photo.jpg', 'image/jpeg')).statusCode).toBe(400)
    }
  })

  it('refuse un fichier vide', async () => {
    expect((await uploadImage(seller, Buffer.alloc(0))).statusCode).toBe(400)
  })
})

describe('contrôles de l’upload', () => {
  it('refuse un fichier de plus de 5 Mo (413)', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1)

    const response = await uploadImage(seller, big)

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' },
    })
  })

  it('refuse une requête qui n’est pas multipart (415)', async () => {
    const response = await seller.http('POST', '/api/uploads/images', {
      payload: Buffer.from('{}'),
      contentType: 'application/json',
    })

    expect(response.statusCode).toBe(415)
  })

  it('refuse les visiteurs (401), acheteurs et admins (403), sans lire le corps', async () => {
    const { payload, contentType } = await multipartBody(await jpegBuffer())
    await createUser({ email: 'acheteur@x.fr', emailVerifiedAt: new Date() })
    await createUser({ email: 'admin@x.fr', role: 'admin', emailVerifiedAt: new Date() })
    const buyer = new TestClient(app)
    const admin = new TestClient(app)
    await logIn(buyer, 'acheteur@x.fr')
    await logIn(admin, 'admin@x.fr')

    const codes = []
    for (const client of [new TestClient(app), buyer, admin]) {
      codes.push(
        (await client.http('POST', '/api/uploads/images', { payload, contentType })).statusCode,
      )
    }

    expect(codes).toEqual([401, 403, 403])
  })

  it('relit le rôle en base : un vendeur rétrogradé ne peut plus envoyer', async () => {
    const { User } = await import('../src/models')
    await User.updateOne({ email: 'vendeur@x.fr' }, { $set: { role: 'buyer' } })

    expect((await uploadImage(seller, await jpegBuffer())).statusCode).toBe(403)
  })

  it('limite à 20 photos par heure et par utilisateur', async () => {
    const image = await jpegBuffer({ width: 100 })
    const statuses: number[] = []
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await uploadImage(seller, image)).statusCode)
    }

    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true)
    expect(statuses[20]).toBe(429)
  })
})

describe('service des fichiers', () => {
  it('sert la photo en lecture seule avec un cache long et un accès inter-origine', async () => {
    const { key } = (await uploadImage(seller, await jpegBuffer())).json<{ key: string }>()

    const response = await app.inject({ method: 'GET', url: `/uploads/${key}.webp` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/webp')
    expect(response.headers['cache-control']).toContain('max-age=31536000')
    expect(response.headers['cache-control']).toContain('immutable')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(WEB_ORIGIN).toBeDefined()
  })

  it('ne sert ni listing de dossier ni chemin remontant', async () => {
    for (const url of ['/uploads/', '/uploads/..%2f..%2fpackage.json', '/uploads/%2e%2e/x']) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(response.statusCode).toBeLessThan(500)
    }
  })

  it('refuse les écritures sur /uploads', async () => {
    const response = await app.inject({ method: 'POST', url: '/uploads/x.webp' })

    expect(response.statusCode).toBe(404)
  })
})
