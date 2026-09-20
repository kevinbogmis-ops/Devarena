# AGENTS.md — Contexte et Directives du projet DevArena

## Consignes pour l'Agent (Antigravity)

- **Langue** : Toujours répondre en français.
- **Maintien du contexte** : Maintenir ce fichier à jour à chaque changement notable (nouvelle fonctionnalité, décision technique, correction de bug, refactorisation), en ajoutant une entrée dans la section « Journal / Contexte en cours ».
- **Intégrité et tests** : Toujours vérifier que la suite de tests passe (`npm test`) après toute modification du code.
- **Code style & Philosophie** : Conserver l'approche Vanilla / zéro framework pour le frontend (HTML5/CSS3/ES6 natif, Web Audio API pour les bruitages et musique).

---

## Présentation du projet

**DevArena** est un clone de Kahoot! temps réel destiné aux profils techniques (Développeurs, DevOps, Administrateurs Réseau / Cloud / Cybersécurité).
Le concept repose sur un écran grand format pour le Maître du jeu (**Host**) et une interface mobile épurée pour les participants (**Players**).

- **Auteur** : Kevin BOGMIS — Licence MIT — Projet 2026.
- **Stack** : Node.js (CommonJS), Express 4, Socket.io 4, frontend Vanilla HTML/CSS/JS (aucun framework, aucun build).
- **Design** : Thème sombre « Dark IDE / Terminal », police Fira Code, touches 3D façon clavier mécanique, design sonore 8-bit généré via la Web Audio API (aucun asset MP3 externe requis).

---

## Structure du projet

```
devarena/
├── AGENTS.md            # Contexte, instructions et journal de bord pour l'agent
├── server.js            # Serveur Express + Socket.io, logique métier, scores, jokers, API admin
├── db.js                # Module PostgreSQL (pool, schéma, seed, scores, deleteQuestion)
├── questions.json       # Banque de 200 questions (10 catégories × 4 niveaux) — SOURCE DE VÉRITÉ
├── public/
│   ├── index.html       # Accueil (choix Host / Player, Hall of Fame, lien Éditeur)
│   ├── host.html        # Écran Maître du jeu (PIN, filtres, questions, podium)
│   ├── player.html      # Écran joueur mobile-first (jokers, jauge d'énergie)
│   ├── admin.html       # Éditeur de questions (protégé par ADMIN_TOKEN)
│   ├── css/style.css    # Design system Cyber / Dark IDE
│   └── js/              # sound.js, fx.js, client.js, host.js, player.js, admin.js, qrcode.js
├── test_validation.js   # Tests de validation (questions + équilibre HTML)
├── test_e2e.js          # Tests end-to-end (socket.io-client)
├── test_reconnect.js    # Reconnexion joueur
├── test_jokers.js       # Système de jokers
├── test_host_reconnect.js  # Reconnexion hôte
├── test_hardening.js    # PIN uniques, nettoyage salles, CORS
├── test_admin.js        # Éditeur de questions (token, validation, CRUD)
├── test_pg_persistence.js  # Persistance PostgreSQL (npm run test:db, hors suite)
├── docker-compose.yml   # app + postgres + profils cloudflared (tunnel HTTPS)
├── .env                 # Secrets locaux (ADMIN_TOKEN), non versionné
├── Dockerfile           # Multi-stage, Alpine, utilisateur non-root, HEALTHCHECK
└── .dockerignore
```

---

## Points techniques & Règles métier

- **Anti-triche** : Les questions sont diffusées aux joueurs **sans** la bonne réponse ; le score est calculé côté serveur.
- **Formule de score** :
  $$\text{Points} = 1000 \times \left(1 - \frac{\text{Temps de réponse}}{\text{Temps limite}}\right) + \text{Bonus de série}$$
- **Persistance hybride** : PostgreSQL via Docker Compose pour l'historique et le Hall of Fame ; repli automatique transparent en **mode fichier** si la base est absente.
- **Source de vérité** : `questions.json` reste la source de vérité pour la banque de questions (synchronisée avec PostgreSQL par upsert au démarrage).
- **Santé & Monitoring** : Endpoint `GET /health` utilisé par le HEALTHCHECK Docker.
- **Ports par défaut** : Port applicatif `3000` (souvent exposé sur `3300` en Docker Compose via `DEVARENA_PORT`).

---

## Commandes Fréquentes

```bash
npm install              # Installer les dépendances
npm start                # Lancer le serveur (node server.js)
npm run dev              # Mode watch (node --watch server.js)
npm test                 # Exécuter les 7 suites de tests automatisés
npm run test:db          # Tester la persistance PostgreSQL (nécessite la DB active)
docker compose up -d     # Lancer l'app + PostgreSQL en arrière-plan
```

---

## Environnement de travail

- **OS** : Windows 11, shell PowerShell.
- **Dépôt Git** : Branche principale `main`.

---

## Journal / Contexte en cours

- **2026-09-02** : Création initiale du projet et mise en place de la stack Vanilla + Express + Socket.io.
- **2026-09-02** : **Persistance PostgreSQL implémentée.** Module `db.js`, docker-compose (PostgreSQL 16), seed automatique idempotent depuis `questions.json`, endpoint `/api/scores/top`. Repli en mode fichier automatique.
- **2026-09-02** : **Banque étendue à 200 questions** sur 10 catégories (Cisco, Réseau, Docker, AWS, Linux, Terraform, Ansible, Supabase, Git, Kubernetes) avec 4 niveaux (Débutant, Intermédiaire, Avancé, Expert). Équilibrage des réponses A/B/C/D.
- **2026-09-02** : **Sélection par filtres côté Hôte.** Sélection dynamique des catégories et difficultés avec compteurs en direct.
- **2026-09-02** : **Système de reconnexion des joueurs.** Déconnexion marquée sans suppression du joueur, reprise automatique d'une partie avec conservation du score et de la streak.
- **2026-09-02** : **Système de jokers interactifs.** Jauge d'énergie ⚡ (max 100), 3 jokers défensifs (`--fifty`, `try/catch`, `sudo boost`) et 3 offensifs (`DDoS.sh`, `rot13 --attack`, `exploit --steal`).
- **2026-09-02** : **Reconnexion de l'Hôte.** Période de grâce de 45 secondes en cas de déconnexion/refresh de l'écran hôte, rétablissement synchronisé de l'état de la salle.
- **2026-09-02** : **Durcissement technique.** CORS configurable (`CORS_ORIGIN`), garantie de PIN uniques à 6 chiffres, balayage et nettoyage périodique des salles abandonnées (`sweepRooms`).
- **2026-09-02** : **Exposition publique HTTPS.** Ajout du profil Cloudflare Tunnel dans `docker-compose.yml` pour jouer à distance sans redirection de port.
- **2026-09-03** : **Éditeur de questions d'administration.** Page `/admin.html` protégée par `ADMIN_TOKEN`, CRUD complet avec réécriture immédiate de `questions.json` et resynchronisation PostgreSQL.
- **2026-09-03** : **Améliorations Game Feel & Design Sonore.** Module `public/js/fx.js` (machine à écrire, confettis canvas, cascade stagger, compteurs animés), synthétiseur chiptune en boucle de fond et bruitages contextuels dans `public/js/sound.js`.
- **2026-09-03** : **Top 5 Joueurs & Amélioration Hôte.** Diffusion du Top 5 sur l'écran joueur en fin de manche, dates des scores dans le Hall of Fame, bouton d'arrêt d'urgence de la partie (`host:abort_game`).
- **2026-09-20** : **Adoption native d'Antigravity.** Création du fichier standard `AGENTS.md` à la racine pour assurer le chargement automatique du contexte projet, des règles de code et de l'historique lors de chaque session.
