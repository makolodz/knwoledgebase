import { z } from 'zod'

/** Un utilisateur a un seul rôle (docs/domain/business-rules.md, « Rôles et permissions »). */
export const USER_ROLES = ['admin', 'seller', 'buyer'] as const

export const userRoleSchema = z.enum(USER_ROLES)

export type UserRole = z.infer<typeof userRoleSchema>
