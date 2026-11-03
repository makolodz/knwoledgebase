import sharp from 'sharp'
import { createUser, logIn } from './users'
import type { TestClient } from './trpc'

/** Une vraie photo jpeg, avec une position GPS dans ses EXIF si `withGps`. */
export async function jpegBuffer(options: { width?: number; withGps?: boolean } = {}) {
  const image = sharp({
    create: { width: options.width ?? 2000, height: 1000, channels: 3, background: '#c33' },
  })
  return (
    options.withGps === true
      ? image.withExif({ IFD0: { ImageDescription: 'secret-gps-paris' } })
      : image
  )
    .jpeg()
    .toBuffer()
}

/** Corps `multipart/form-data` d'un fichier, tel que le navigateur l'enverrait. */
export async function multipartBody(content: Buffer, filename = 'photo.jpg', mime = 'image/jpeg') {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(content)], { type: mime }), filename)
  const response = new Response(form)
  return {
    payload: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? '',
  }
}

export async function uploadImage(
  client: TestClient,
  content: Buffer,
  filename?: string,
  mime?: string,
) {
  const { payload, contentType } = await multipartBody(content, filename, mime)
  return client.http('POST', '/api/uploads/images', { payload, contentType })
}

/** Envoie une vraie photo et renvoie sa clé. */
export async function uploadKey(client: TestClient): Promise<string> {
  const response = await uploadImage(client, await jpegBuffer({ width: 800 }))
  return response.json<{ key: string }>().key
}

export async function createSeller(email = 'vendeur@x.fr', name = 'Vera') {
  return createUser({ email, name, role: 'seller', emailVerifiedAt: new Date() })
}

export async function createAdmin(email = 'admin@x.fr') {
  return createUser({ email, name: 'Admin', role: 'admin', emailVerifiedAt: new Date() })
}

export { logIn }
