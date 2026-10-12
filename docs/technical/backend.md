# Backend (`apps/api`)

## Rôle
Un seul process Node.js qui héberge :
- l'API HTTP **Fastify** ;
- le serveur **Socket.IO**, attaché au même serveur HTTP ([realtime.md](realtime.md)) ;
- les **jobs planifiés** : ouverture, clôture, rappels et expiration des paiements ([data-flow.md](../architecture/data-flow.md)) ;
- le **webhook Stripe** ([payment.md](../domain/workflows/payment.md)).

## Structure (`apps/api/src`)
- `config/` : variables d'environnement validées par Zod au démarrage
- `routes/` : routes HTTP (validation + appel de service)
- `sockets/` : handlers Socket.IO (validation + appel de service)
- `services/` : **toute** la logique métier, partagée entre HTTP, Socket.IO et jobs
- `models/` : modèles Mongoose ([database.md](database.md))
- `jobs/` : tâches planifiées

## Règles
- Node.js 22 LTS, ES modules, TypeScript strict.
- **Aucune logique métier** dans `routes/`, `sockets/` ou `jobs/` : ils valident l'entrée et appellent un service.
- Ne jamais bloquer la boucle d'événements (pas de calcul lourd synchrone).
- Variables d'environnement validées au démarrage : le serveur refuse de démarrer si elles sont invalides.
- Gestion d'erreurs centralisée ; logs structurés avec pino (intégré à Fastify) ; **jamais de secret ni de token dans les logs**.
- Le webhook Stripe a besoin du **corps brut** de la requête pour vérifier la signature : configurer cette route pour ne pas parser le JSON.
