import type { z } from 'zod'

export type FieldErrors = Record<string, string>

export type ValidationResult<T> = { data: T } | { errors: FieldErrors }

const DEFAULT_MESSAGE = 'Valeur invalide.'

/**
 * Valide un formulaire avec le schéma Zod partagé avec l'API (`packages/shared`) : les règles sont
 * écrites une seule fois, le serveur les revérifie. `messages` donne un texte lisible par champ ;
 * un champ imbriqué utilise son premier nom (`password`).
 */
export function validateForm<Schema extends z.ZodType>(
  schema: Schema,
  values: unknown,
  messages: Record<string, string>,
): ValidationResult<z.output<Schema>> {
  const result = schema.safeParse(values)
  if (result.success) return { data: result.data }

  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '')
    errors[field] ??= messages[field] ?? DEFAULT_MESSAGE
  }
  return { errors }
}
