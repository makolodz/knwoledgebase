# Étape 3 : pièges rencontrés

Problèmes non évidents rencontrés en codant la création et la modération des enchères. Format : **problème → cause → solution**.

## Photos
- **Le type d'une photo se lit sur le contenu, pas sur son nom ni sur `Content-Type`.** `sharp(...).metadata().format` donne le vrai format ; tout ce qui n'est pas `jpeg`, `png` ou `webp` (SVG, GIF…) est refusé. `limitInputPixels` borne les « bombes de décompression ».
- **Supprimer les EXIF fait perdre l'orientation.** Un `.rotate()` sans argument applique l'orientation aux pixels avant qu'elle ne disparaisse ; sans lui, certaines photos de téléphone s'affichent couchées. Ne jamais appeler `withMetadata()` (ADR-007).
- **Helmet bloque l'affichage des photos par le front.** Il pose `Cross-Origin-Resource-Policy: same-origin`, alors que le front (`:5173`) et l'API (`:3000`) sont deux origines. Les fichiers de `/uploads/` répondent `cross-origin` (`setHeaders` de `@fastify/static`) : ils sont publics.
- **Un test d'upload se construit sans dépendance** avec `new Response(new FormData())`, qui fournit le corps `multipart` et son `content-type` (`test/images.ts`).
- **`pnpm add sharp` n'a besoin d'aucun script d'installation** : les binaires précompilés viennent de paquets optionnels par plateforme (`@img/sharp-*`).
- **Photos orphelines (non résolu).** Une photo envoyée mais jamais rattachée à une enchère (formulaire abandonné) reste sur le disque, et rien ne vérifie qu'une clé appartient bien au vendeur qui l'utilise (la clé est un UUID aléatoire, donc non devinable). Un nettoyage périodique des fichiers sans enchère, ou une collection `uploads`, sera à prévoir avant la mise en production (étape 8).

## Enchères
- **Les paramètres doivent exister dès la première lecture.** `getSettings()` fait un `upsert` avec `$setOnInsert` : deux requêtes simultanées sur une base neuve ne créent qu'un seul document, et les tests, qui vident la base entre chaque cas, n'ont pas à les recréer.
- **Un tri par prix doit porter sur le prix affiché.** Trier sur `nextMinBid` donnerait un mauvais ordre (un pas de 50 € déplace l'enchère). La liste utilise une agrégation avec `currentPrice` ou, à défaut, `startingPrice`.
- **Un champ `datetime-local` est à la minute près.** Le test E2E T3.16 ne peut pas démarrer une enchère « dans 5 secondes » : il attend jusqu'à ~90 s que le job d'ouverture la passe `live`.
- **Distinguer « inexistante » de « interdite » après un refus atomique.** La modification est un seul `findOneAndUpdate` conditionné par le propriétaire et le statut ; si rien ne correspond, une seconde lecture choisit entre `AUCTION_NOT_FOUND` (n'existe pas, ou à un autre vendeur) et `AUCTION_STATE_INVALID`.

## Outillage
- **Docker Desktop éteint empêche `pnpm infra:up`, donc le test E2E.** Un `mongod` jetable peut le remplacer : `MongoMemoryServer.create({ instance: { port: 27017 } })` (binaire déjà en cache), le temps de la session. Les emails de la file ne partent pas sans Mailpit, ce que ce test n'exige pas.
- **Le test de fumée T1.1 vérifie maintenant `/status`**, l'accueil étant devenu la liste des enchères.
