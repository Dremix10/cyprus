FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

RUN npm run build

FROM node:20-slim

# Runtime deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN npm install --omit=dev

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/server/dist/index.js"]
