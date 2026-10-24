# AGENTS.md — Contexte et Directives du projet DevArena

## Consignes pour l'Agent (Antigravity)

- **Langue** : Toujours répondre en français.
- **Maintien du contexte** : Maintenir ce fichier à jour à chaque changement notable (nouvelle fonctionnalité, décision technique, correction de bug, refactorisation), en ajoutant une entrée dans la section « Journal / Contexte en cours ».
- **Intégrité et tests** : Toujours vérifier que la suite de tests passe (`npm test`) après toute modification du code.
- **Commits** : ne jamais ajouter de ligne `Co-Authored-By` (ni aucune autre attribution à un agent) dans les messages de commit ou de PR. Kevin veut être le seul contributeur affiché sur GitHub.
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
├── commands.json        # 45 labs « tape la commande » — SOURCE DE VÉRITÉ (pas en base)
├── command-labs.js      # Normalisation + vérification des commandes (solutions côté serveur)
├── lab/Dockerfile       # Terminal de labs DSOXLab (profils compose lab / lab-docker)
├── public/
│   ├── index.html       # Accueil (choix Host / Player, Hall of Fame, lien Éditeur)
│   ├── host.html        # Écran Maître du jeu (PIN, filtres, questions, podium)
│   ├── player.html      # Écran joueur mobile-first (jokers, jauge d'énergie)
│   ├── admin.html       # Éditeur de questions (protégé par ADMIN_TOKEN)
│   ├── labs.html        # Labs commandes : terminal simulé d'entraînement solo
│   ├── css/style.css    # Design system Cyber / Dark IDE
│   └── js/              # sound.js, fx.js, client.js, host.js, player.js, admin.js, qrcode.js
├── test_validation.js   # Tests de validation (questions + équilibre HTML)
├── test_e2e.js          # Tests end-to-end (socket.io-client)
├── test_reconnect.js    # Reconnexion joueur
├── test_jokers.js       # Système de jokers
├── test_host_reconnect.js  # Reconnexion hôte
├── test_hardening.js    # PIN uniques, nettoyage salles, CORS
├── test_admin.js        # Éditeur de questions (token, validation, CRUD)
├── test_labs.js         # Labs commandes (variantes, anti-triche, API)
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
npm test                 # Exécuter les 8 suites de tests automatisés
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
- **2026-10-20** : **Arrêt propre du conteneur (SIGTERM).** Node, PID 1 du conteneur, ignorait SIGTERM → `docker stop` le tuait après 10s (exit 137). Handler `shutdown()` en fin de `server.js` : `io.close()` puis `db.pool.end()`, filet de sécurité à 5s. Vérifié : arrêt en 0.4s, exit 0. `CLAUDE.md` réduit à un renvoi `@AGENTS.md` pour que Claude Code charge ce même fichier. Rappels : Node n'est pas installé sur la machine → tests via `docker run --rm -v "${PWD}:/app" -w /app node:20-alpine npm test` ; port hôte **3300** (3000 occupé par open-webui) ; `.claude/` ignoré par git.
- **2026-10-20** : **README refait avant publication LinkedIn.** Ajouts : section « Pourquoi DevArena » (réviser ses bases entre amis à distance), « Comment jouer », **section Jokers complète** (table d'énergie par série, 3 défensifs / 3 offensifs avec coûts, règles de ciblage et limites), calcul des points corrigé (plancher 150 pts, bonus série +50 plafonné à +250, temps par niveau), fonctionnalités mises à jour (filtres, Top 5, Hall of Fame, reconnexion, arrêt de partie, musique), structure à jour (db.js, admin, fx.js, tests, compose), commande de tests via Docker, section « En cours d'amélioration ». Lien Éditeur corrigé (en-tête, plus pied de page). Captures dans `docs/screenshots/`. Fichier `LICENSE` (MIT) ajouté, il manquait.
- **2026-10-24** : **Labs pratiques DSOXLab conteneurisés.** Objectif de Kevin : faciliter sa révision perso (cours + quiz de progression + labs) sur le modèle du site de Stéphane Robert. Décision : option A (lab « tape la commande » dans le navigateur) à coder nous-mêmes plus tard ; option B = DSOXLab (CLI Python Apache-2.0 de Stéphane Robert, vérifie l'état réel du système via pytest-testinfra) dans Docker. `lab/Dockerfile` : python:3.12-slim-bookworm, dsoxlab 0.5.5 (venv), **Terraform 1.16.7** (le catalogue exige >= 1.15 et un lab ~> 1.16.0 ; 1.9.8 initial insuffisant), client Docker 27.5.1, utilisateur `student`, catalogues terraform (91 labs) et containers (1 lab) clonés à un SHA figé. Compose : profil `lab` (service `lab`, réseau isolé `labnet`) et profil `lab-docker` (`dind` docker:27.5.1-dind privilégié + `lab-docker` en `network_mode: service:dind` et `DOCKER_HOST=tcp://localhost:2375`, indispensable car les tests appellent l'app du lab sur localhost) ; volume `labhome` monté sur /home/student (la progression dsoxlab est stockée DANS le dossier du catalogue) ; volume `dinddata` (cache). Inactifs par défaut. **Vérifié** : démo premiers-pas 100/100, lab Terraform `getting-started-providers-resources-data-sources` 7/7, lab Docker `images-premiere-image` 7/7 via le profil, progression persistante entre deux `run`. Limites : labs `vm` (69/89 du catalogue Linux) impossibles en conteneur → appliance VM officielle ; catalogue Linux demande des collections Ansible (`dsoxlab doctor`). `dsoxlab export` produit un JSON `dsoxlab-evidence-v1` (score, tests, hints) → piste pour importer la progression dans DevArena. Crédits CC-BY/Apache dans le README. Volumes de test supprimés après vérification. Docker Desktop est installé dans `%LOCALAPPDATA%\Programs\DockerDesktop` (à lancer s'il ne tourne pas).
- **2026-10-24** : **Option A : labs « tape la commande » dans le navigateur.** Page `public/labs.html` + `js/labs.js` (bouton « ⌨️ Labs » dans l'en-tête de l'accueil). Données `commands.json` (45 labs : Docker 7, Kubernetes 7, Git 6, Linux 8, Terraform 6, Ansible 3, Réseau 4, Cisco 2, AWS 2 ; niveaux Débutant/Intermédiaire/Avancé), champs `mission`, `context` (optionnel, sortie de terminal affichée), `solution`, `accepted` (variantes exactes), `patterns` (regex ANCRÉES ^…$, testées sur la commande normalisée), `hint`, `explanation` (accents graves rendus en `<code>`). Module serveur `command-labs.js` : `normalizeCommand` (invite `$`/`>` collée, guillemets supprimés, espaces multiples, `;` final, `sudo` initial), `isAccepted`, `nearMiss` ('subcommand' = 2 premiers mots identiques à la solution, 'command' = 1er mot), `publicLab` (sans solution). API : `GET /api/labs` (sans solutions), `POST /api/labs/:id/check {answer}` (300 car. max, 400/404), `POST /api/labs/:id/reveal`. `COMMANDS_FILE` surchargeable. Le Dockerfile de l'app COPIE désormais `command-labs.js` et `commands.json` (sinon crash au démarrage). UI : filtres catégorie/niveau avec compteurs réussis/total, option « seulement à faire », barre de progression, terminal simulé (historique ↑/↓, Entrée pour soumettre puis pour passer au suivant), indice, solution en 2 clics (révélée = pas comptée réussie, badge « SOLUTION VUE »), explication, sons playCorrect/playWrong, pas d'autofocus sur écran tactile, progression `localStorage` clé `devarena_labs_progress` (try/catch). Tests : `test_labs.js` ajouté à `npm test` (74 variantes acceptées, 18 erreurs refusées, nearMiss, aucune solution dans l'API, les 45 solutions acceptées via HTTP, reveal, erreurs 400/404) ; `test_validation.js` valide `commands.json` (ids uniques, champs, niveaux, regex ancrées et compilables, badge CSS). **Bug corrigé au passage** : le bouton Labs faisait déborder l'en-tête de l'accueil sur mobile (scrollWidth 457 pour 375) → `.app-header` passe à la ligne sous 600px. Vérifié dans le navigateur (bureau + mobile 375px, aucun débordement sur index/player/labs).
