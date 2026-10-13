import { randomBytes } from 'node:crypto'
import { originSchema } from '@encheres/shared'
import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/** Base MongoDB de développement : celle de docker-compose.yml. */
const DEFAULT_MONGO_URL = 'mongodb://127.0.0.1:27017/encheres'

/** Serveur SMTP de développement : Mailpit, dans docker-compose.yml. */
const DEFAULT_SMTP_HOST = '127.0.0.1'
const DEFAULT_SMTP_FROM = 'Enchères <no-reply@encheres.local>'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('localhost'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: originSchema.default('http://localhost:5173'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    // Le message est fixe : l'URL peut contenir un mot de passe, elle ne doit jamais être affichée.
    MONGO_URL: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\/./, 'doit commencer par mongodb:// ou mongodb+srv://')
      .optional(),
    // Au moins 32 caractères (docs/technical/security.md). Message fixe : jamais la valeur.
    JWT_SECRET: z.string().min(32, 'doit faire au moins 32 caractères').optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().regex(/@/, 'doit contenir une adresse email').optional(),
  })
  .superRefine((env, context) => {
    const missing = (name: string, message: string) =>
      context.addIssue({ code: 'custom', path: [name], message })

    // En production, pas de repli silencieux sur les services locaux : les emails seraient perdus
    // et la base serait celle du poste.
    if (env.NODE_ENV === 'production') {
      if (env.MONGO_URL === undefined) missing('MONGO_URL', 'obligatoire en production')
      if (env.JWT_SECRET === undefined) missing('JWT_SECRET', 'obligatoire en production')
      if (env.SMTP_HOST === undefined) missing('SMTP_HOST', 'obligatoire en production')
      if (env.SMTP_FROM === undefined) missing('SMTP_FROM', 'obligatoire en production')
    }
    // Un identifiant sans mot de passe (ou l'inverse) est une erreur de saisie, pas un SMTP ouvert.
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      missing(
        env.SMTP_USER === undefined ? 'SMTP_USER' : 'SMTP_PASSWORD',
        'SMTP_USER et SMTP_PASSWORD vont ensemble',
      )
    }
  })

export interface SmtpConfig {
  host: string
  port: number
  /** Expéditeur des emails, par exemple `Enchères <no-reply@exemple.fr>`. */
  from: string
  /** `null` pour un serveur sans authentification (Mailpit). */
  auth: { user: string; password: string } | null
}

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  /** Seule origine autorisée par CORS, HTTP et Socket.IO (docs/technical/security.md). */
  webOrigin: string
  logLevel: (typeof LOG_LEVELS)[number]
  /** Peut contenir des identifiants : ne jamais le journaliser. */
  mongoUrl: string
  /**
   * Clé de signature des access tokens. Hors production, sans JWT_SECRET, un secret aléatoire est
   * généré à chaque démarrage (ADR-014). Ne jamais le journaliser.
   */
  jwtSecret: string
  /** Contient un mot de passe éventuel : ne jamais le journaliser. */
  smtp: SmtpConfig
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
    mongoUrl: parsed.MONGO_URL ?? DEFAULT_MONGO_URL,
    jwtSecret: parsed.JWT_SECRET ?? randomBytes(32).toString('base64url'),
    smtp: {
      host: parsed.SMTP_HOST ?? DEFAULT_SMTP_HOST,
      port: parsed.SMTP_PORT,
      from: parsed.SMTP_FROM ?? DEFAULT_SMTP_FROM,
      auth:
        parsed.SMTP_USER !== undefined && parsed.SMTP_PASSWORD !== undefined
          ? { user: parsed.SMTP_USER, password: parsed.SMTP_PASSWORD }
          : null,
    },
  }
}
