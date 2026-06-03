# ---- Stage 1: build the React/Vite client ----
FROM node:22-alpine AS clientbuilder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: install production server deps ----
FROM node:22-alpine AS serverbuilder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: assemble the final runtime image ----
FROM node:22-alpine
WORKDIR /app

# runtime OS deps
RUN apk add --no-cache curl jq sqlite

# server code + production node_modules
COPY --from=serverbuilder /app/node_modules ./node_modules
COPY package*.json ./
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
