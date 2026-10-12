import { originSchema } from '@encheres/shared'
import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('localhost'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: originSchema.default('http://localhost:5173'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
})

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  /** Seule origine autorisée par CORS, HTTP et Socket.IO (docs/technical/security.md). */
  webOrigin: string
  logLevel: (typeof LOG_LEVELS)[number]
}

/** Erreur de configuration : le message liste les variables en cause, jamais leurs valeurs. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuration invalide :\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`),
    )
  }
  const parsed = result.data
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    logLevel: parsed.LOG_LEVEL,
  }
}
