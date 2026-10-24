# ⚡ DevArena - Le Kahoot! des Développeurs & DevOps

[![CI](https://github.com/kevinbogmis-ops/Devarena/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinbogmis-ops/Devarena/actions/workflows/ci.yml)

**DevArena** est une application web de quiz multijoueur en temps réel conçue sur-mesure pour les étudiants et professionnels de l'informatique (Dev, Réseau, DevOps, Cloud, Cyber).

![Une question en cours, côté joueur, avec la barre de jokers](docs/screenshots/question.png)

---

## 💡 Pourquoi DevArena ?

J'ai créé DevArena pour travailler mes bases en informatique avec mes amis, qui vivent dans des villes différentes. Réviser seul, c'est vite pénible : l'idée était d'en faire un jeu qu'on lance ensemble à distance, qui donne envie d'en savoir plus et rend l'apprentissage agréable.

Le projet est **toujours en amélioration** : il évolue au fil des parties et des retours.

---

## 🎮 Comment jouer

1. **Le Maître du jeu (Host)** ouvre l'écran Host sur un grand écran (ou en partage d'écran), choisit les catégories, le niveau et le nombre de questions.
2. **Les joueurs** rejoignent depuis leur smartphone avec le **code PIN** ou en scannant le **QR code**, puis choisissent un pseudo.
3. Chaque question est chronométrée : **plus on répond vite et juste, plus on marque**. Les bonnes réponses remplissent la jauge d'énergie ⚡ qui débloque les **jokers**.
4. Après chaque question : la bonne réponse **et son explication**, les statistiques et le Top 5. En fin de partie : podium, **Hall of Fame** all-time, et pour chaque joueur un **récapitulatif de ses erreurs** (sa réponse, la bonne, et le pourquoi) à relire à froid.

| Accueil | Lobby du Maître du jeu |
|---|---|
| ![Page d'accueil](docs/screenshots/accueil.png) | ![Lobby Host avec PIN, QR code et filtres](docs/screenshots/host-lobby.png) |

---

## 🃏 Les jokers

Chaque bonne réponse remplit une **jauge d'énergie ⚡ (max 100)**. Plus la série de bonnes réponses 🔥 est longue, plus elle se remplit vite :

| Série en cours | 1 | 2 | 3 | 4 | 5 et + |
|---|---|---|---|---|---|
| Énergie gagnée | +10 ⚡ | +15 ⚡ | +20 ⚡ | +25 ⚡ | +30 ⚡ (plafond x3) |

Cette énergie se dépense en jokers, **pendant une question et avant d'avoir répondu**.

### 🛡️ Jokers défensifs (pour soi)

| Joker | Coût | Effet |
|---|---|---|
| 🎯 `--fifty` | 30 ⚡ | Élimine 2 mauvaises réponses de ton écran |
| 🛡️ `try/catch` | 40 ⚡ | Ta série 🔥 survit même si tu réponds faux |
| 🚀 `sudo boost` | 45 ⚡ | Ta réponse à cette question vaut le double de points |

### ⚔️ Jokers offensifs (contre un adversaire)

| Joker | Coût | Effet |
|---|---|---|
| 💥 `DDoS.sh` | 25 ⚡ | Fait glitcher l'écran de la cible pendant 4 s |
| 🕵️ `rot13 --attack` | 35 ⚡ | Chiffre les réponses de la cible pendant 5 s |
| 💰 `exploit --steal` | 60 ⚡ | Vole immédiatement 10 % des points de la cible |

### Règles

- **Ciblage automatique** : une attaque vise toujours le joueur **juste au-dessus de toi** au classement (le n°1 attaque le n°2). Le leader est donc le plus exposé, ce qui permet aux autres de remonter.
- **Maximum 1 joker défensif + 1 joker offensif par question.**
- Une même attaque ne se cumule pas : impossible de DDoS un joueur déjà sous DDoS.
- Chaque utilisation s'affiche en direct sur l'écran du Maître du jeu.

---

## 🧮 Calcul des points

Le score est calculé **côté serveur** : les questions sont envoyées aux joueurs **sans la bonne réponse** (anti-triche).

$$\text{Points} = \max\left(150,\ 1000 \times \left(1 - \frac{\text{Temps de réponse}}{\text{Temps limite}}\right)\right) + \text{Bonus de série}$$

- **Bonus de série** : +50 pts par bonne réponse consécutive (plafonné à +250).
- **Plancher** : une bonne réponse rapporte au moins 150 pts, même à la dernière seconde.
- `sudo boost` double le total. Mauvaise réponse = 0 pt et série remise à zéro (sauf `try/catch`).
- **Temps limite selon le niveau** : Débutant 20 s, Intermédiaire 25 s, Avancé 30 s, Expert 35 s.

---

## 🚀 Fonctionnalités clés

- **Temps réel avec WebSockets** : synchronisation instantanée via `Socket.io` entre l'écran du Host et les smartphones.
- **Banque de 218 questions techniques** : 10 catégories, **Cisco (25), Docker (24), AWS (24), Linux (24), Réseau (21), Terraform (20), Ansible (20), Supabase (20), Git (20), Kubernetes (20)**, sur 4 niveaux : **Débutant, Intermédiaire, Avancé, Expert**.
- **Parties sur mesure** : filtres multi-sélection par catégorie et niveau, de 5 à 50 questions (mode Marathon).
- **Jokers & jauge d'énergie** : voir [Les jokers](#-les-jokers).
- **Classements** : Top 5 envoyé aux joueurs après chaque question, podium animé, **Hall of Fame** all-time (PostgreSQL).
- **Apprendre de ses erreurs** : chaque question a une explication, affichée à tous après la manche. En fin de partie, chaque joueur reçoit la liste de ses questions ratées avec la bonne réponse et l'explication.
- **Reconnexion** : un joueur qui perd le réseau revient avec son score et sa série ; si l'écran Host se ferme, la partie continue 45 s le temps qu'il revienne.
- **Contrôle du Host** : arrêt de partie à tout moment, retour au lobby avec les mêmes joueurs pour relancer.
- **Éditeur de questions** : interface d'administration protégée par token (voir plus bas).
- **Mode révision** : quiz solo sur les 218 questions, sans hôte ni chrono ; les questions ratées reviennent jusqu'à ce qu'elles soient réussies, y compris celles ratées en partie multijoueur (voir [Mode révision](#-mode-révision-quiz-solo)).
- **Labs commandes** : entraînement solo dans un terminal simulé, directement dans le navigateur et sur mobile : une mission, tu tapes la commande (voir [Labs commandes](#️-labs-commandes-dans-le-navigateur)).
- **Labs pratiques** : terminal Docker reproductible avec DSOXLab pour pratiquer Terraform, Docker, Linux… sur de vrais systèmes (voir [Labs pratiques](#-labs-pratiques-dsoxlab)).
- **Design « Dark IDE / Terminal »** : police `Fira Code`, touches façon clavier mécanique 3D, animations (machine à écrire, podium, confettis).
- **Son 100 % généré** : bruitages 8-bit et musique de fond chiptune synthétisés par la Web Audio API, **aucun fichier audio**.
- **Prêt pour Docker** : image Alpine multi-stage, utilisateur non-root, `HEALTHCHECK`, arrêt propre ; Docker Compose avec PostgreSQL et tunnel Cloudflare pour jouer à distance en HTTPS.

---

## 📁 Structure du projet

```
devarena/
├── server.js                  # Serveur Express + Socket.io : salles, scores, jokers, API admin
├── db.js                      # Module PostgreSQL (schéma, seed, parties, top scores)
├── questions.json             # Banque de 218 questions (source de vérité)
├── commands.json              # 45 labs « tape la commande » (mission, variantes, indice, explication)
├── command-labs.js            # Vérification des commandes côté serveur
├── docker-compose.yml         # App + PostgreSQL + profils Cloudflare Tunnel et labs
├── Dockerfile                 # Image Alpine multi-stage, non-root, HEALTHCHECK
├── package.json               # Dépendances (express, socket.io, pg, cors)
├── test_*.js                  # Suites de tests (validation, e2e, reconnexion, jokers...)
├── lab/Dockerfile             # Terminal de labs DSOXLab (profils lab / lab-docker)
├── docs/screenshots/          # Captures d'écran du README
└── public/                    # Frontend Vanilla HTML5 / CSS3 / JS (sans build)
    ├── index.html             # Accueil (Host / Player, Hall of Fame)
    ├── host.html              # Écran Maître du jeu (PIN, QR code, filtres, podium)
    ├── player.html            # Écran joueur mobile-first (4 touches, jokers)
    ├── admin.html             # Éditeur de questions
    ├── labs.html              # Labs commandes (terminal d'entraînement solo)
    ├── revision.html          # Mode révision (quiz solo, progression locale)
    ├── css/style.css          # Design system Dark IDE
    └── js/
        ├── client.js          # Utilitaires partagés
        ├── host.js            # Contrôleur de l'écran Host
        ├── player.js          # Contrôleur de l'écran joueur
        ├── admin.js           # Contrôleur de l'éditeur
        ├── fx.js              # Animations (machine à écrire, compteurs, confettis)
        ├── sound.js           # Synthé Web Audio (bruitages + musique chiptune)
        └── qrcode.js          # Génération du QR code
```

---

## 💻 Démarrage en local

### 1. Installation des dépendances
```bash
cd devarena
npm install
```

### 2. Lancement du serveur
```bash
npm start
```

Rendez-vous ensuite sur :
- **Accueil** : `http://localhost:3000`
- **Maître du jeu (Host)** : `http://localhost:3000/host.html`
- **Joueurs** : `http://localhost:3000/player.html`

Sans base PostgreSQL, le serveur fonctionne en **mode fichier** (pas de Hall of Fame).

### 3. Tests
```bash
npm test
```
10 suites : validation des questions, des labs et du HTML, cycle de jeu complet, reconnexion joueur, jokers, reconnexion hôte, durcissement, éditeur, labs commandes, récapitulatif de fin de partie, mode révision.

Les mêmes tests tournent automatiquement sur GitHub Actions à chaque push (avec l'audit de sécurité des dépendances et le build de l'image Docker), ainsi que chaque lundi pour repérer les nouvelles failles publiées.

Sans Node.js installé, les tests peuvent tourner dans un conteneur jetable :
```bash
docker run --rm -v "${PWD}:/app" -w /app node:20-alpine npm test
```

---

## 🐳 Déploiement avec Docker Compose (app + PostgreSQL)

La stack complète (application + base PostgreSQL 16) se lance avec Docker Compose :

```bash
# Construire et démarrer app + base de données
docker compose up -d --build

# L'application est disponible sur le port 3300 (configurable) :
# http://localhost:3300
curl http://localhost:3300/health

# Arrêter la stack (les données PostgreSQL sont conservées dans le volume pgdata)
docker compose down

# Tout supprimer, y compris les données
docker compose down -v
```

Le port hôte est configurable via la variable `DEVARENA_PORT` (défaut : `3300`) :
```bash
DEVARENA_PORT=8088 docker compose up -d
```

### 🗄️ Persistance PostgreSQL

- Au démarrage, le serveur crée automatiquement le schéma (`questions`, `games`, `game_players`) puis **seed la table `questions` depuis `questions.json`** (upsert idempotent : le fichier JSON reste la source de vérité, toute modification est répercutée au redémarrage).
- Chaque partie terminée est enregistrée en base (classement final, scores, précision).
- **Top scores globaux** : `GET /api/scores/top?limit=10`.
- Si PostgreSQL est indisponible (ex. `npm start` sans base), le serveur fonctionne en **mode fichier** avec `questions.json`, sans persistance.
- Connexion configurable via `DATABASE_URL` (défaut : `postgresql://devarena:devarena@localhost:5432/devarena`).

### ⚙️ Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute du serveur Node.js |
| `DATABASE_URL` | `postgresql://devarena:devarena@localhost:5432/devarena` | Connexion PostgreSQL |
| `CORS_ORIGIN` | `*` | Origines autorisées (`*` en dev ; en prod, liste séparée par des virgules, ex. `https://devarena.fr`) |
| `ADMIN_TOKEN` | *(vide)* | Token d'accès à l'éditeur de questions (`/admin.html`). **Vide = éditeur désactivé** (l'API admin répond 503) |
| `ADMIN_MAX_FAILS` | `10` | Échecs de token tolérés par visiteur avant blocage temporaire de l'éditeur (429) |
| `ADMIN_GLOBAL_MAX_FAILS` | `50` | Échecs de token tolérés au total, tous visiteurs confondus, avant blocage |
| `ADMIN_FAIL_WINDOW_MS` | `900000` (15 min) | Fenêtre de comptage des échecs (et durée du blocage) |
| `QUESTIONS_FILE` | `questions.json` | Chemin du fichier de questions (surchargé par les tests pour travailler sur une copie) |
| `ROOM_GAMEOVER_TTL_MS` | `1800000` (30 min) | Délai avant suppression d'une salle terminée |
| `ROOM_IDLE_TTL_MS` | `7200000` (2 h) | Délai avant suppression d'une salle inactive |
| `ROOM_SWEEP_INTERVAL_MS` | `300000` (5 min) | Fréquence de nettoyage des salles abandonnées |

### 📝 Éditeur de questions (admin)

Une interface d'administration permet de gérer la banque de questions sans toucher au JSON à la main :

- **Accès** : `http://localhost:3300/admin.html` (bouton « ⚙️ Éditeur » dans l'en-tête de l'accueil).
- **Protection** : token obligatoire, défini via `ADMIN_TOKEN` (fichier `.env` à la racine pour docker compose, non versionné). Sans token configuré, l'éditeur est désactivé.
- **Anti-force brute** : après 10 tokens invalides en 15 minutes, un visiteur est bloqué jusqu'à la fin de la fenêtre (même avec le bon token), et au-delà de 50 échecs au total l'éditeur se ferme pour tout le monde. Derrière le tunnel Cloudflare, chaque visiteur est identifié par sa vraie adresse (`CF-Connecting-IP`). Le token est comparé en temps constant.
- **Fonctionnalités** : liste avec recherche + filtres catégorie/niveau, ajout, modification, suppression (double confirmation). Le `timeLimit` est déduit automatiquement du niveau (Débutant 20s / Intermédiaire 25s / Avancé 30s / Expert 35s).
- **Persistance** : `questions.json` reste la **source de vérité** : chaque écriture réécrit le fichier (monté en volume dans le conteneur, donc versionnable dans git) puis resynchronise PostgreSQL. Les modifications sont immédiatement visibles par le moteur de jeu.
- **API** : `GET/POST /api/admin/questions`, `PUT/DELETE /api/admin/questions/:id` (header `x-admin-token`).

Test de persistance de bout en bout (nécessite la stack compose démarrée) :
```bash
npm run test:db
```

### Build Docker seul (sans base)
```bash
docker build -t devarena-app .
docker run -d -p 3000:3000 --name devarena devarena-app
```

---

## 🌍 Exposition publique en HTTPS (Cloudflare Tunnel)

Pour jouer avec des joueurs distants (smartphones hors du réseau local), on expose l'app en HTTPS via **Cloudflare Tunnel** : aucun port à ouvrir sur la box, certificat HTTPS et WebSockets gérés automatiquement.

### Mode éphémère (zéro configuration, URL aléatoire)
```bash
# Démarrer l'app + la base, puis le tunnel
docker compose up -d
docker compose --profile tunnel up -d

# Récupérer l'URL publique https://xxxx.trycloudflare.com
docker compose logs cloudflared | grep trycloudflare.com
```
L'URL change à chaque redémarrage du tunnel. Idéale pour une session ponctuelle.

**Astuce QR code** : collez l'URL `https://...trycloudflare.com` dans le champ *« URL Cloudflare Tunnel »* de l'écran Host. Le QR code et le lien d'invitation pointeront alors vers l'adresse publique, scannables par n'importe quel smartphone.

### Mode permanent (URL/domaine fixe, compte Cloudflare requis)
```bash
# 1. Créer un tunnel sur https://one.dash.cloudflare.com et copier le token
# 2. Le lancer (URL/domaine stable) :
TUNNEL_TOKEN="votre-token" docker compose --profile tunnel-named up -d
```

### Arrêter le tunnel
```bash
docker compose --profile tunnel down     # ou --profile tunnel-named
```

> 🔒 En exposition publique, pensez à restreindre `CORS_ORIGIN` à votre domaine (voir le tableau des variables d'environnement).

---

## 📚 Mode révision (quiz solo)

Pour réviser seul les 218 questions, à son rythme : **`http://localhost:3300/revision.html`** (bouton « 📚 Révision » dans l'en-tête de l'accueil). Pas d'hôte, pas de chrono, et ça marche sur téléphone.

- **Après chaque réponse** : la bonne réponse et l'explication (« 💡 Pourquoi ? »).
- **Les erreurs reviennent** : une question ratée revient un peu plus loin dans la même session, puis en tête des sessions suivantes, jusqu'à ce qu'elle soit réussie. Elle est **maîtrisée** après deux bonnes réponses d'affilée.
- **Lien avec le multijoueur** : les questions ratées en partie sont ajoutées « à revoir », et le récapitulatif de fin de partie propose de les réviser tout de suite.
- **Progression** par catégorie (maîtrisées / total), filtres par catégorie et niveau, sessions de 10, 20 ou 50 questions, bouton « Revoir mes erreurs ».
- **Clavier** : touches A à D (ou 1 à 4) pour répondre, Entrée pour continuer.
- **Sans compte** : la progression reste dans le navigateur (bouton de réinitialisation à double confirmation). Comme en partie, la bonne réponse n'est envoyée qu'après la réponse du joueur.

---

## ⌨️ Labs commandes (dans le navigateur)

Pour mémoriser les commandes, sans rien installer : **`http://localhost:3300/labs.html`** (bouton « ⌨️ Labs » dans l'en-tête de l'accueil). Ça marche aussi sur téléphone.

Chaque lab donne une **mission** (« Liste les pods de tous les namespaces ») et tu tapes la commande dans un terminal simulé :

- **Variantes acceptées** : ordre des options, formes longues (`--all` pour `-a`), abréviations Cisco (`sh ip int br`), `sudo` ou invite `$` collée.
- **Retour immédiat** : « Presque » si l'outil et la sous-commande sont bons, sinon un message plus général. Après deux erreurs, un rappel de l'indice.
- **💡 Indice**, puis **👁 Solution** (deux clics), suivie d'une **explication** du pourquoi. Un lab dont la solution a été vue n'est pas compté comme réussi : il faudra le retenter.
- **Filtres** par catégorie et niveau, mode « seulement les labs pas encore réussis », **progression** gardée dans le navigateur (sans compte).
- **Anti-triche** : comme pour le quiz, les solutions ne sont jamais envoyées au navigateur ; chaque commande est vérifiée par le serveur.

45 labs pour commencer : Docker (7), Kubernetes (7), Git (6), Linux (8), Terraform (6), Ansible (3), Réseau (4), Cisco (2), AWS (2).

**Ajouter un lab** : une entrée dans [`commands.json`](commands.json) avec `mission`, `solution`, `hint`, `explanation` et, si besoin, `accepted` (autres écritures exactes) ou `patterns` (expressions régulières ancrées, pour les options dans le désordre). `npm test` vérifie le format et que la solution est bien acceptée.

---

## 🧪 Labs pratiques (DSOXLab)

Pour passer de la théorie à la pratique, DevArena fournit un **terminal de labs reproductible** basé sur [DSOXLab](https://github.com/stephrobert/dsoxlab), le moteur de labs de [Stéphane Robert](https://www.stephane-robert.info). Chaque lab donne une mission, puis **vérifie l'état réel du système** (pas les commandes tapées) et attribue un score.

Tout tourne dans Docker, en versions figées (voir [`lab/Dockerfile`](lab/Dockerfile)) : DSOXLab 0.5.5, Terraform 1.16.7, client Docker 27.5.1 et les catalogues fixés à un commit précis. Rien à installer sur sa machine, pas même Python.

### Labs « shell » (Terraform, Linux…)
```bash
docker compose --profile lab run --rm lab
```
Un terminal s'ouvre avec `dsoxlab` prêt. Par exemple :
```bash
dsoxlab demo && cd ~/.local/share/dsoxlab/demo   # lab de découverte
dsoxlab course premiers-pas                       # le cours
dsoxlab challenge premiers-pas                    # la mission
dsoxlab check premiers-pas                        # la vérification et le score

cd ~/catalogs/terraform && dsoxlab list-labs      # 91 labs Terraform
```

### Labs Docker
```bash
docker compose --profile lab-docker run --rm lab-docker
cd ~/catalogs/containers && dsoxlab list-labs

# Après la session, arrêter le moteur Docker du lab :
docker compose --profile lab-docker stop dind
```
Ce profil ajoute un moteur `docker:dind` **privilégié**, nécessaire pour construire et lancer des conteneurs dans le lab : à utiliser **uniquement en local**.

### Bon à savoir

- **Progression conservée** dans le volume `labhome` (catalogues et scores). Pour repartir de zéro : `docker volume rm devarena_labhome`.
- **Autres catalogues** : `dsoxlab catalog add linux` (ou `ansible`…) depuis le terminal du lab.
- **Export des résultats** en JSON : `dsoxlab export`.
- **Isolation** : les labs tournent sur un réseau séparé (`labnet`), sans port publié, jamais exposés par le tunnel Cloudflare.

| Type de lab | En conteneur |
|---|---|
| Labs « shell » (Terraform, une partie de Linux) | ✅ Testé : lab Terraform validé 7/7 |
| Labs Docker | ✅ Testé avec le profil `lab-docker` : lab validé 7/7 |
| Labs « vm » (la majorité du catalogue Linux) | ❌ Nécessitent KVM : utiliser [l'appliance VM officielle](https://github.com/stephrobert/dsoxlab/blob/main/docs/appliance.md) |

> **Crédits** : DSOXLab (licence Apache 2.0) et ses catalogues de labs (licence CC BY 4.0) sont l'œuvre de **Stéphane Robert**, [www.stephane-robert.info](https://www.stephane-robert.info). DevArena ne fait que les assembler dans un environnement Docker.

---

## 🛠️ En cours d'amélioration

DevArena évolue au fil des parties. Quelques idées dans la liste :

- Nouveaux jokers : `git revert`, `virus.exe`, `MITM`
- Éditeur : prévisualisation des questions, import/export
- Toujours plus de questions et de catégories

Idées de questions, de jokers ou retours de partie : les **issues** et **pull requests** sont les bienvenues !

---

## 👨‍💻 Auteur & Copyright

- **Auteur & Concepteur** : **Kevin BOGMIS**
- **Projet** : DevArena (2026)
- **Licence** : [MIT](LICENSE)
