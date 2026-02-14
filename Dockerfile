# RadCase Production Dockerfile
# Multi-stage build for security and optimization

FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S radcase -u 1001

# Set up directories with proper permissions
RUN mkdir -p uploads thumbnails dicom && \
    chown -R radcase:nodejs uploads thumbnails dicom

# Production image
FROM node:22-alpine AS runner

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    vips-dev \
    sqlite

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S radcase -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=radcase:nodejs /app ./

# Install health check dependencies
RUN npm install --save-dev curl

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Security: Run as non-root
USER radcase

# Expose port
EXPOSE 3001

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]