# ==========================================
# Family Chores RPG — Dockerfile
# Сборка:  docker compose build
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Установка зависимостей (кэшируется отдельным слоем)
COPY package*.json ./
RUN npm ci

# Копирование исходников (node_modules/dist/.env исключены через .dockerignore)
COPY . .

# Сборка: Vite (frontend) + esbuild (server → dist/server.cjs)
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
