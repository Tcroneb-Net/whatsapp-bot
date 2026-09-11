FROM node:20-slim

WORKDIR /app

# Install pnpm without Corepack's unwritable cache path.
RUN npm install --global pnpm@9.15.5

# Install dependencies first (better layer caching), using the committed lockfile.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

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
