FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat && corepack enable

COPY web/package.json web/package.json
COPY web/tsconfig.json web/tsconfig.json
COPY web/tailwind.config.ts web/tailwind.config.ts
COPY web/postcss.config.js web/postcss.config.js
COPY web/next.config.mjs web/next.config.mjs

RUN pnpm --dir web install

COPY web web

RUN pnpm --dir web build

ENV NODE_ENV=production
ENV PORT=3000

CMD ["pnpm", "--dir", "web", "start"]
