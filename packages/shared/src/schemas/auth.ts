import { z } from 'zod'
import { userRoleSchema } from './user'

/** Longueur minimale d'un mot de passe (docs/domain/workflows/account.md). */
export const PASSWORD_MIN_LENGTH = 12
/** Plafond de sécurité : évite de faire hasher à argon2 un corps de plusieurs mégaoctets. */
export const PASSWORD_MAX_LENGTH = 128

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 30

/** Normalisé (espaces retirés, minuscules) avant validation : `Ana@X.fr ` et `ana@x.fr` sont le même compte. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH)

/** Nom d'affichage public : 2 à 30 caractères, pas forcément unique. */
export const displayNameSchema = z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH)

/** Les deux cases sont obligatoires : un mineur ne peut pas s'engager à payer une enchère. */
export const registerInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: displayNameSchema,
  acceptTerms: z.literal(true),
  confirmAdult: z.literal(true),
})

/** Pas de règle de longueur à la connexion : on ne dit rien du mot de passe attendu. */
export const loginInputSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

/**
 * L'utilisateur connecté, tel que le front le voit. Jamais de `passwordHash` ni de token.
 * L'email est celui de l'utilisateur lui-même : il n'est jamais exposé aux autres.
 */
export const currentUserSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  emailVerified: z.boolean(),
})

export type RegisterInput = z.infer<typeof registerInputSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type CurrentUser = z.infer<typeof currentUserSchema>

/** Token d'un lien reçu par email (vérification, réinitialisation, changement d'adresse). */
export const emailTokenSchema = z.string().min(20).max(200)

export const verifyEmailInputSchema = z.strictObject({ token: emailTokenSchema })

export const forgotPasswordInputSchema = z.strictObject({ email: emailSchema })

export const resetPasswordInputSchema = z.strictObject({
  token: emailTokenSchema,
  password: passwordSchema,
})

export const updateProfileInputSchema = z.strictObject({ name: displayNameSchema })

/** Le mot de passe actuel n'a pas de règle de longueur : on ne dit rien de ce qu'il doit être. */
const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH)

export const changePasswordInputSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
})

export const changeEmailInputSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newEmail: emailSchema,
})

export const confirmEmailChangeInputSchema = z.strictObject({ token: emailTokenSchema })

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>
export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>
