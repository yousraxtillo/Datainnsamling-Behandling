FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat && corepack enable

# Copy web directory
COPY web ./web

# Install dependencies using pnpm
RUN cd web && pnpm install --frozen-lockfile

# Build the application
RUN cd web && pnpm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "cd web && pnpm start"]
