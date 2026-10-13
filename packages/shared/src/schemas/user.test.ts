import { describe, expect, it } from 'vitest'
import { userRoleSchema } from './user'

describe('userRoleSchema', () => {
  it.each(['admin', 'seller', 'buyer'])('accepte %s', (role) => {
    expect(userRoleSchema.parse(role)).toBe(role)
  })

  it.each(['Admin', 'moderator', '', null, 1])('refuse %j', (role) => {
    expect(userRoleSchema.safeParse(role).success).toBe(false)
  })
})
