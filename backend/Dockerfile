# Build from repo root: docker build -f backend/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build
RUN mkdir -p dist/migrations && cp -R src/migrations/sql dist/migrations/sql

FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY landmarks-admin /app/landmarks-admin
EXPOSE 3000
CMD ["sh", "-c", "node dist/db/runMigrate.js && node dist/index.js"]
