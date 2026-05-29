FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV ALDEN_DOCKER=1

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node . .
RUN mkdir -p data plugins && chown -R node:node data plugins

USER node

CMD ["pnpm", "start"]
