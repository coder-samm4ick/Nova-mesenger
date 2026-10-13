# Docker-образ бэкенда Nova (REST + WebSocket).
#
# Собирается из корня репозитория:
#   docker build -f apps/server/Dockerfile -t nova-server .
#
# Модуль apps/server самодостаточен, поэтому в образ попадает только он.

# ---------- сборка ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/server/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/server/tsconfig.json ./
COPY apps/server/src ./src
RUN npm run build

# ---------- запуск ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
EXPOSE 8081
CMD ["node", "dist/index.js"]
