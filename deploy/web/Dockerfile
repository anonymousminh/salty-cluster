# One image for the browser side: the 3D game at / and the organizer console at /console/.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/venue/package.json packages/venue/
COPY apps/web/package.json apps/web/
COPY apps/console/package.json apps/console/
RUN pnpm install --frozen-lockfile --filter @meetspace/web... --filter @meetspace/console...
COPY packages/venue packages/venue
COPY apps/web apps/web
COPY apps/console apps/console
ARG VITE_DASH0_ENDPOINT
ARG VITE_DASH0_AUTH_TOKEN
ARG VITE_DASH0_DATASET
RUN pnpm --filter @meetspace/web build && pnpm --filter @meetspace/console build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY --from=build /app/apps/console/dist /usr/share/nginx/html/console
EXPOSE 8080
