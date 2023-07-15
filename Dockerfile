# Etape de production
FROM node:20-alpine as production

# Définition du répertoire de travail
WORKDIR /usr/app

# Copie des fichiers nécessaires
COPY .next .
COPY ./public .
COPY ./package*.json .

RUN npm ci --omit=dev --ignore-scripts

# Exposition du port 3000
EXPOSE 3000

# Execution du serveur
CMD ["npm", "start"]