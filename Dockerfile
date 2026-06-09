FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

# Declare VITE_ build args RIGHT BEFORE the Vite build command
# This is the correct pattern — ARG must be after COPY for Railway to pass them
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN pnpm --filter @workspace/everydayai run build

RUN pnpm --filter @workspace/api-server run build

RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/everydayai/dist/public/. artifacts/api-server/public/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
