# ==========================================================================
# DEVARENA - DOCKERFILE OPTIMISÉ POUR LA PRODUCTION
# Base : Node.js 20 Alpine (Légère, sécurisée et minimale)
# ==========================================================================

# Étape 1 : Installation des dépendances
FROM node:20-alpine AS deps
WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json package-lock.json* ./

# Installation des dépendances de production uniquement
RUN npm ci --only=production --ignore-scripts

# ==========================================================================
# Étape 2 : Image finale d'exécution (Runtime)
# ==========================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Définition des variables d'environnement de production
ENV NODE_ENV=production
ENV PORT=3000

# Installation de curl pour le HEALTHCHECK
RUN apk add --no-cache curl

# Copie des dépendances depuis l'étape précédente
COPY --from=deps /app/node_modules ./node_modules

# Copie du code applicatif et des assets statiques
COPY package.json server.js db.js questions.json ./
COPY public ./public

# Changement de propriétaire des fichiers pour l'utilisateur non-root
RUN chown -R node:node /app

# Utilisation de l'utilisateur standard non-privilégié 'node' pour la sécurité
USER node

# Exposition du port applicatif
EXPOSE 3000

# Sonde de santé (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage
CMD ["node", "server.js"]
