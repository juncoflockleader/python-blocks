# The Python Blocks server: the app built with Vite, served by a small Node server (server/) with
# SQLite on a volume at /data. Node runs the server's TypeScript directly, so the final image needs
# only the build, the server, the lessons (for coin rewards) and the shared limits.
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG APP_REVISION=unavailable
ENV APP_REVISION=$APP_REVISION
RUN pnpm build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data TRUST_PROXY=1 NODE_NO_WARNINGS=1
COPY --from=build /app/dist ./dist
COPY server ./server
COPY content ./content
COPY src/account/shared.ts ./src/account/shared.ts
COPY package.json ./
EXPOSE 8080
CMD ["node", "server/main.ts"]
