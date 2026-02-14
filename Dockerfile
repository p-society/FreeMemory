FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Run migrations then start the server
EXPOSE 3000
CMD ["sh", "-c", "bun src/db/migrate.ts && bun index.ts"]
