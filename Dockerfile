# ─────────────────────────────────────────────────────────────────────────────
# EverydayAI — production Docker image
#
# What Docker is doing here, step by step:
#   1. Start from an official Node 24 image (a clean Linux machine with Node)
#   2. Enable pnpm (the package manager this project uses)
#   3. Copy the source code into the container
#   4. Install all dependencies
#   5. Build the frontend (React → static HTML/CSS/JS files)
#   6. Build the API server (TypeScript → bundled Node.js file)
#   7. Move the frontend files to where the server will serve them
#   8. Tell the container: "when you start, run this command"
#
# Multi-stage builds (builder → runner) keep the final image small by throwing
# away all the build tools after compilation. We use single-stage here because
# pnpm uses symlinked node_modules — copying them across stages breaks symlinks.
# The image is larger but guaranteed to work correctly.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:24-slim

# corepack is Node's built-in tool for managing package managers.
# This activates pnpm without installing it separately.
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy the entire monorepo into the container.
# .dockerignore (sibling file) tells Docker what to SKIP — things like
# your local node_modules, .env files, and editor configs.
COPY . .

# Install all dependencies.
# --frozen-lockfile means "use exactly what's in pnpm-lock.yaml, don't
# resolve anything new." This makes builds reproducible.
RUN pnpm install --frozen-lockfile

# Build the React frontend.
# Output goes to: artifacts/everydayai/dist/public/
RUN pnpm --filter @workspace/everydayai run build

# Build the Express API server.
# esbuild bundles TypeScript → artifacts/api-server/dist/index.mjs (one file, 3.9MB)
RUN pnpm --filter @workspace/api-server run build

# Move the frontend static files to where Express will serve them.
# The server looks for static files at: artifacts/api-server/public/
# (configured in app.ts: express.static(join(__dirname, "../public")))
RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/everydayai/dist/public/. artifacts/api-server/public/

# Tell Railway (and any Docker host) that this container listens on port 8080.
# Railway injects PORT automatically — the server reads process.env.PORT.
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# The command Docker runs when the container starts.
# --enable-source-maps makes stack traces show original TypeScript line numbers.
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
