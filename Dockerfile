FROM node:20-alpine

# Create non-root user for security
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/
COPY migrate.js ./

# Set ownership
RUN chown -R botuser:botgroup /app

USER botuser

EXPOSE 3000

CMD ["node", "src/app.js"]
