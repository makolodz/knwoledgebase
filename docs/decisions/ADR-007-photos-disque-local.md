# ADR-007 : Photos stockées sur disque local

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Chaque enchère a 1 à 5 photos. Le volume attendu est faible (une association), et on veut le moins de services externes possible.

## Décision
- Les photos sont stockées sur le **disque du serveur API**, dans le dossier `UPLOAD_DIR`, monté comme **volume Docker persistant**.
- Upload **via l'API** (`@fastify/multipart`), jamais directement depuis le client vers le disque.
- Traitement avec **sharp** :
  - type accepté uniquement s'il est vérifié **sur le contenu** du fichier (jpeg, png, webp), pas sur l'extension ;
  - taille ≤ **5 Mo** ;
  - ré-encodage en **webp** ;
  - deux tailles : image principale (côté le plus long ≤ 1600 px) et miniature (≤ 400 px) ;
  - **suppression des métadonnées EXIF**, qui peuvent contenir la position GPS. C'est le comportement par défaut de sharp : ne jamais appeler `withMetadata()`.
- Les fichiers sont nommés par un **UUID généré par le serveur**, jamais par le nom fourni par l'utilisateur (risque de path traversal). `auctions.images[]` contient ces clés.
- Les fichiers sont servis en lecture seule par Fastify (`@fastify/static`) sous `/uploads/`, avec un cache long : un fichier n'est jamais modifié, seulement remplacé par une nouvelle clé.
- Accès via une interface `storage` (`apps/api/src/infra/storage.ts` : `put`, `delete`, `url`). Le reste du code ne connaît pas le disque.
- Supprimer les fichiers quand une photo est retirée ou qu'un `draft` est supprimé.

## Conséquences
- ➕ Aucun service ni identifiant supplémentaire ; le plus simple à faire tourner en local.
- ➖ **Une seule instance de l'API** est possible : le disque n'est pas partagé entre instances. Cela rend aussi inutile, pour l'instant, l'adapter Socket.IO multi-instances.
- ➖ Le volume `UPLOAD_DIR` doit être **sauvegardé** en même temps que MongoDB, et ne doit jamais être perdu lors d'un redéploiement.
- ➖ Les images passent par Node : pas de CDN.
- Si le projet doit passer à plusieurs instances, migrer vers un stockage S3-compatible. Seule l'implémentation de `storage` change ; ce sera un nouvel ADR qui remplace celui-ci.

## Alternatives écartées
- **Stockage S3-compatible** (Scaleway, OVH, R2) : plus robuste et prêt pour plusieurs instances, mais c'est un service de plus. Reste la cible en cas de croissance.
- **GridFS** : alourdit la base et ses sauvegardes, sans vrai gain par rapport au disque.
- **Cloudinary** : dépendance forte à un service pour un besoin simple.
