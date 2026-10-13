import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'

export function createContext({ req }: CreateFastifyContextOptions) {
  return { log: req.log }
}

export type Context = Awaited<ReturnType<typeof createContext>>
