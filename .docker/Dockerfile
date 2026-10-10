# ---- Stage 1: build the React/Vite client ----
FROM node:24-alpine AS clientbuilder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: install production server deps ----
FROM node:24-alpine AS serverbuilder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: assemble the final runtime image ----
FROM node:24-alpine
WORKDIR /app

# Same runtime hardening as Dockerfile.multiarch: apply Alpine security
# fixes, keep curl for the healthcheck, and remove npm/npx/corepack/yarn,
# which the server never uses (their bundled deps carried every Node.js CVE
# in the v1.8.1 scan). See docs/IMAGE_CVE_REVIEW.md.
RUN apk upgrade --no-cache \
    && apk add --no-cache curl \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

# server code + production node_modules
COPY --from=serverbuilder /app/node_modules ./node_modules
COPY package*.json ./
COPY CHANGELOG.md ./
COPY server.js api.js Socket.js Sockets.js ./
COPY controllers ./controllers
COPY db ./db
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY utils ./utils

# built client assets => /app/public
COPY --from=clientbuilder /app/client/dist ./public

ENV NODE_ENV=production

RUN mkdir -p /app/data /app/log \
    && chown -R node:node /app/data /app/log /app/public

USER node

EXPOSE 5005

HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
    CMD curl -fs http://localhost:5005/health || exit 1

CMD ["node", "server.js"]
