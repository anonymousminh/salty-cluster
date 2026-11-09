FROM node:22-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
# Workspace manifests first, for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/venue/package.json packages/venue/
COPY packages/telemetry/package.json packages/telemetry/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @meetspace/api...
COPY packages/venue packages/venue
COPY packages/telemetry packages/telemetry
COPY apps/api apps/api
COPY elastic elastic
ENV NODE_ENV=production
USER node
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
