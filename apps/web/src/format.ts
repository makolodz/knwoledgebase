const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Prix affiché en euros à partir des centimes (docs/technical/screens.md). */
export function formatPrice(cents: number): string {
  return euros.format(cents / 100)
}

/** Date affichée dans le fuseau du navigateur. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** Durée restante, de la forme `2 j 03:14:05` ou `00:01:12`. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return days > 0 ? `${days} j ${clock}` : clock
}

/**
 * Montant saisi en euros (`12`, `12,5`, `12.50`) converti en centimes entiers, sans passer par un
 * nombre à virgule. `null` si la saisie n'est pas un montant.
 */
export function parseEuros(input: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(input.trim())
  if (match === null) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Centimes → saisie en euros (`1250` → `12,50`) pour pré-remplir un champ. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Date ISO → valeur d'un `<input type="datetime-local">` (heure locale, sans fuseau). */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Valeur d'un `<input type="datetime-local">` → date ISO UTC ; `null` si vide ou illisible. */
export function fromLocalInput(value: string): string | null {
  if (value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
