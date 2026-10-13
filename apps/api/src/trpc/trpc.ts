import { initTRPC } from '@trpc/server'
import type { Context } from './context'

const t = initTRPC.context<Context>().create({
  // Jamais de stack trace dans une réponse (docs/technical/api.md, « Erreurs »).
  // Sans cette option, tRPC l'ajoute dès que NODE_ENV n'est pas « production ».
  isDev: false,
})

export const router = t.router
export const publicProcedure = t.procedure
