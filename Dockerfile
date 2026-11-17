# Production image for the adapter-node build. Data lives in the /app/data bind mount.
FROM node:26.13.0-bookworm-slim AS base
# Node 26 no longer bundles corepack.
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
# Env validation requires DATABASE_URL while building; the build only uses a mock database
# and the real value is read at startup.
RUN DATABASE_URL=file:unused-at-build.db pnpm build

FROM base AS deps
RUN pnpm install --prod --frozen-lockfile

FROM node:26.13.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Applied on startup by the app itself.
COPY drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "build"]
