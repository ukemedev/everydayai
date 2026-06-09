FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

# Declare build args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Write them to .env.production so Vite picks them up at build time
# This is the most reliable pattern for Railway + Vite + Docker
RUN echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" >> artifacts/everydayai/.env.production && \
    echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> artifacts/everydayai/.env.production

RUN pnpm --filter @workspace/everydayai run build

RUN pnpm --filter @workspace/api-server run build

RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/everydayai/dist/public/. artifacts/api-server/public/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
