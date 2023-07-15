# Etape de production
FROM node:20-alpine as production

# Définition du répertoire de travail
WORKDIR /usr/app

# Copie des fichiers nécessaires depuis l'étape de build
COPY /usr/app/.next ./.next
COPY /usr/app/public ./public
COPY /usr/app/next.config.js ./next.config.js
COPY /usr/app/node_modules ./node_modules
COPY /usr/app/package*.json ./

# Exposition du port 3000
EXPOSE 3000

# Execution du serveur
CMD ["npm", "start"]