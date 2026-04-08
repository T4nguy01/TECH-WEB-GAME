# WEB-GAME - Sandbox 2D multijoueur (prototype)

Prototype propre et modulaire d'un jeu sandbox 2D multijoueur, jouable dans un navigateur.

## Démarrer

1. Installer les dépendances

`npm install`

2. Lancer le serveur

`npm start`

3. Ouvrir

`http://localhost:3000`

Ouvre plusieurs onglets pour simuler plusieurs joueurs.

Au démarrage, un écran de connexion permet de créer un compte.

Les sessions utilisent un token signé et persistent même si tu redémarres le serveur.

## Régénérer la carte

`npm run reset-world`

Puis redémarre le serveur pour charger la nouvelle sauvegarde.

## Contrôles

- Déplacement : `A/D` ou `Q/D`
- Saut : `W`, `Z` ou `Espace`
- Miner : clic gauche maintenu
- Placer un bloc : clic droit
- Chat : `Entrée` pour écrire, `Entrée` pour envoyer

## Structure

- `client/` : jeu côté navigateur
- `server/` : serveur Node.js + WebSockets (`ws`)
- `data/world.json` : sauvegarde du monde
- `assets/` : futur pack de textures et sprites
