import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatPrice,
  formatRemaining,
  fromLocalInput,
  parseEuros,
  toLocalInput,
} from './format'

describe('formatPrice', () => {
  it('affiche des euros à partir des centimes', () => {
    expect(formatPrice(4500).replace(/\s/g, ' ')).toBe('45,00 €')
    expect(formatPrice(1)).toContain('0,01')
  })
})

describe('parseEuros', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12.50', 1250],
    [' 1,05 ', 105],
    ['0,99', 99],
  ])('lit %j comme %i centimes', (input, cents) => {
    expect(parseEuros(input)).toBe(cents)
  })

  it.each(['', 'abc', '-5', '1,234', '1e3', '1 000', '12,'])('refuse %j', (input) => {
    expect(parseEuros(input)).toBeNull()
  })

  it('ne se trompe pas sur les flottants (19,99 € = 1999 centimes)', () => {
    expect(parseEuros('19,99')).toBe(1999)
    expect(parseEuros('0.29')).toBe(29)
  })
})

describe('centsToInput', () => {
  it('écrit les centimes en euros avec une virgule', () => {
    expect(centsToInput(1250)).toBe('12,50')
    expect(parseEuros(centsToInput(1999))).toBe(1999)
  })
})

describe('formatRemaining', () => {
  it('affiche heures, minutes et secondes, et les jours au-delà de 24 h', () => {
    expect(formatRemaining(72_000)).toBe('00:01:12')
    expect(formatRemaining(2 * 86_400_000 + 3 * 3_600_000 + 5000)).toBe('2 j 03:00:05')
  })

  it('ne descend jamais sous zéro', () => {
    expect(formatRemaining(-5000)).toBe('00:00:00')
  })
})

describe('dates des formulaires', () => {
  it('fait l’aller-retour entre la date ISO et le champ datetime-local', () => {
    const iso = '2030-06-15T10:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('renvoie null pour une saisie vide ou illisible', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('n’importe quoi')).toBeNull()
  })
})
