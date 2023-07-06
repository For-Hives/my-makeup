FROM node:20-alpine as builder

WORKDIR /usr/app
COPY ./ ./
RUN npm install
RUN npm run build

ARG NEXT_PUBLIC_API_URL

ENV NODE_ENV production
ENV NEXT_PUBLIC_API_URL $NEXT_PUBLIC_API_URL
EXPOSE 3000

CMD ["npm", "start"]