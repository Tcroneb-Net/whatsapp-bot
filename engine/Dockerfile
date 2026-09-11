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
COPY assets ./assets
RUN pnpm build && pnpm prune --prod

ENV NODE_ENV=production
ENV PORT=8080

RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
USER app

EXPOSE 8080

CMD ["pnpm", "start"]
