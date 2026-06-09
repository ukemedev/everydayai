FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/everydayai run build

RUN pnpm --filter @workspace/api-server run build

RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/everydayai/dist/public/. artifacts/api-server/public/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
