# ⚡ DevArena - Le Kahoot! des Développeurs & DevOps

**DevArena** est une application web de quiz multijoueur en temps réel conçue sur-mesure pour les étudiants et professionnels de l'informatique (Dev, Réseau, DevOps, Cloud, Cyber).

---

## 🚀 Fonctionnalités Clés

- **Temps Réel avec WebSockets** : Moteur WebSocket basé sur `Socket.io` pour une synchronisation instantanée entre l'écran du Maître du jeu (Host) et les smartphones des joueurs.
- **Anti-Triche & Calcul Serveur des Scores** : Les questions sont diffusées sans la réponse correcte. Le serveur calcule le score selon la formule :
  $$\text{Points} = 1000 \times \left(1 - \frac{\text{Temps de réponse}}{\text{Temps limite}}\right) + \text{Bonus Streak}$$
- **Banque de 30 Questions Techniques** : 30 questions de niveau basique et intermédiaire sur **Docker, Terraform, Ansible, AWS, Cisco Networking et Supabase**.
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
├── questions.json             # Banque de 30 questions IT
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

## 🐳 Déploiement avec Docker

### 1. Construire l'image Docker
```bash
docker build -t devarena-app .
```

### 2. Lancer le conteneur
```bash
docker run -d -p 3000:3000 --name devarena devarena-app
```

### 3. Vérifier le conteneur et la sonde de santé
```bash
# Vérifier l'état du conteneur
docker ps

# Tester la sonde de santé HTTP
curl http://localhost:3000/health
```

### 4. Arrêter le conteneur
```bash
docker stop devarena && docker rm devarena
```

---

## 👨‍💻 Auteur & Copyright

- **Auteur & Concepteur** : **Kevin BOGMIS**
- **Projet** : DevArena (2026)
- **Licence** : MIT

