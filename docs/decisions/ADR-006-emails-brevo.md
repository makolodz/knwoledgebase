# ADR-006 : Emails via Brevo (SMTP) et une file d'envoi en base

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Plusieurs notifications partent par email : offre dépassée, victoire, rappel de paiement, paiement reçu, modération ([business-rules.md](../domain/business-rules.md), section « Notifications »).
- Un email ne doit **jamais** ralentir ni faire échouer une offre ou un changement de statut.
- Un envoi raté doit être retenté.
- L'association est française : on préfère un hébergement des données dans l'UE.

## Décision
- Fournisseur : **Brevo**, utilisé via son **relais SMTP**.
- Envoi avec **Nodemailer**, derrière une interface `mailer` (`apps/api/src/infra/mailer.ts`). Aucun SDK propre à Brevo, donc on peut changer de fournisseur en modifiant seulement la configuration.
- En local : **Mailpit** (dans Docker Compose) capture tous les emails. Même code, seule la configuration SMTP change.
- **File d'envoi (outbox)** : un service n'envoie jamais d'email directement.
  - Il insère un document dans la collection `emails` ([database.md](../technical/database.md)).
  - Un job ([ADR-008](ADR-008-jobs-setinterval.md)) envoie les emails `pending` et les retente en cas d'échec : **5 tentatives** maximum, avec un délai croissant.
- Les modèles d'email sont des fonctions TypeScript dans `apps/api/src/emails/`. Chacune renvoie `{ subject, html, text }`.
- Le domaine d'envoi est configuré avec **SPF, DKIM et DMARC**.

## Conséquences
- ➕ Données dans l'UE, offre gratuite suffisante pour une association, newsletters possibles plus tard.
- ➕ Une offre n'attend jamais l'envoi d'un email ; les échecs sont retentés et visibles en base.
- ➕ Changer de fournisseur ne demande qu'un changement de configuration SMTP.
- ➖ Un job et une collection de plus à maintenir.
- ➖ Délai de quelques secondes avant l'envoi (acceptable pour des notifications).

## Alternatives écartées
- **Resend** : très bonne API, mais société américaine.
- **Postmark** : meilleure délivrabilité, mais payant dès le départ.
- **SMTP direct** (Gmail, hébergeur) : emails souvent classés en spam, quotas faibles.
- **Envoi direct sans file** : un échec SMTP ferait échouer l'action métier ou perdrait l'email.
