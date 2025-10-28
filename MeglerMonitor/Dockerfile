FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copy web directory
COPY web ./web

# Install dependencies
RUN cd web && npm install

# Build the application
RUN cd web && npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "cd web && npm start"]
