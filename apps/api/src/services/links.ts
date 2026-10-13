import type { Config } from '../config/env'

/** Lien vers une page du front, avec le token en paramètre (`/verify-email?token=…`). */
export function buildWebLink(
  config: Pick<Config, 'webOrigin'>,
  path: string,
  params: Record<string, string> = {},
): string {
  const url = new URL(path, config.webOrigin)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  return url.toString()
}
