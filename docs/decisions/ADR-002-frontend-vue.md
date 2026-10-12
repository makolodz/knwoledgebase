# ADR-002 : Front en Vue 3 + Vite

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Il faut une interface riche, mise à jour en temps réel via Socket.IO. L'équipe a de l'expérience en **Vue 3 + Vite**, **Next.js** et **create-react-app**, mais pas en React + Vite.

## Décision
**SPA Vue 3 + Vite**, avec TypeScript, Vue Router, Pinia et socket.io-client. Elle est déployée séparément de l'API Node, qui héberge Socket.IO.

## Conséquences
- ➕ Stack déjà maîtrisée : moins d'erreurs, développement plus rapide.
- ➕ Écosystème officiel cohérent (Router, Pinia) : pas de choix de librairies à faire.
- ➕ La réactivité de Vue convient bien aux mises à jour en direct.
- ➖ Pas de rendu serveur : les pages d'enchères sont moins bien référencées.
- ➖ Écosystème plus petit que React.

## Alternatives écartées
- **React + Vite** : énorme écosystème, mais pas maîtrisé par l'équipe et sans avantage décisif ici.
- **Next.js / Nuxt** : rendu serveur et SEO, mais Socket.IO s'intègre mal à leur modèle (serverless, route handlers), il faudrait de toute façon un serveur Node séparé, et Next change souvent d'API. Le SEO n'est pas un besoin identifié.
- **create-react-app** : abandonné.
- **SvelteKit** : léger, mais communauté plus petite et Svelte 5 encore récent.
- **Angular** : trop lourd pour la taille du projet.
- **Rendu serveur + HTMX** : trop limité pour une interface temps réel riche.
