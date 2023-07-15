# Etape de production
FROM node:20-alpine as production

# Définition du répertoire de travail
WORKDIR /usr/app

# Copie des fichiers nécessaires depuis l'étape de build
COPY ./.next /usr/app/.next
COPY ./public /usr/app/public
COPY ./package*.json /usr/app/package*.json

RUN npm ci --omit=dev --ignore-scripts

# Exposition du port 3000
EXPOSE 3000

# Execution du serveur
CMD ["npm", "start"]