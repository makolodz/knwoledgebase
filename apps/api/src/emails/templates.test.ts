import { describe, expect, it } from 'vitest'
import { EMAIL_TEMPLATES, renderEmail, type EmailTemplateName } from './templates'

const LINK = 'https://encheres.example/verify-email?token=abc123'

const SAMPLE_DATA: Record<EmailTemplateName, unknown> = {
  'verify-email': { name: 'Ana', link: LINK },
  'account-exists': {
    name: 'Ana',
    loginLink: 'https://encheres.example/login',
    resetLink: 'https://encheres.example/forgot-password',
  },
  'password-reset': { name: 'Ana', link: LINK },
  'password-changed': { name: 'Ana' },
  'email-change-confirm': { name: 'Ana', link: LINK },
  'email-change-notice': { name: 'Ana', newEmail: 'nouvelle@x.fr' },
}

const NAMES = Object.keys(EMAIL_TEMPLATES) as EmailTemplateName[]

describe('T2.24 — modèles d’email', () => {
  it('chaque modèle a un exemple dans ce test', () => {
    expect(Object.keys(SAMPLE_DATA).sort()).toEqual([...NAMES].sort())
  })

  it.each(NAMES)('%s : renvoie un sujet, un HTML et un texte', (name) => {
    const email = renderEmail(name, SAMPLE_DATA[name])

    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html).toContain('<html lang="fr">')
    expect(email.text).toContain('Bonjour Ana,')
    expect(email.html).toContain('Bonjour Ana,')
  })

  it.each(['verify-email', 'password-reset', 'email-change-confirm'] as const)(
    '%s : le lien est dans le bouton et dans la version texte',
    (name) => {
      const email = renderEmail(name, SAMPLE_DATA[name])

      expect(email.html).toContain(`href="${LINK}"`)
      expect(email.text).toContain(LINK)
    },
  )

  it('indique la durée de validité des liens : 24 h pour la vérification, 1 h pour la réinitialisation', () => {
    expect(renderEmail('verify-email', SAMPLE_DATA['verify-email']).text).toContain('24 heures')
    expect(renderEmail('password-reset', SAMPLE_DATA['password-reset']).text).toContain('1 heure')
  })

  it('échappe le nom d’affichage dans le HTML : il vient de l’utilisateur', () => {
    const name = '<script>alert(1)</script> & "Ana"'

    const email = renderEmail('verify-email', { name, link: LINK })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Ana&quot;')
    expect(email.text).toContain(name)
  })

  it('n’met jamais de donnée de l’utilisateur dans le sujet', () => {
    for (const name of NAMES) {
      const data = SAMPLE_DATA[name] as Record<string, unknown>
      const email = renderEmail(name, { ...data, name: 'Ana-Unique-123' })

      expect(email.subject).not.toContain('Ana-Unique-123')
    }
  })

  it('échappe aussi le lien dans l’attribut href', () => {
    const email = renderEmail('verify-email', {
      name: 'Ana',
      link: 'https://encheres.example/?a="b"&c=<d>',
    })

    expect(email.html).not.toContain('href="https://encheres.example/?a="b"')
    expect(email.html).toContain('&quot;b&quot;&amp;c=')
  })

  it.each(['javascript:alert(1)', 'ftp://exemple.fr/fichier', 'pas un lien', ''])(
    'refuse le lien %j (seuls http et https sont acceptés)',
    (link) => {
      expect(() => renderEmail('verify-email', { name: 'Ana', link })).toThrow()
    },
  )

  it('refuse des données incomplètes et un modèle inconnu', () => {
    expect(() => renderEmail('verify-email', { name: 'Ana' })).toThrow()
    expect(() => renderEmail('password-changed', {})).toThrow()
    expect(() => renderEmail('inconnu', {})).toThrow(/inconnu/)
    expect(() => renderEmail('toString', {})).toThrow(/inconnu/)
  })
})
