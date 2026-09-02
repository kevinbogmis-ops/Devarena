# ⚡ DevArena - Le Kahoot! des Développeurs & DevOps

**DevArena** est une application web de quiz multijoueur en temps réel conçue sur-mesure pour les étudiants et professionnels de l'informatique (Dev, Réseau, DevOps, Cloud, Cyber).

---

## 🚀 Fonctionnalités Clés

- **Temps Réel avec WebSockets** : Moteur WebSocket basé sur `Socket.io` pour une synchronisation instantanée entre l'écran du Maître du jeu (Host) et les smartphones des joueurs.
- **Anti-Triche & Calcul Serveur des Scores** : Les questions sont diffusées sans la réponse correcte. Le serveur calcule le score selon la formule :
  $$\text{Points} = 1000 \times \left(1 - \frac{\text{Temps de réponse}}{\text{Temps limite}}\right) + \text{Bonus Streak}$$
- **Banque de 200 Questions Techniques** : 10 catégories — **Cisco (24), Docker (24), AWS (24), Linux (24), Réseau (20), Terraform (20), Ansible (20), Supabase (20), Git (12), Kubernetes (12)** — classées sur 4 niveaux : **Débutant, Intermédiaire, Avancé, Expert**.
- **Design Sombre "Dark IDE / Hacker"** :
  - Typographie monospace `Fira Code`.
  - Touches de clavier mécanique 3D aux couleurs de coloration syntaxique.
  - Synthétiseur de bruitages 8-bit rétro intégré via la Web Audio API (aucun fichier MP3 requis).
- **100% Conteneurisable avec Docker** : Dockerfile multi-stage avec utilisateur non-root et `HEALTHCHECK`.

---

## 📁 Structure du Projet

```
devarena/
├── package.json               # Dépendances Node.js (express, socket.io, cors)
├── server.js                  # Serveur backend, WebSocket Socket.io et logique métier
├── questions.json             # Banque de 200 questions IT (10 catégories, 4 niveaux)
├── Dockerfile                 # Image Docker Alpine sécurisée et légère
├── .dockerignore              # Fichiers exclus du build Docker
├── README.md                  # Ce fichier de documentation
└── public/                    # Frontend Vanilla HTML5 / CSS3 / JS
    ├── index.html             # Accueil (Hub de sélection Host / Player)
    ├── host.html              # Écran Maître du Jeu (Code PIN géant, questions, podium)
    ├── player.html            # Écran Joueur Mobile-first (4 touches interactives)
    ├── css/
    │   └── style.css          # Design System Cyber / Dark IDE (touches 3D)
    └── js/
        ├── sound.js           # Synthétiseur de son Web Audio API 8-bit
        ├── client.js          # Utilitaires clients partagés
        ├── host.js            # Contrôleur d'écran du Host
        └── player.js          # Contrôleur d'écran du Joueur
```

---

## 💻 Démarrage en Local

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
| `ROOM_GAMEOVER_TTL_MS` | `1800000` (30 min) | Délai avant suppression d'une salle terminée |
| `ROOM_IDLE_TTL_MS` | `7200000` (2 h) | Délai avant suppression d'une salle inactive |
| `ROOM_SWEEP_INTERVAL_MS` | `300000` (5 min) | Fréquence de nettoyage des salles abandonnées |

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

## 👨‍💻 Auteur & Copyright

- **Auteur & Concepteur** : **Kevin BOGMIS**
- **Projet** : DevArena (2026)
- **Licence** : MIT

