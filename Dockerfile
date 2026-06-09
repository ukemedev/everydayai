# ─────────────────────────────────────────────────────────────────────────────
# EverydayAI — production Docker image
#
# IMPORTANT: VITE_* variables must be passed as build args because Vite
# bakes them into the frontend bundle at build time — not runtime.
# Pass them in Railway as:
#   VITE_SUPABASE_URL → Build Variable
#   VITE_SUPABASE_ANON_KEY → Build Variable
# ─────────────────────────────────────────────────────────────────────────────

FROM node:24-slim

# corepack is Node's built-in tool for managing package managers.
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Declare build arguments for Vite frontend
# These must be available at BUILD TIME — not just runtime
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Set them as environment variables so Vite can read them during build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copy the entire monorepo into the container.
COPY . .

# Install all dependencies.
RUN pnpm install --frozen-lockfile

# Build the React frontend.
# Vite will bake VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY into the bundle
RUN pnpm --filter @workspace/everydayai run build

# Build the Express API server.
RUN pnpm --filter @workspace/api-server run build

# Move the frontend static files to where Express will serve them.
RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/everydayai/dist/public/. artifacts/api-server/public/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
