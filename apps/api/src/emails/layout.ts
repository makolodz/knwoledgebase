export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface EmailContent {
  subject: string
  /** Première ligne du message, par exemple « Bonjour Ana, ». */
  greeting: string
  paragraphs: string[]
  /** Lien principal, repris en clair dans la version texte. */
  action?: { label: string; url: string }
  footer?: string
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Le nom d'affichage vient de l'utilisateur : il ne doit jamais devenir du HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

/** Construit les versions HTML et texte d'un email à partir du même contenu. */
export function composeEmail(content: EmailContent): RenderedEmail {
  const { subject, greeting, paragraphs, action, footer } = content

  const htmlParts = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(action
      ? [
          `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(action.label)}</a></p>`,
          `<p style="color:#475569;font-size:13px">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${escapeHtml(action.url)}</p>`,
        ]
      : []),
    ...(footer ? [`<p style="color:#475569;font-size:13px">${escapeHtml(footer)}</p>`] : []),
  ]
  const html =
    '<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">' +
    `${htmlParts.join('')}</body></html>`

  const text = [
    greeting,
    ...paragraphs,
    ...(action ? [`${action.label} : ${action.url}`] : []),
    ...(footer ? [footer] : []),
  ].join('\n\n')

  return { subject, html, text }
}
