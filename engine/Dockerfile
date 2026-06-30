FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install dependencies first (better layer caching)
COPY package.json ./
RUN pnpm install --prod=false

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["pnpm", "start"]
