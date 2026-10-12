---
paths:
  - "apps/api/**"
  - "apps/web/**"
  - "packages/shared/**"
---

# Règles : temps réel (Socket.IO) et emails

Source de vérité : [business-rules.md](../../docs/domain/business-rules.md), sections « Notifications » et « Placer une offre », et [realtime.md](../../docs/technical/realtime.md).

- **Aucun email ni donnée privée** dans un événement Socket.IO. Les événements publics n'affichent que le nom d'affichage (`name`).
- Le contrat des événements (`bid:new`, `auction:extended`, `auction:ended`, etc.) est défini dans `packages/shared`. Le client et le serveur l'importent : ne pas le redéfinir ailleurs.
- L'authentification Socket.IO se fait au handshake. Une connexion sans token valide est refusée.
- Un événement part à la room `auction:<id>` uniquement, jamais en diffusion globale.
- Entrées Socket.IO validées avec Zod, comme les entrées HTTP.
- Emails : **toujours** via la file `emails`, jamais d'envoi direct. Le SMTP passe par `apps/api/src/infra/`.
- Dans les tests, mocker seulement la frontière SMTP (`mailer`) ; vérifier qu'un email est bien ajouté à la file.
