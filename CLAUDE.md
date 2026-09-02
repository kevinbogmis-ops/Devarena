# CLAUDE.md — Contexte du projet DevArena

## Consignes pour Claude

- **Toujours répondre en français.**
- Maintenir ce fichier à jour : à chaque changement notable (nouvelle fonctionnalité, décision technique, bug corrigé), mettre à jour la section « Journal / Contexte en cours ».

## Présentation du projet

**DevArena** est un clone de Kahoot! destiné aux développeurs, DevOps et experts Réseau/Cyber : une application de quiz multijoueur en temps réel (Host sur grand écran + joueurs sur smartphone).

- **Auteur** : Kevin BOGMIS — Licence MIT — Projet 2026.
- **Stack** : Node.js (CommonJS), Express 4, Socket.io 4, frontend Vanilla HTML/CSS/JS (aucun framework, aucun build).
- **Design** : thème sombre « Dark IDE / Hacker », police Fira Code, touches 3D façon clavier mécanique, sons 8-bit générés via la Web Audio API (pas de fichiers audio).

## Structure

```
devarena/
├── server.js            # Serveur Express + Socket.io, logique métier et calcul des scores (~450 lignes)
├── questions.json       # Banque de 30 questions (Docker, Terraform, Ansible, AWS, Cisco, Supabase)
├── public/
│   ├── index.html       # Accueil (choix Host / Player)
│   ├── host.html        # Écran Maître du jeu (PIN, questions, podium)
│   ├── player.html      # Écran joueur mobile-first
│   ├── css/style.css    # Design system Cyber / Dark IDE
│   └── js/              # sound.js (audio 8-bit), client.js, host.js, player.js
├── test_validation.js   # Tests de validation
├── test_e2e.js          # Tests end-to-end (socket.io-client)
├── Dockerfile           # Multi-stage, Alpine, utilisateur non-root, HEALTHCHECK
└── .dockerignore
```

## Points techniques importants

- **Anti-triche** : les questions sont diffusées aux joueurs **sans** la bonne réponse ; le score est calculé côté serveur.
- **Formule de score** : `Points = 1000 × (1 − temps_réponse / temps_limite) + bonus de streak`.
- **Endpoint santé** : `GET /health` (utilisé par le HEALTHCHECK Docker).
- Port par défaut : **3000**.

## Commandes

```bash
npm install        # Installer les dépendances
npm start          # Lancer le serveur (node server.js)
npm run dev        # Mode watch (node --watch server.js)
npm test           # test_validation.js puis test_e2e.js
docker build -t devarena-app .
docker run -d -p 3000:3000 --name devarena devarena-app
```

## Environnement de travail

- OS : Windows 11, shell PowerShell.
- Dépôt git : branche principale `main`.

## Journal / Contexte en cours

> Cette section est mise à jour par Claude au fil des sessions.

- **2026-09-02** : Création de ce fichier CLAUDE.md. État du projet : premier commit effectué (« premier commi de devarena »), dépôt propre, application fonctionnelle avec 30 questions, tests et Dockerfile en place.
- **2026-09-02** : Analyse du code effectuée. Faiblesses identifiées : (1) joueur déconnecté supprimé définitivement, pas de reconnexion possible (server.js:329) ; (2) refresh de l'hôte détruit la salle (server.js:317) ; (3) salles GAME_OVER jamais nettoyées ; (4) collision possible de PIN après 100 tentatives ; (5) CORS ouvert à `*`. Idée de Kevin en discussion : **système de jokers** (type « Qui veut gagner des millions ») débloqués via une jauge à multiplicateur de streak. Faisable : `player.streak` et `optionStats` existent déjà côté serveur ; le 50:50 est compatible anti-triche. Point d'équilibrage soulevé : le multiplicateur de série avantage le leader → prévoir un plafond. Rien d'implémenté pour l'instant.
- **2026-09-02** : Discussion persistance. Clarifié que Supabase n'est PAS intégré (seulement un sujet de quiz). Recommandation : SQLite via `better-sqlite3` (fichier local + volume Docker) pour historique des parties et top scores ; PostgreSQL si déploiement sérieux. L'état en cours de partie (rooms) reste en RAM. **Décision de Kevin : PostgreSQL avec docker-compose.**
- **2026-09-02** : **Persistance PostgreSQL implémentée et testée.** Ajouts : dépendance `pg`, module `db.js` (pool, schéma `questions`/`games`/`game_players`, seed idempotent par upsert depuis questions.json, `saveGameResults`, `getTopScores`), `docker-compose.yml` (postgres:16-alpine + volume `pgdata` + healthcheck), endpoint `GET /api/scores/top`, enregistrement des parties dans `finishGame()`, champ `database` dans `/health`. Repli automatique en mode fichier si la base est indisponible. Test dédié : `test_pg_persistence.js` (`npm run test:db`), validé contre la stack compose. **Attention : le port hôte est 3300** (via `DEVARENA_PORT`) car le port 3000 de la machine de Kevin est occupé par un conteneur open-webui. Constat annexe : questions.json ne contient que Cisco (21) et Réseau (9), contrairement au README qui annonce Docker/Terraform/AWS/etc.
- **2026-09-02** : **Kit de 102 questions généré.** Ajout de 72 questions (Docker, Terraform, Ansible, AWS, Supabase, Linux × 12 chacune : 4 Débutant, 4 Intermédiaire, 2 Avancé, 2 Expert). Échelle de difficulté normalisée à 4 niveaux : **Débutant / Intermédiaire / Avancé / Expert** (anciens Base→Débutant, Difficile→Avancé). **Bug corrigé au passage : les 30 questions d'origine avaient TOUTES la bonne réponse en position A** → options mélangées pour les 102 questions (répartition finale 27/26/28/21), et garde-fou ajouté dans test_validation.js (alerte si une position dépasse 50 %, contrôle de l'échelle de difficulté). timeLimit par niveau : 20/25/30/35 s. Base reseedée (upsert), CSS : badges `badge-linux` et `badge-réseau` ajoutés. Idées discutées pour la suite : sélection catégorie + niveau côté Host, mode « Toutes catégories » (mix), mode « Mix progressif » (difficulté croissante). Pas encore implémenté côté UI.
- **2026-09-02** : **Banque portée à 200 questions** (+98). Nouvelles catégories : **Git (12)** et **Kubernetes (12)**. Rééquilibrage : Cisco 24 (+3 Expert), Réseau 20 (+11 dont 3 Expert), Docker 24, AWS 24, Linux 24, Terraform 20, Ansible 20, Supabase 20. Toutes les catégories ont désormais les 4 niveaux. Répartition des bonnes réponses : 58/38/55/49. Badges CSS `badge-git` et `badge-kubernetes` ajoutés. Tests OK, base reseedée (200 en base, vérifié). Note : un build docker a échoué une fois sur un timeout réseau Docker Hub — un simple retry a suffi.
- **2026-09-02** : **Sélection catégorie + niveau implémentée côté Host.** Serveur : `host:room_created` envoie désormais `catalog` ({ catégorie: { difficulté: nombre } }), `host:start_game` accepte `categories` et `difficulties` (tableaux, vides = tout) et filtre via `filterQuestions()` ; erreur si 0 question ne correspond. UI Host : puces cliquables multi-sélection (chips) pour catégories et niveaux avec compteurs, puce « Toutes/Tous » par défaut, compteur en direct des questions correspondantes, bouton Lancer désactivé si 0. Option « 50 questions (Marathon) » ajoutée. CSS : classes `.filter-chips`/`.filter-chip`. Test E2E enrichi : vérifie le catalogue et qu'une partie filtrée Docker/Débutant ne sert que des questions conformes. Déployé et vérifié sur la stack compose (port 3300).
- **2026-09-02** : Page d'accueil (index.html) mise à jour, signalé par Kevin : le texte d'intro et la rangée de badges n'affichaient que 6 catégories. Ajout de Kubernetes ☸️, Git 🔀, Linux 🐧 et Réseau 🔌 → les 10 catégories sont visibles. Redéployé et vérifié.
- **2026-09-02** : Kevin a commité tout le travail du jour (persistance + 200 questions + filtres).
- **2026-09-02** : **Reconnexion des joueurs implémentée et testée.** Serveur : un joueur déconnecté en partie est marqué `connected: false` (score/série conservés) au lieu d'être supprimé ; reconnexion via même pseudo + PIN (`player:join_success` avec `resumed: true`, remap du socket et des réponses, renvoi de la question en cours avec `remainingSec` et `alreadyAnswered`) ; comptage des réponses et clôture anticipée basés sur les seuls connectés ; helpers `getConnectedPlayers()` et `broadcastPlayerList()` (liste avec drapeau `connected` et `connectedCount`). Client joueur : session dans sessionStorage (`devarena_session`), reconnexion auto sur reconnect socket ET rechargement de page, reprise sur le bon écran, session nettoyée en fin de partie. Host : joueurs hors ligne affichés grisés avec badge « ⚠ OFFLINE », compteur basé sur les connectés. Nouveau test `test_reconnect.js` (ajouté à `npm test`) : Alice marque 999 pts, se déconnecte, revient → score conservé, finit 1re. Déployé sur la stack compose. **Prochaine étape convenue : le système de jokers (jauge + multiplicateur de streak).**
