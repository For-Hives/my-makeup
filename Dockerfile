FROM node:22-alpine

RUN addgroup -S nonroot \
  && adduser -S nonroot -G nonroot \
  && mkdir -p /usr/app \
  && chown nonroot:nonroot /usr/app

USER nonroot

# Définition du répertoire de travail (appartient à nonroot, sinon npm ci échoue en EACCES)
WORKDIR /usr/app

# Copie des fichiers nécessaires
COPY --chown=nonroot:nonroot ./.next ./.next
COPY --chown=nonroot:nonroot ./public ./public
COPY --chown=nonroot:nonroot ./package*.json .
COPY --chown=nonroot:nonroot ./src ./src
COPY --chown=nonroot:nonroot ./next* .

RUN npm ci --omit=dev --ignore-scripts

ENV NEXT_SHARP_PATH=./node_modules/sharp

# Exposition du port 3000
EXPOSE 3000

# Execution du serveur
CMD ["npm", "start"]
