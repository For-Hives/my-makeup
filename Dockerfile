FROM node:20-alpine as builder

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /usr/app
COPY ./ ./
RUN npm install
RUN npm run build

ENV NODE_ENV production

EXPOSE 3000

CMD ["npm", "start"]