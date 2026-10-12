import { describe, expect, it } from 'vitest'
import { originSchema } from './origin'

describe('originSchema (T1.4)', () => {
  it.each(['http://localhost:5173', 'https://encheres.example', 'http://127.0.0.1:3000'])(
    'accepte %s',
    (value) => {
      expect(originSchema.parse(value)).toBe(value)
    },
  )

  it.each([
    ['une barre finale', 'http://localhost:5173/'],
    ['un chemin', 'https://encheres.example/app'],
    ['du texte', 'pas une url'],
    ['une chaîne vide', ''],
    ['un schéma sans hôte', 'http://'],
  ])('rejette %s', (_label, value) => {
    expect(originSchema.safeParse(value).success).toBe(false)
  })
})
